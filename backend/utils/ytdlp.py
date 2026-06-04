"""
yt-dlp extraction engine with multi-strategy fallback.

All interactions with yt-dlp go through this module using subprocess calls
for maximum reliability and process isolation.

Strategy pipeline:
    1. ios + cookies       (most reliable as of mid-2026)
    2. android + cookies
    3. web + cookies
    4. ios (no cookies)
    5. android (no cookies)
    6. mweb (no cookies)

Each strategy includes a realistic User-Agent and extractor args.
On bot-detection errors, the pipeline advances to the next strategy.
On transient errors, the same strategy is retried once.
"""

import json
import logging
import os
import re
import subprocess
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Optional

from utils.cookies import cookie_manager

logger = logging.getLogger(__name__)

# ── Configuration ─────────────────────────────────────────────────

TEMP_DIR = "/tmp"
TEMP_PREFIX = "tubeheist_"

# Timeout constants (seconds)
INFO_TIMEOUT = 45
DOWNLOAD_TIMEOUT = 600  # 10 min for large/high-quality videos
STRATEGY_TIMEOUT = 30   # per-strategy attempt for info extraction

# Backoff between retries (seconds)
RETRY_BACKOFF = 2

# URL validation
YOUTUBE_URL_PATTERN = re.compile(
    r"^(https?://)?(www\.)?"
    r"(youtube\.com/(watch\?v=|shorts/|embed/|v/)|youtu\.be/)"
    r"[a-zA-Z0-9_-]{11}"
)

# Patterns that indicate bot detection (advance to next strategy)
BOT_DETECTION_PATTERNS = [
    "Sign in to confirm",
    "confirm you're not a bot",
    "bot",
    "This helps protect our community",
    "consent",
    "accounts.google.com",
    "HTTP Error 403",
    "HTTP Error 429",
]

# Patterns that indicate transient errors (retry same strategy)
TRANSIENT_ERROR_PATTERNS = [
    "timed out",
    "Connection reset",
    "Connection refused",
    "Network is unreachable",
    "Temporary failure",
    "urlopen error",
    "incomplete read",
    "SSL",
]

# ── User-Agent Strings ────────────────────────────────────────────

_UA_IOS_SAFARI = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) "
    "Version/17.5 Mobile/15E148 Safari/604.1"
)

_UA_ANDROID_CHROME = (
    "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/125.0.6422.165 Mobile Safari/537.36"
)

_UA_DESKTOP_CHROME = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/125.0.0.0 Safari/537.36"
)

_UA_MOBILE_CHROME = (
    "Mozilla/5.0 (Linux; Android 13; SM-G991B) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/125.0.6422.165 Mobile Safari/537.36"
)


# ── Extraction Strategies ─────────────────────────────────────────

@dataclass
class ExtractionStrategy:
    """A single yt-dlp extraction configuration to try."""
    name: str
    player_client: str
    user_agent: str
    use_cookies: bool = True
    extra_args: list[str] = field(default_factory=list)


def _build_strategies() -> list[ExtractionStrategy]:
    """
    Build the ordered list of extraction strategies.

    Key insight: YouTube's bot detection triggers on the *webpage* fetch,
    NOT on the player API call. By using player_skip=webpage, we bypass
    the bot challenge entirely and go straight to the innertube API.

    Strategies with cookies come first (more likely to succeed).
    Each strategy uses player_skip=webpage,configs to avoid the webpage.
    """
    strategies = []

    has_cookies = cookie_manager.get_cookie_path() is not None

    # --- With cookies (if available) ---
    if has_cookies:
        strategies.extend([
            ExtractionStrategy(
                name="ios_cookies",
                player_client="ios",
                user_agent=_UA_IOS_SAFARI,
                use_cookies=True,
            ),
            ExtractionStrategy(
                name="web_creator_cookies",
                player_client="web_creator",
                user_agent=_UA_DESKTOP_CHROME,
                use_cookies=True,
            ),
            ExtractionStrategy(
                name="android_cookies",
                player_client="android",
                user_agent=_UA_ANDROID_CHROME,
                use_cookies=True,
            ),
            ExtractionStrategy(
                name="web_cookies",
                player_client="web",
                user_agent=_UA_DESKTOP_CHROME,
                use_cookies=True,
            ),
        ])

    # --- Without cookies (player_skip=webpage is critical here) ---
    strategies.extend([
        ExtractionStrategy(
            name="ios_nocookies",
            player_client="ios",
            user_agent=_UA_IOS_SAFARI,
            use_cookies=False,
        ),
        ExtractionStrategy(
            name="web_creator_nocookies",
            player_client="web_creator",
            user_agent=_UA_DESKTOP_CHROME,
            use_cookies=False,
        ),
        ExtractionStrategy(
            name="android_nocookies",
            player_client="android",
            user_agent=_UA_ANDROID_CHROME,
            use_cookies=False,
        ),
        ExtractionStrategy(
            name="tv_embedded_nocookies",
            player_client="tv_embedded",
            user_agent=_UA_DESKTOP_CHROME,
            use_cookies=False,
        ),
        ExtractionStrategy(
            name="mweb_nocookies",
            player_client="mweb",
            user_agent=_UA_MOBILE_CHROME,
            use_cookies=False,
        ),
    ])

    return strategies


