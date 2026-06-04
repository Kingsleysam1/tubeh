/**
 * TubeHeist API Integration Layer
 * ================================
 * Clean utility functions for interacting with the backend API.
 * The existing App.tsx inline fetch calls will continue to work,
 * but these functions provide a reusable, testable interface.
 */

const API_BASE = '';  // Same origin — no prefix needed

/**
 * Fetch video metadata for a YouTube URL.
 * @param {string} url - YouTube video URL
 * @returns {Promise<{title: string, author: string, thumbnailUrl: string, videoId: string, originalUrl: string}>}
 */
export const getVideoInfo = async (url) => {
  if (!url || typeof url !== 'string') {
    throw new Error('A valid URL is required');
  }

  const response = await fetch(`${API_BASE}/api/info?url=${encodeURIComponent(url)}`);
  const text = await response.text();

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Invalid metadata response format received from extraction pipeline.');
  }

  if (!response.ok) {
    throw new Error(data.error || 'Failed to inspect link properties');
  }

  return data;
};

/**
 * Request a video/audio download and get the serve URL.
 * @param {string} url - YouTube video URL
 * @param {Object} options - Download options
 * @param {string} [options.videoQuality='1080'] - Video quality preset
 * @param {string} [options.audioFormat='mp3'] - Audio format for audio-only
 * @param {boolean} [options.isAudioOnly=false] - Extract audio only
 * @returns {Promise<{status: string, url?: string, error?: string}>}
 */
export const downloadVideo = async (url, options = {}) => {
  if (!url || typeof url !== 'string') {
    throw new Error('A valid URL is required');
  }

  const { videoQuality, audioFormat, isAudioOnly = false } = options;

  const payload = {
    url,
    videoQuality: isAudioOnly ? undefined : (videoQuality || '1080'),
    audioFormat: isAudioOnly ? (audioFormat || 'mp3') : undefined,
    isAudioOnly,
  };

  const response = await fetch(`${API_BASE}/api/download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const text = await response.text();

  let result;
  try {
    result = JSON.parse(text);
  } catch {
    throw new Error('The gateway returned an invalid response.');
  }

  if (!response.ok || result.status === 'error') {
    throw new Error(result.error || result.text || 'Download request failed.');
  }

  return result;
};

/**
 * Check backend health status.
 * @returns {Promise<{status: string, service: string, version: string}>}
 */
export const checkHealth = async () => {
  const response = await fetch(`${API_BASE}/api/health`);
  if (!response.ok) {
    throw new Error('Backend health check failed');
  }
  return response.json();
};
