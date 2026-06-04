"""
Cookie management for yt-dlp YouTube authentication.

Loads YouTube cookies from environment variables or mounted files,
validates the Netscape cookie format, and provides hot-reload
capability so cookies can be updated in Render without redeploying.

Security:
    - Cookie file written with 0600 permissions
    - Cookie contents never logged
    - File path redacted in command logs
"""

import base64
import hashlib
import logging
import os
import stat
import time
from typing import Optional

logger = logging.getLogger(__name__)

# Where the cookie file lives on disk
COOKIE_FILE_PATH = "/tmp/youtube_cookies.txt"

# How often (seconds) to re-check the env var for changes
_RELOAD_INTERVAL = 60

# Minimum number of lines a valid cookie file should have
_MIN_COOKIE_LINES = 3


class CookieManager:
    """
    Manages YouTube cookie lifecycle for yt-dlp.

    Loading priority:
        1. YOUTUBE_COOKIES env var (raw or base64-encoded Netscape cookie text)
        2. YOUTUBE_COOKIES_FILE env var (path to a mounted cookie file)
        3. Pre-existing file at /tmp/youtube_cookies.txt

    The manager caches a hash of the env var content and only re-writes
    the file when the content actually changes, avoiding unnecessary I/O.
    """

    def __init__(self) -> None:
        self._last_env_hash: Optional[str] = None
        self._last_check_time: float = 0.0
        self._cookies_loaded: bool = False
        self._load_source: Optional[str] = None

        # Initial load
        self._load_cookies()

    # ── Public API ────────────────────────────────────────────────

    def get_cookie_path(self) -> Optional[str]:
        """
        Return the path to a valid cookie file, or None.

        Performs a hot-reload check if the reload interval has elapsed.
        """
        now = time.time()
        if now - self._last_check_time > _RELOAD_INTERVAL:
            self._load_cookies()

        if self._cookies_loaded and os.path.isfile(COOKIE_FILE_PATH):
            return COOKIE_FILE_PATH

        return None

    def get_status(self) -> dict:
        """Return a status dict suitable for the health endpoint."""
        path = self.get_cookie_path()
        return {
            "cookies_loaded": self._cookies_loaded,
            "cookie_source": self._load_source,
            "cookie_file_exists": os.path.isfile(COOKIE_FILE_PATH),
            "cookie_file_valid": path is not None,
        }

    def force_reload(self) -> bool:
        """Force an immediate reload from env. Returns True if cookies loaded."""
        self._last_check_time = 0.0
        self._load_cookies()
        return self._cookies_loaded

    # ── Internal ──────────────────────────────────────────────────

    def _load_cookies(self) -> None:
        """Attempt to load cookies from all sources in priority order."""
        self._last_check_time = time.time()

        # Priority 1: YOUTUBE_COOKIES env var (inline cookie text)
        env_content = os.environ.get("YOUTUBE_COOKIES", "").strip()
        if env_content:
            content = self._decode_content(env_content)
            if content and self._validate_cookie_content(content):
                content_hash = hashlib.sha256(content.encode()).hexdigest()[:16]
                if content_hash != self._last_env_hash:
                    self._write_cookie_file(content)
                    self._last_env_hash = content_hash
                    logger.info("Cookies loaded from YOUTUBE_COOKIES env var")
                self._cookies_loaded = True
                self._load_source = "env:YOUTUBE_COOKIES"
                return

        # Priority 2: YOUTUBE_COOKIES_FILE env var (path to mounted file)
        env_file_path = os.environ.get("YOUTUBE_COOKIES_FILE", "").strip()
        if env_file_path and os.path.isfile(env_file_path):
            try:
                with open(env_file_path, "r") as f:
                    content = f.read()
                if self._validate_cookie_content(content):
                    self._write_cookie_file(content)
                    self._cookies_loaded = True
                    self._load_source = f"file:{env_file_path}"
                    logger.info(f"Cookies loaded from file: {env_file_path}")
                    return
            except OSError as e:
                logger.warning(f"Failed to read cookie file at {env_file_path}: {e}")

        # Priority 3: Pre-existing file at default path
        if os.path.isfile(COOKIE_FILE_PATH):
            try:
                with open(COOKIE_FILE_PATH, "r") as f:
                    content = f.read()
                if self._validate_cookie_content(content):
                    self._cookies_loaded = True
                    self._load_source = "file:existing"
                    logger.info("Using pre-existing cookie file at default path")
                    return
            except OSError:
                pass

        # No cookies available
        if self._cookies_loaded:
            logger.warning("Previously loaded cookies are no longer available")
        self._cookies_loaded = False
        self._load_source = None

    def _decode_content(self, raw: str) -> Optional[str]:
        """
        Decode cookie content — supports raw Netscape text or base64-encoded.
        """
        # If it looks like a Netscape cookie file, use as-is
        if raw.startswith("# Netscape") or raw.startswith("# HTTP Cookie") or "\t" in raw.split("\n")[0]:
            return raw

        # Try base64 decode
        try:
            decoded = base64.b64decode(raw).decode("utf-8")
            if "\t" in decoded:  # Tab-separated = likely Netscape format
                return decoded
        except Exception:
            pass

        # Might be raw cookie lines without the header — add header
        if "\t" in raw:
            return f"# Netscape HTTP Cookie File\n{raw}"

        logger.warning("YOUTUBE_COOKIES env var is not in recognized format")
        return None

    def _validate_cookie_content(self, content: str) -> bool:
        """
        Basic validation that cookie content looks like a Netscape cookie file.
        """
        if not content or not content.strip():
            return False

        lines = [l.strip() for l in content.strip().splitlines() if l.strip() and not l.strip().startswith("#")]
        if len(lines) < 1:
            logger.warning("Cookie file has no data lines")
            return False

        # Check that at least one line has tab-separated fields
        # and references a YouTube domain
        has_youtube = False
        has_valid_format = False
        for line in lines:
            parts = line.split("\t")
            if len(parts) >= 6:
                has_valid_format = True
                domain = parts[0].lower()
                if "youtube" in domain or "google" in domain:
                    has_youtube = True

        if not has_valid_format:
            logger.warning("Cookie file has no valid tab-separated entries")
            return False

        if not has_youtube:
            logger.warning("Cookie file has no YouTube/Google domain entries")
            return False

        return True

    def _write_cookie_file(self, content: str) -> None:
        """Write cookie content to disk with restrictive permissions."""
        try:
            # Write to temp file first, then rename (atomic on same filesystem)
            tmp_path = COOKIE_FILE_PATH + ".tmp"
            with open(tmp_path, "w") as f:
                f.write(content.strip())
                f.write("\n")

            # Set restrictive permissions before moving into place
            os.chmod(tmp_path, stat.S_IRUSR | stat.S_IWUSR)  # 0600

            os.replace(tmp_path, COOKIE_FILE_PATH)
        except OSError as e:
            logger.error(f"Failed to write cookie file: {e}")
            # Clean up temp file on failure
            try:
                os.remove(tmp_path)
            except OSError:
                pass


# ── Module-level singleton ────────────────────────────────────────
cookie_manager = CookieManager()