# ── Core yt-dlp Command Builder ───────────────────────────────────

def _build_base_cmd(strategy: ExtractionStrategy) -> list[str]:
    """
    Build the base yt-dlp command with all common flags
    and the strategy-specific options.
    """
    # player_skip=webpage is THE critical flag — it tells yt-dlp to skip
    # fetching the video webpage (where YouTube does bot detection) and
    # go directly to the innertube player API.
    extractor_args = (
        f"youtube:player_client={strategy.player_client};"
        f"player_skip=webpage,configs"
    )

    cmd = [
        "yt-dlp",
        "-4",                     # force IPv4 (avoids IPv6 issues on servers)
        "--no-warnings",
        "--no-playlist",
        "--no-check-certificates",
        "--geo-bypass",
        "--socket-timeout", "20",
        "--retries", "3",
        "--fragment-retries", "10",
        "--extractor-args", extractor_args,
        "--user-agent", strategy.user_agent,
        "--referer", "https://www.youtube.com/",
        "--add-headers", "Accept-Language:en-US,en;q=0.9",
    ]

    # Cookies
    if strategy.use_cookies:
        cookie_path = cookie_manager.get_cookie_path()
        if cookie_path:
            cmd.extend(["--cookies", cookie_path])

    # Proxy support (Tier 3 scaffolding)
    proxy_url = os.environ.get("PROXY_URL", "").strip()
    if proxy_url:
        cmd.extend(["--proxy", proxy_url])

    # Strategy-specific extra args
    cmd.extend(strategy.extra_args)

    return cmd


def _sanitize_cmd_for_log(cmd: list[str]) -> str:
    """Redact sensitive args (cookie paths, proxy URLs) from command logs."""
    sanitized = []
    skip_next = False
    for i, arg in enumerate(cmd):
        if skip_next:
            sanitized.append("[REDACTED]")
            skip_next = False
            continue
        if arg in ("--cookies", "--proxy"):
            sanitized.append(arg)
            skip_next = True
            continue
        sanitized.append(arg)
    return " ".join(sanitized)


def _classify_error(stderr: str) -> str:
    """
    Classify a yt-dlp error as 'bot', 'transient', or 'fatal'.
    This determines whether to try the next strategy, retry, or give up.
    """
    stderr_lower = stderr.lower()

    for pattern in BOT_DETECTION_PATTERNS:
        if pattern.lower() in stderr_lower:
            return "bot"

    for pattern in TRANSIENT_ERROR_PATTERNS:
        if pattern.lower() in stderr_lower:
            return "transient"

    return "fatal"


def _parse_user_friendly_error(stderr: str) -> str:
    """Convert yt-dlp stderr into a user-friendly error message."""
    if "Video unavailable" in stderr or "is not available" in stderr:
        return "This video is unavailable or has been removed."
    if "age" in stderr.lower() and "restrict" in stderr.lower():
        return "This video is age-restricted and cannot be accessed."
    if "Private video" in stderr:
        return "This video is private and cannot be accessed."
    if "geo" in stderr.lower() or "region" in stderr.lower():
        return "This video is region-locked and not available in the server's location."
    if "Sign in" in stderr:
        return "YouTube is requiring authentication. The server is retrying with different strategies."
    return f"Extraction failed: {stderr[:200]}"


