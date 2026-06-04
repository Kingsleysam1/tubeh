"""
TubeHeist Flask Backend
=======================
Production-grade YouTube download API powered by yt-dlp.
Serves as the backend for the TubeHeist React frontend.

In production (Railway), this app also serves the pre-built Vite static files.
In development, the Express server (server.ts) proxies API calls here.
"""

import logging
import os
import sys

from dotenv import load_dotenv
from flask import Flask, jsonify, send_from_directory

# Load environment variables from .env file
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)


def create_app() -> Flask:
    """Application factory for the Flask app."""

    # Determine if we're serving the frontend (production/Railway)
    dist_path = os.path.join(os.path.dirname(__file__), "..", "dist")
    dist_path = os.path.abspath(dist_path)
    serve_frontend = os.path.isdir(dist_path)

    app = Flask(
        __name__,
        static_folder=dist_path if serve_frontend else None,
        static_url_path="" if serve_frontend else None,
    )

    # ── CORS ──────────────────────────────────────────────────────
    from flask_cors import CORS
    CORS(app, resources={r"/api/*": {"origins": "*"}})

    # ── Rate Limiter ──────────────────────────────────────────────
    from utils.limiter import limiter
    limiter.init_app(app)

    # ── Register Blueprints ───────────────────────────────────────
    from routes.info import info_bp
    from routes.download import download_bp
    from routes.serve import serve_bp

    app.register_blueprint(info_bp)
    app.register_blueprint(download_bp)
    app.register_blueprint(serve_bp)

    # ── Health Check ──────────────────────────────────────────────
    @app.route("/api/health", methods=["GET"])
    def health():
        import subprocess as _sp
        from utils.cookies import cookie_manager

        # Get yt-dlp version
        ytdlp_version = "unknown"
        try:
            ver = _sp.run(
                ["yt-dlp", "--version"],
                capture_output=True, text=True, timeout=5,
            )
            if ver.returncode == 0:
                ytdlp_version = ver.stdout.strip()
        except Exception:
            pass

        cookie_status = cookie_manager.get_status()

        return jsonify({
            "status": "ok",
            "service": "tubeheist-backend",
            "version": "1.0.0",
            "ytdlp_version": ytdlp_version,
            "cookies_loaded": cookie_status["cookies_loaded"],
            "cookie_source": cookie_status["cookie_source"],
        })

    # ── Global Error Handlers ─────────────────────────────────────
    @app.errorhandler(404)
    def not_found(e):
        # If serving frontend, return index.html for SPA routing
        if serve_frontend:
            return send_from_directory(dist_path, "index.html")
        return jsonify({"error": True, "message": "Not found"}), 404

    @app.errorhandler(429)
    def rate_limited(e):
        return jsonify({
            "error": True,
            "message": "Rate limit exceeded. Please slow down.",
        }), 429

    @app.errorhandler(500)
    def server_error(e):
        return jsonify({
            "error": True,
            "message": "Internal server error",
        }), 500

    # ── Frontend Static Files (Production) ────────────────────────
    if serve_frontend:
        @app.route("/", defaults={"path": ""})
        @app.route("/<path:path>")
        def serve_spa(path):
            # Try to serve static file first, fall back to index.html
            full_path = os.path.join(dist_path, path)
            if path and os.path.isfile(full_path):
                return send_from_directory(dist_path, path)
            return send_from_directory(dist_path, "index.html")

        logger.info(f"Serving frontend from: {dist_path}")
    else:
        logger.info("No dist/ directory found — running in API-only mode")

    # ── Start Background Cleanup Thread ───────────────────────────
    from utils.cleanup import start_cleanup_thread
    start_cleanup_thread()

    logger.info("TubeHeist backend initialized successfully")
    return app


# ── Module-level app instance for gunicorn ────────────────────────
app = create_app()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_ENV", "production") != "production"
    app.run(host="0.0.0.0", port=port, debug=debug)
