"""
Bearer token authentication decorator for Flask routes.
Reads API_TOKEN from environment. If not set, auth is disabled (dev mode).
"""

import os
import functools
from flask import request, jsonify


def require_auth(f):
    """Decorator that enforces Bearer token authentication.
    
    If API_TOKEN env var is not set, authentication is skipped (dev mode).
    In production, requests must include: Authorization: Bearer <token>
    """
    @functools.wraps(f)
    def decorated_function(*args, **kwargs):
        api_token = os.environ.get("API_TOKEN", "").strip()

        # If no token is configured, skip auth (development mode)
        if not api_token:
            return f(*args, **kwargs)

        auth_header = request.headers.get("Authorization", "")

        if not auth_header:
            return jsonify({
                "error": True,
                "message": "Authentication required. Missing Authorization header."
            }), 401

        # Expect "Bearer <token>" format
        parts = auth_header.split(" ", 1)
        if len(parts) != 2 or parts[0].lower() != "bearer":
            return jsonify({
                "error": True,
                "message": "Invalid Authorization header format. Expected: Bearer <token>"
            }), 401

        provided_token = parts[1].strip()
        if provided_token != api_token:
            return jsonify({
                "error": True,
                "message": "Invalid API token."
            }), 403

        return f(*args, **kwargs)

    return decorated_function
