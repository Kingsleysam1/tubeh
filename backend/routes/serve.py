"""
/api/serve/<file_id> route — Streams a downloaded temp file to the client.
Sets proper headers and cleans up after transfer.
"""

import os
import logging
from flask import Blueprint, send_file, jsonify, after_this_request

from routes.download import get_registered_file, remove_registered_file

logger = logging.getLogger(__name__)

serve_bp = Blueprint("serve", __name__)


@serve_bp.route("/api/serve/<file_id>", methods=["GET"])
def serve_file(file_id: str):
    """
    Stream a previously downloaded file to the client.
    
    GET /api/serve/<file_id>
    
    Sets Content-Disposition, Content-Type, and Content-Length headers.
    Deletes the temp file after successful transfer.
    """
    # Sanitize file_id to prevent path traversal
    if not file_id.isalnum():
        return jsonify({"error": True, "message": "Invalid file ID"}), 400

    file_meta = get_registered_file(file_id)
    if not file_meta:
        return jsonify({
            "error": True,
            "message": "File not found or has expired. Please download again."
        }), 404

    filepath = file_meta.get("filepath", "")
    if not os.path.isfile(filepath):
        remove_registered_file(file_id)
        return jsonify({
            "error": True,
            "message": "File has been cleaned up. Please download again."
        }), 404

    content_type = file_meta.get("content_type", "application/octet-stream")
    filename = file_meta.get("filename", f"download.{file_meta.get('extension', 'mp4')}")

    # Schedule cleanup after the response is sent
    @after_this_request
    def cleanup(response):
        try:
            remove_registered_file(file_id)
            if os.path.isfile(filepath):
                os.remove(filepath)
                logger.info(f"Cleaned up served file: {filepath}")
        except OSError as e:
            logger.warning(f"Failed to clean up file {filepath}: {e}")
        return response

    logger.info(f"Serving file: {file_id} -> {filepath}")

    return send_file(
        filepath,
        mimetype=content_type,
        as_attachment=True,
        download_name=filename,
    )
