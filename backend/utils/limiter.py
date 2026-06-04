"""
Rate limiter configuration for Flask using Flask-Limiter.
Uses in-memory storage (suitable for single-process deployments).
"""

from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

# Module-level limiter instance — attached to app in app.py
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["30 per minute"],
    storage_uri="memory://",
    strategy="fixed-window",
)
