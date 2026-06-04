"""
/api/info route — Video metadata extraction endpoint.
Supports both GET (legacy frontend compat) and POST.
"""

import logging
from flask import Blueprint, request, jsonify

from utils.auth import require_auth
from utils.limiter import limiter
from utils.cache import info_cache
from utils.ytdlp import get_video_info, validate_url, extract_video_id

logger = logging.getLogger(__name__)

info_bp = Blueprint("info", __name__)


@info_bp.route("/api/info", methods=["GET", "POST"])
@limiter.limit("20 per minute")
def video_info():
    """
    Extract video metadata using yt-dlp.
    
    GET  /api/info?url=<youtube_url>       (frontend legacy compat)
    POST /api/info  {"url": "<youtube_url>"}
    
    Returns VideoInfo-compatible JSON:
    {
        "title": str,
        "author": str,
        "thumbnailUrl": str,
        "videoId": str,
        "originalUrl": str
    }
    """
    # Extract URL from query params (GET) or JSON body (POST)
    if request.method == "GET":
        url = request.args.get("url", "").strip()
    else:
        body = request.get_json(silent=True) or {}
        url = body.get("url", "").strip()

    if not url:
        return jsonify({"error": "A valid URL is required"}), 400

    if not validate_url(url):
        video_id = extract_video_id(url)
        if not video_id:
            return jsonify({"error": "This is not a recognized YouTube video link"}), 400

    # Check cache first
    cached = info_cache.get(url)
    if cached:
        logger.debug(f"Cache hit for: {url}")
        return jsonify(cached), 200

    try:
        info = get_video_info(url)

        # Cache the result for 5 minutes
        info_cache.set(url, info, ttl=300)

        return jsonify(info), 200

    except ValueError as e:
        error_msg = str(e)
        logger.warning(f"Info extraction failed for {url}: {error_msg}")

        # Attempt graceful fallback using video ID for thumbnail
        video_id = extract_video_id(url)
        if video_id:
            fallback = {
                "title": f"YouTube Video ({video_id})",
                "author": "YouTube Creator",
                "thumbnailUrl": f"https://img.youtube.com/vi/{video_id}/maxresdefault.jpg",
                "videoId": video_id,
                "originalUrl": url,
            }
            return jsonify(fallback), 200

        return jsonify({"error": error_msg}), 400

    except RuntimeError as e:
        logger.error(f"Runtime error: {e}")
        return jsonify({"error": "Server configuration error. yt-dlp is not available."}), 500

    except Exception as e:
        logger.error(f"Unexpected error in /api/info: {e}", exc_info=True)
        return jsonify({"error": "Failed to retrieve YouTube video details"}), 500
