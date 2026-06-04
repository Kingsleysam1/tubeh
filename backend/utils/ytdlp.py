"""
yt-dlp subprocess wrapper.
All interactions with yt-dlp go through this module using subprocess calls
for maximum reliability and process isolation.
"""

import json
import logging
import os
import re
import subprocess
import uuid
from typing import Any, Optional

logger = logging.getLogger(__name__)

# --- COOKIE SETUP ---
COOKIE_FILE = "/tmp/youtube_cookies.txt"
_cookies_content = os.environ.get("YOUTUBE_COOKIES")
if _cookies_content:
    try:
        with open(COOKIE_FILE, "w") as f:
            f.write(_cookies_content.strip())
            # Ensure it ends with newline
            f.write("\n")
    except Exception as e:
        logger.error(f"Failed to write cookies file: {e}")
# --------------------

TEMP_DIR = "/tmp"
TEMP_PREFIX = "tubeheist_"

# Timeout constants
INFO_TIMEOUT = 30       # seconds for metadata extraction
DOWNLOAD_TIMEOUT = 300  # seconds for download (5 min)

# URL validation pattern for YouTube
YOUTUBE_URL_PATTERN = re.compile(
    r"^(https?://)?(www\.)?"
    r"(youtube\.com/(watch\?v=|shorts/|embed/|v/)|youtu\.be/)"
    r"[a-zA-Z0-9_-]{11}"
)


def validate_url(url: str) -> bool:
    """Check if the URL looks like a valid YouTube link."""
    if not url or not isinstance(url, str):
        return False
    url = url.strip()
    return bool(YOUTUBE_URL_PATTERN.match(url))


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
    Run yt-dlp -J to extract video metadata as JSON.
    
    Returns a dict matching the frontend VideoInfo interface:
    {
        "title": str,
        "author": str,
        "thumbnailUrl": str,
        "videoId": str,
        "originalUrl": str,
        "duration": int (seconds)
    }
    
    Raises ValueError on invalid URL or extraction failure.
    """
    url = url.strip()
    if not validate_url(url):
        raise ValueError("Invalid YouTube URL format")

    try:
        cmd = [
            "yt-dlp",
            "-4",                   # force IPv4
            "-J",                   # dump JSON
            "--no-warnings",        # suppress warnings
            "--no-playlist",        # single video only
            "--no-check-certificates",
            "--extractor-args", "youtube:player_client=android",
        ]
        if _cookies_content:
            cmd.extend(["--cookies", COOKIE_FILE])
        cmd.append(url)

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=INFO_TIMEOUT,
        )
    except subprocess.TimeoutExpired:
        raise ValueError("Video info extraction timed out. The video may be unavailable.")
    except FileNotFoundError:
        raise RuntimeError("yt-dlp is not installed or not found in PATH")

    if result.returncode != 0:
        stderr = result.stderr.strip()
        # Parse common yt-dlp errors into user-friendly messages
        if "Video unavailable" in stderr or "is not available" in stderr:
            raise ValueError("This video is unavailable or has been removed.")
        if "age" in stderr.lower() and "restrict" in stderr.lower():
            raise ValueError("This video is age-restricted and cannot be accessed.")
        if "geo" in stderr.lower() or "region" in stderr.lower() or "country" in stderr.lower():
            raise ValueError("This video is region-locked and not available in the server's location.")
        if "Private video" in stderr:
            raise ValueError("This video is private and cannot be accessed.")
        if "Sign in" in stderr:
            raise ValueError("This video requires authentication to access.")
        
        logger.error(f"yt-dlp info failed: {stderr}")
        raise ValueError(f"Failed to extract video information: {stderr[:200]}")

    try:
        data = json.loads(result.stdout)
    except json.JSONDecodeError:
        raise ValueError("yt-dlp returned invalid data for this video.")

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
        # Audio-only extraction
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
            "--audio-quality", "0",  # best quality
        ]
        return args, ext

    # Video quality mapping
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


def download_video(
    url: str,
    quality: str = "1080",
    is_audio_only: bool = False,
    audio_format: str = "mp3",
) -> dict[str, str]:
    """
    Download a video/audio using yt-dlp to a temp file.
    
    Returns:
    {
        "file_id": str (unique ID for serving),
        "filepath": str (full path to temp file),
        "filename": str (suggested download filename),
        "content_type": str (MIME type),
        "extension": str
    }
    
    Raises ValueError on download failure.
    """
    url = url.strip()
    if not validate_url(url):
        raise ValueError("Invalid YouTube URL format")

    format_args, ext = build_format_selector(quality, is_audio_only, audio_format)

    file_id = uuid.uuid4().hex[:16]
    output_path = os.path.join(TEMP_DIR, f"{TEMP_PREFIX}{file_id}.{ext}")

    cmd = [
        "yt-dlp",
        "-4",
        *format_args,
        "--no-warnings",
        "--no-playlist",
        "--no-check-certificates",
        "--no-overwrites",
        "--extractor-args", "youtube:player_client=android",
    ]
    
    if _cookies_content:
        cmd.extend(["--cookies", COOKIE_FILE])
        
    cmd.extend([
        "-o", output_path,
        url,
    ])

    logger.info(f"Starting download: {' '.join(cmd)}")

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=DOWNLOAD_TIMEOUT,
        )
    except subprocess.TimeoutExpired:
        # Attempt cleanup on timeout
        _safe_remove(output_path)
        raise ValueError("Download timed out after 5 minutes. Try a lower quality.")
    except FileNotFoundError:
        raise RuntimeError("yt-dlp is not installed or not found in PATH")

    if result.returncode != 0:
        _safe_remove(output_path)
        stderr = result.stderr.strip()
        logger.error(f"yt-dlp download failed: {stderr}")
        raise ValueError(f"Download failed: {stderr[:200]}")

    # yt-dlp may change the extension (e.g. for audio extraction)
    # Find the actual output file
    actual_path = _find_output_file(output_path, file_id)
    if not actual_path:
        raise ValueError("Download completed but output file was not found.")

    actual_ext = os.path.splitext(actual_path)[1].lstrip(".")

    # Build a clean suggested filename
    try:
        info = json.loads(
            subprocess.run(
                ["yt-dlp", "--print", "%(title)s", "--no-warnings", "--no-playlist", url],
                capture_output=True, text=True, timeout=10,
            ).stdout.strip()
        ) if False else None  # Skip this — use a simpler approach
    except Exception:
        pass

    # Simple filename from the file_id
    safe_title = f"tubeheist_{file_id}"
    filename = f"{safe_title}.{actual_ext}"

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

    return {
        "file_id": file_id,
        "filepath": actual_path,
        "filename": filename,
        "content_type": mime_map.get(actual_ext, "application/octet-stream"),
        "extension": actual_ext,
    }


def _find_output_file(expected_path: str, file_id: str) -> Optional[str]:
    """Find the actual output file, accounting for yt-dlp extension changes."""
    if os.path.isfile(expected_path):
        return expected_path

    # Search for any file matching the prefix + file_id
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