# ── Public API ────────────────────────────────────────────────────

def validate_url(url: str) -> bool:
    """Check if the URL looks like a valid YouTube link."""
    if not url or not isinstance(url, str):
        return False
    return bool(YOUTUBE_URL_PATTERN.match(url.strip()))


def extract_video_id(url: str) -> Optional[str]:
    """Extract the 11-character YouTube video ID from a URL."""
    patterns = [
        r"(?:v=|/v/|youtu\.be/|/embed/|/shorts/)([a-zA-Z0-9_-]{11})",
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None


def get_video_info(url: str) -> dict[str, Any]:
    """
    Extract video metadata using the multi-strategy pipeline.

    Tries each extraction strategy in order. On bot-detection errors,
    advances to the next strategy. On transient errors, retries once.

    Returns a dict matching the frontend VideoInfo interface:
    {
        "title": str,
        "author": str,
        "thumbnailUrl": str,
        "videoId": str,
        "originalUrl": str,
        "duration": int
    }

    Raises ValueError on total extraction failure.
    """
    url = url.strip()
    if not validate_url(url):
        raise ValueError("Invalid YouTube URL format")

    strategies = _build_strategies()
    last_error = ""
    attempts_log = []

    for strategy in strategies:
        for attempt in range(1, 3):  # max 2 attempts per strategy
            try:
                result = _run_info_extraction(url, strategy)
                logger.info(
                    f"Info extraction succeeded: strategy={strategy.name}, "
                    f"attempt={attempt}, url={url[:60]}"
                )
                return result

            except _BotDetectedError as e:
                logger.warning(
                    f"Bot detected: strategy={strategy.name}, attempt={attempt} — {e}"
                )
                last_error = str(e)
                attempts_log.append(f"{strategy.name}:bot")
                break  # Move to next strategy

            except _TransientError as e:
                logger.warning(
                    f"Transient error: strategy={strategy.name}, attempt={attempt} — {e}"
                )
                last_error = str(e)
                attempts_log.append(f"{strategy.name}:transient:{attempt}")
                if attempt < 2:
                    time.sleep(RETRY_BACKOFF * attempt)
                    continue
                break  # Max retries for this strategy

            except _FatalExtractionError as e:
                logger.error(
                    f"Fatal error: strategy={strategy.name} — {e}"
                )
                # Fatal errors are video-specific, not strategy-specific
                raise ValueError(str(e))

            except subprocess.TimeoutExpired:
                logger.warning(
                    f"Timeout: strategy={strategy.name}, attempt={attempt}"
                )
                attempts_log.append(f"{strategy.name}:timeout:{attempt}")
                if attempt < 2:
                    time.sleep(RETRY_BACKOFF)
                    continue
                break

    # All strategies exhausted
    logger.error(
        f"All extraction strategies failed for {url[:60]}. "
        f"Attempts: {', '.join(attempts_log)}"
    )
    raise ValueError(
        "YouTube is currently blocking this request. "
        "All extraction strategies have been exhausted. "
        "Please try again later or ensure cookies are configured."
    )


def download_video(
    url: str,
    quality: str = "1080",
    is_audio_only: bool = False,
    audio_format: str = "mp3",
    enable_quality_fallback: bool = True,
) -> dict[str, str]:
    """
    Download a video/audio using the multi-strategy pipeline.

    If the requested quality fails and enable_quality_fallback is True,
    automatically retries at progressively lower qualities.

    Returns:
    {
        "file_id": str,
        "filepath": str,
        "filename": str,
        "content_type": str,
        "extension": str
    }

    Raises ValueError on total download failure.
    """
    url = url.strip()
    if not validate_url(url):
        raise ValueError("Invalid YouTube URL format")

    # Quality degradation chain
    if is_audio_only:
        quality_chain = [quality]  # No degradation for audio
    elif enable_quality_fallback:
        quality_chain = _build_quality_chain(quality)
    else:
        quality_chain = [quality]

    last_error = ""

    for q in quality_chain:
        try:
            result = _run_download(url, q, is_audio_only, audio_format)
            if q != quality:
                logger.info(f"Download succeeded at fallback quality {q}p (requested {quality}p)")
            return result

        except _BotDetectedError as e:
            last_error = str(e)
            logger.warning(f"Bot detected during download at quality={q} — trying next quality")
            continue

        except _TransientError as e:
            last_error = str(e)
            logger.warning(f"Transient error during download at quality={q} — trying next quality")
            continue

        except _FatalExtractionError as e:
            raise ValueError(str(e))

    raise ValueError(
        f"Download failed after trying all quality levels. Last error: {last_error[:200]}"
    )


# ── Format Selection ──────────────────────────────────────────────

def build_format_selector(
    quality: str = "1080",
    is_audio_only: bool = False,
    audio_format: str = "mp3",
) -> tuple[list[str], str]:
    """
    Build yt-dlp command-line arguments for format selection.
    Returns (extra_args: list[str], expected_extension: str)
    """
    if is_audio_only:
        ext_map = {
            "mp3": "mp3",
            "wav": "wav",
            "aac": "m4a",
            "opus": "opus",
            "ogg": "ogg",
        }
        ext = ext_map.get(audio_format, "mp3")
        args = [
            "-f", "bestaudio/best",
            "--extract-audio",
            "--audio-format", audio_format,
            "--audio-quality", "0",
        ]
        return args, ext

    quality_map = {
        "max":  "bestvideo+bestaudio/best",
        "2160": "bestvideo[height<=2160]+bestaudio/best[height<=2160]",
        "1440": "bestvideo[height<=1440]+bestaudio/best[height<=1440]",
        "1080": "bestvideo[height<=1080]+bestaudio/best[height<=1080]",
        "720":  "bestvideo[height<=720]+bestaudio/best[height<=720]",
        "480":  "bestvideo[height<=480]+bestaudio/best[height<=480]",
        "360":  "bestvideo[height<=360]+bestaudio/best[height<=360]",
        "240":  "bestvideo[height<=240]+bestaudio/best[height<=240]",
        "144":  "bestvideo[height<=144]+bestaudio/best[height<=144]",
    }

    format_selector = quality_map.get(quality, quality_map["1080"])
    args = [
        "-f", format_selector,
        "--merge-output-format", "mp4",
    ]
    return args, "mp4"


# ── Internal Execution ────────────────────────────────────────────

class _BotDetectedError(Exception):
    """YouTube returned a bot/sign-in challenge."""

class _TransientError(Exception):
    """Network or temporary error — worth retrying."""

class _FatalExtractionError(Exception):
    """Video-specific error — retrying won't help."""


def _run_info_extraction(url: str, strategy: ExtractionStrategy) -> dict[str, Any]:
    """Run a single info extraction attempt with the given strategy."""
    cmd = _build_base_cmd(strategy)
    cmd.extend(["-J", url])

    logger.debug(f"Running info: {_sanitize_cmd_for_log(cmd)}")

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=STRATEGY_TIMEOUT,
        )
    except FileNotFoundError:
        raise RuntimeError("yt-dlp is not installed or not found in PATH")

    if result.returncode != 0:
        stderr = result.stderr.strip()
        error_class = _classify_error(stderr)

        if error_class == "bot":
            raise _BotDetectedError(_parse_user_friendly_error(stderr))
        elif error_class == "transient":
            raise _TransientError(stderr[:200])
        else:
            raise _FatalExtractionError(_parse_user_friendly_error(stderr))

    try:
        data = json.loads(result.stdout)
    except json.JSONDecodeError:
        raise _FatalExtractionError("yt-dlp returned invalid JSON data.")

    video_id = data.get("id") or extract_video_id(url) or ""
    thumbnail = data.get("thumbnail", "")
    if not thumbnail and video_id:
        thumbnail = f"https://img.youtube.com/vi/{video_id}/maxresdefault.jpg"

    return {
        "title": data.get("title", f"YouTube Video ({video_id})"),
        "author": data.get("uploader", data.get("channel", "YouTube Creator")),
        "thumbnailUrl": thumbnail,
        "videoId": video_id,
        "originalUrl": url,
        "duration": data.get("duration", 0),
    }


