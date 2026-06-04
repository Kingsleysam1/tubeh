"""
Background cleanup thread for temporary download files.
Scans /tmp for tubeheist_* files older than the max age and removes them.
"""

import os
import glob
import time
import threading
import logging

logger = logging.getLogger(__name__)

TEMP_DIR = "/tmp"
TEMP_PREFIX = "tubeheist_"
MAX_AGE_SECONDS = 600   # 10 minutes
SCAN_INTERVAL = 60      # check every 60 seconds


def _cleanup_loop():
    """Continuously scan and delete stale temp files."""
    while True:
        try:
            pattern = os.path.join(TEMP_DIR, f"{TEMP_PREFIX}*")
            now = time.time()
            removed = 0

            for filepath in glob.glob(pattern):
                try:
                    file_age = now - os.path.getmtime(filepath)
                    if file_age > MAX_AGE_SECONDS:
                        os.remove(filepath)
                        removed += 1
                        logger.debug(f"Cleaned up temp file: {filepath}")
                except OSError as e:
                    logger.warning(f"Failed to remove temp file {filepath}: {e}")

            if removed > 0:
                logger.info(f"Cleanup sweep: removed {removed} stale temp file(s)")

        except Exception as e:
            logger.error(f"Cleanup thread error: {e}")

        time.sleep(SCAN_INTERVAL)


def start_cleanup_thread():
    """Start the background cleanup daemon thread."""
    thread = threading.Thread(target=_cleanup_loop, daemon=True, name="tubeheist-cleanup")
    thread.start()
    logger.info("Background temp file cleanup thread started")
    return thread
