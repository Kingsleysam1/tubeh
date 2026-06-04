"""
/api/download route — Video/audio download endpoint.
Downloads media to temp file via yt-dlp, returns a serve URL
matching the existing Cobalt-style response shape the frontend expects.
"""

import logging
import threading
from flask import Blueprint, request, jsonify

from utils.auth import require_auth
from utils.limiter import limiter
from utils.ytdlp import download_video, validate_url

logger = logging.getLogger(__name__)

download_bp = Blueprint("download", __name__)

# In-memory registry of downloaded files pending retrieval
# Maps file_id -> file metadata dict
_file_registry: dict[str, dict] = {}
_registry_lock = threading.Lock()


def register_file(file_id: str, file_meta: dict) -> None:
    """Register a downloaded file for later serving."""
    with _registry_lock:
        _file_registry[file_id] = file_meta


def get_registered_file(file_id: str) -> dict | None:
    """Retrieve file metadata by ID."""
    with _registry_lock:
        return _file_registry.get(file_id)


def remove_registered_file(file_id: str) -> None:
    """Remove a file from the registry."""
    with _registry_lock:
        _file_registry.pop(file_id, None)


@download_bp.route("/api/download", methods=["POST"])
@limiter.limit("10 per minute")
def download():
    """
    Download a YouTube video/audio.
    
    POST /api/download
    {
        "url": "https://youtube.com/...",
        "videoQuality": "1080",        // optional, default "1080"
        "audioFormat": "mp3",          // optional, default "mp3"
        "isAudioOnly": false           // optional, default false
    }
    
    Returns Cobalt-compatible response:
    {
        "status": "redirect",
        "url": "/api/serve/<file_id>"
    }
    """
    body = request.get_json(silent=True) or {}
    url = body.get("url", "").strip()

    if not url:
        return jsonify({
            "status": "error",
            "error": "A valid URL is required",
        }), 400

    if not validate_url(url):
        return jsonify({
            "status": "error",
            "error": "This is not a recognized YouTube video link",
        }), 400

    quality = body.get("videoQuality", "1080")
    audio_format = body.get("audioFormat", "mp3")
    is_audio_only = body.get("isAudioOnly", False)

    # Normalize quality value
    if isinstance(quality, str):
        quality = quality.strip()
    if not quality:
        quality = "1080"

    try:
        file_meta = download_video(
            url=url,
            quality=quality,
            is_audio_only=is_audio_only,
            audio_format=audio_format,
            enable_quality_fallback=True,
        )

        # Register file for serving
        register_file(file_meta["file_id"], file_meta)

        serve_url = f"/api/serve/{file_meta['file_id']}"

        logger.info(f"Download complete: {file_meta['file_id']} -> {file_meta['filepath']}")

        return jsonify({
            "status": "redirect",
            "url": serve_url,
        }), 200

    except ValueError as e:
        error_msg = str(e)
        logger.warning(f"Download failed for {url}: {error_msg}")

        # Provide a retry hint for bot-detection failures
        retry_hint = None
        if "blocked" in error_msg.lower() or "bot" in error_msg.lower() or "exhausted" in error_msg.lower():
            retry_hint = "YouTube is rate-limiting this server. Try again in a few minutes."

        return jsonify({
            "status": "error",
            "error": error_msg,
            **({"retry_hint": retry_hint} if retry_hint else {}),
        }), 400

    except RuntimeError as e:
        logger.error(f"Runtime error: {e}")
        return jsonify({
            "status": "error",
            "error": "Server configuration error. yt-dlp or ffmpeg is not available.",
        }), 500

    except Exception as e:
        logger.error(f"Unexpected error in /api/download: {e}", exc_info=True)
        return jsonify({
            "status": "error",
            "error": "Stream interception was interrupted by an internal error.",
        }), 500
