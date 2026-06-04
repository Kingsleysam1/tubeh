/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';

dotenv.config();

// Flask backend URL — configurable via env, defaults to localhost:5000
const FLASK_BACKEND_URL = process.env.FLASK_BACKEND_URL || 'http://localhost:5000';
const API_TOKEN = process.env.API_TOKEN || '';

// Helper to extract YouTube video ID from links
function extractYouTubeId(url: string): string | null {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|shorts\/)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

// Check if string is a valid URL
function isValidUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}

/**
 * Proxy a request to the Flask backend.
 * Forwards the request and streams the response back.
 */
async function proxyToFlask(
  targetPath: string,
  options: {
    method: string;
    body?: string;
    headers?: Record<string, string>;
  }
): Promise<{ status: number; headers: Headers; body: any; text: string }> {
  const url = `${FLASK_BACKEND_URL}${targetPath}`;
  const fetchHeaders: Record<string, string> = {
    ...(options.headers || {}),
  };

  // Add API token if configured
  if (API_TOKEN) {
    fetchHeaders['Authorization'] = `Bearer ${API_TOKEN}`;
  }

  const response = await fetch(url, {
    method: options.method,
    headers: fetchHeaders,
    body: options.body,
  });

  const text = await response.text();
  return {
    status: response.status,
    headers: response.headers,
    body: null,
    text,
  };
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Parse JSON bodies
  app.use(express.json());

  // Health check route
  app.get('/api/health', async (req, res) => {
    try {
      const result = await proxyToFlask('/api/health', { method: 'GET' });
      res.status(result.status).send(result.text);
    } catch {
      // Fallback if Flask isn't running
      res.json({ status: 'ok', timestamp: new Date().toISOString(), backend: 'express-only' });
    }
  });

  // Proxy: Extract metadata via Flask backend (yt-dlp)
  app.get('/api/info', async (req, res) => {
    try {
      const { url } = req.query;

      if (!url || typeof url !== 'string' || !isValidUrl(url)) {
        res.status(400).json({ error: 'A valid URL is required' });
        return;
      }

      const targetPath = `/api/info?url=${encodeURIComponent(url)}`;
      const result = await proxyToFlask(targetPath, { method: 'GET' });

      // Forward the Flask response
      res.status(result.status).type('json').send(result.text);

    } catch (error: any) {
      console.error('Error proxying to Flask /api/info:', error?.message);

      // Fallback: try oEmbed + thumbnail if Flask is down
      const url = req.query.url as string;
      const videoId = extractYouTubeId(url);
      if (videoId) {
        try {
          const oEmbedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
          const response = await fetch(oEmbedUrl);
          if (response.ok) {
            const data = await response.json() as { title: string; author_name?: string };
            res.json({
              title: data.title,
              author: data.author_name || 'YouTube Creator',
              thumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
              videoId,
              originalUrl: url
            });
            return;
          }
        } catch {}

        // Last-resort fallback
        res.json({
          title: `YouTube Video (${videoId})`,
          author: 'YouTube Creator',
          thumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
          videoId,
          originalUrl: url
        });
      } else {
        res.status(500).json({ error: 'Failed to retrieve YouTube video details' });
      }
    }
  });

  // Proxy: Download request to Flask backend
  app.post('/api/download', async (req, res) => {
    try {
      const { url, videoQuality = '720', audioFormat = 'mp3', isAudioOnly = false } = req.body;

      if (!url || typeof url !== 'string' || !isValidUrl(url)) {
        res.status(400).json({ error: 'A valid URL is required' });
        return;
      }

      const payload = JSON.stringify({
        url,
        videoQuality,
        audioFormat,
        isAudioOnly,
      });

      const result = await proxyToFlask('/api/download', {
        method: 'POST',
        body: payload,
        headers: { 'Content-Type': 'application/json' },
      });

      // Forward the Flask response
      res.status(result.status).type('json').send(result.text);

    } catch (error: any) {
      console.error('API Download proxy error:', error?.message);
      res.status(502).json({
        status: 'error',
        error: `Backend connection failed: ${error?.message || 'Flask backend is not reachable. Make sure it is running on ' + FLASK_BACKEND_URL}`,
      });
    }
  });

  // Proxy: Serve downloaded files from Flask
  app.get('/api/serve/:fileId', async (req, res) => {
    try {
      const fileId = req.params.fileId;
      const targetUrl = `${FLASK_BACKEND_URL}/api/serve/${fileId}`;

      const fetchHeaders: Record<string, string> = {};
      if (API_TOKEN) {
        fetchHeaders['Authorization'] = `Bearer ${API_TOKEN}`;
      }

      const response = await fetch(targetUrl, { headers: fetchHeaders });

      if (!response.ok) {
        const text = await response.text();
        res.status(response.status).send(text);
        return;
      }

      // Forward headers
      const contentType = response.headers.get('content-type');
      const contentDisposition = response.headers.get('content-disposition');
      const contentLength = response.headers.get('content-length');

      if (contentType) res.setHeader('Content-Type', contentType);
      if (contentDisposition) res.setHeader('Content-Disposition', contentDisposition);
      if (contentLength) res.setHeader('Content-Length', contentLength);

      // Stream the response body
      if (response.body) {
        const reader = response.body.getReader();
        const pump = async () => {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(Buffer.from(value));
          }
          res.end();
        };
        await pump();
      } else {
        const buffer = await response.arrayBuffer();
        res.send(Buffer.from(buffer));
      }

    } catch (error: any) {
      console.error('File serve proxy error:', error?.message);
      res.status(502).json({ error: 'Failed to retrieve file from backend' });
    }
  });

  // Vite integration middleware for dev environment / Static asset hosting in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server starting on http://localhost:${PORT} under NODE_ENV=${process.env.NODE_ENV}`);
    console.log(`Flask backend proxy target: ${FLASK_BACKEND_URL}`);
  });
}

startServer().catch((err) => {
  console.error('Uncaught startup exception:', err);
  process.exit(1);
});