def _run_download(
    url: str,
    quality: str,
    is_audio_only: bool,
    audio_format: str,
) -> dict[str, str]:
    """
    Run the full download pipeline for a single quality level.
    Tries all strategies in order.
    """
    format_args, ext = build_format_selector(quality, is_audio_only, audio_format)
    strategies = _build_strategies()
    last_error = ""
    attempts_log = []

    for strategy in strategies:
        file_id = uuid.uuid4().hex[:16]
        output_path = os.path.join(TEMP_DIR, f"{TEMP_PREFIX}{file_id}.{ext}")

        cmd = _build_base_cmd(strategy)
        cmd.extend(format_args)
        cmd.extend([
            "--no-overwrites",
            "-o", output_path,
            url,
        ])

        logger.info(
            f"Download attempt: strategy={strategy.name}, quality={quality}, "
            f"audio_only={is_audio_only}"
        )
        logger.debug(f"Running download: {_sanitize_cmd_for_log(cmd)}")

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=DOWNLOAD_TIMEOUT,
            )
        except subprocess.TimeoutExpired:
            _safe_remove(output_path)
            attempts_log.append(f"{strategy.name}:timeout")
            last_error = "Download timed out"
            continue
        except FileNotFoundError:
            raise RuntimeError("yt-dlp is not installed or not found in PATH")

        if result.returncode != 0:
            _safe_remove(output_path)
            stderr = result.stderr.strip()
            error_class = _classify_error(stderr)
            attempts_log.append(f"{strategy.name}:{error_class}")

            if error_class == "bot":
                last_error = stderr[:200]
                continue  # Next strategy
            elif error_class == "transient":
                last_error = stderr[:200]
                continue
            else:
                raise _FatalExtractionError(_parse_user_friendly_error(stderr))

        # Success — find the actual output file
        actual_path = _find_output_file(output_path, file_id)
        if not actual_path:
            attempts_log.append(f"{strategy.name}:no_file")
            last_error = "Download completed but output file was not found"
            continue

        actual_ext = os.path.splitext(actual_path)[1].lstrip(".")

        # MIME types
        mime_map = {
            "mp4": "video/mp4",
            "webm": "video/webm",
            "mkv": "video/x-matroska",
            "mp3": "audio/mpeg",
            "wav": "audio/wav",
            "m4a": "audio/mp4",
            "opus": "audio/opus",
            "ogg": "audio/ogg",
        }

        safe_title = f"tubeheist_{file_id}"
        filename = f"{safe_title}.{actual_ext}"

        logger.info(
            f"Download complete: strategy={strategy.name}, file_id={file_id}, "
            f"size={os.path.getsize(actual_path)} bytes"
        )

        return {
            "file_id": file_id,
            "filepath": actual_path,
            "filename": filename,
            "content_type": mime_map.get(actual_ext, "application/octet-stream"),
            "extension": actual_ext,
        }

    # All strategies failed for this quality
    logger.error(
        f"All download strategies failed at quality={quality}. "
        f"Attempts: {', '.join(attempts_log)}"
    )
    raise _BotDetectedError(
        f"Download blocked at quality {quality}. Last error: {last_error[:200]}"
    )


def _build_quality_chain(requested: str) -> list[str]:
    """Build a degradation chain from the requested quality down."""
    all_qualities = ["2160", "1440", "1080", "720", "480", "360"]
    requested = requested.strip()

    if requested == "max":
        return ["max", "1080", "720", "480", "360"]

    if requested in all_qualities:
        idx = all_qualities.index(requested)
        return all_qualities[idx:]

    # Unknown quality — try as-is then fallback chain
    return [requested, "720", "480", "360"]


# ── File Utilities ────────────────────────────────────────────────

def _find_output_file(expected_path: str, file_id: str) -> Optional[str]:
    """Find the actual output file, accounting for yt-dlp extension changes."""
    if os.path.isfile(expected_path):
        return expected_path

    import glob
    pattern = os.path.join(TEMP_DIR, f"{TEMP_PREFIX}{file_id}.*")
    matches = glob.glob(pattern)
    if matches:
        return matches[0]

    return None


def _safe_remove(path: str) -> None:
    """Safely remove a file, ignoring errors."""
    try:
        if os.path.exists(path):
            os.remove(path)
    except OSError:
        pass
