"""
Thread-safe TTL cache for video metadata.
Avoids hammering yt-dlp for repeated requests to the same URL.
"""

import threading
import time
from typing import Any, Optional


class TTLCache:
    """Simple in-memory cache with per-key expiration."""

    def __init__(self, default_ttl: int = 300):
        self._store: dict[str, tuple[Any, float]] = {}
        self._lock = threading.Lock()
        self._default_ttl = default_ttl

    def get(self, key: str) -> Optional[Any]:
        """Retrieve a cached value if it exists and hasn't expired."""
        with self._lock:
            entry = self._store.get(key)
            if entry is None:
                return None
            value, expiry = entry
            if time.time() > expiry:
                del self._store[key]
                return None
            return value

    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        """Store a value with a TTL (seconds). Defaults to cache-level TTL."""
        actual_ttl = ttl if ttl is not None else self._default_ttl
        with self._lock:
            self._store[key] = (value, time.time() + actual_ttl)

    def delete(self, key: str) -> None:
        """Remove a specific key from the cache."""
        with self._lock:
            self._store.pop(key, None)

    def cleanup(self) -> int:
        """Remove all expired entries. Returns count of removed entries."""
        now = time.time()
        removed = 0
        with self._lock:
            expired_keys = [k for k, (_, exp) in self._store.items() if now > exp]
            for k in expired_keys:
                del self._store[k]
                removed += 1
        return removed

    def clear(self) -> None:
        """Flush the entire cache."""
        with self._lock:
            self._store.clear()

    @property
    def size(self) -> int:
        """Current number of entries (including possibly-expired ones)."""
        return len(self._store)


# Module-level singleton for video info caching
info_cache = TTLCache(default_ttl=300)  # 5 minutes
