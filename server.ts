/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';

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

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Parse JSON bodies
  app.use(express.json());

  // Health check route
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Extract metadata via Official YouTube oEmbed API
  app.get('/api/info', async (req, res) => {
    try {
      const { url } = req.query;

      if (!url || typeof url !== 'string' || !isValidUrl(url)) {
        res.status(400).json({ error: 'A valid URL is required' });
        return;
      }

      const videoId = extractYouTubeId(url);
      if (!videoId) {
        res.status(400).json({ error: 'This is not a recognized YouTube video link' });
        return;
      }

      // Fetch from official unauthenticated oEmbed
      const oEmbedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
      const response = await fetch(oEmbedUrl);
      
      if (!response.ok) {
        // Fallback info with generated attributes if oEmbed fails
        res.json({
          title: `YouTube Video (${videoId})`,
          author: 'YouTube Creator',
          thumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
          videoId,
          originalUrl: url
        });
        return;
      }

      const data = await response.json() as { title: string; author_name?: string };
      res.json({
        title: data.title,
        author: data.author_name || 'YouTube Creator',
        thumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        videoId,
        originalUrl: url
      });
    } catch (error) {
      console.error('Error fetching video info:', error);
      res.status(500).json({ error: 'Failed to retrieve YouTube video details' });
    }
  });

  // Proxy the download request to Cobalt API
  app.post('/api/download', async (req, res) => {
    try {
      const { url, videoQuality = '720', audioFormat = 'mp3', isAudioOnly = false } = req.body;

      if (!url || typeof url !== 'string' || !isValidUrl(url)) {
        res.status(400).json({ error: 'A valid URL is required' });
        return;
      }

      // Determine cobalt API values
      // Support BOTH v7/v8 style and v10 style parameters at same time to handle any container updates:
      const payload: Record<string, unknown> = {
        url: url,
        filenamePattern: 'classic',
        videoQuality: videoQuality,
        audioFormat: audioFormat,
        audioOnly: isAudioOnly,
        downloadMode: isAudioOnly ? 'audio' : 'video'
      };

      // We define list of potential Cobalt endpoints for high availability
      const cobaltServers = [
        'https://canine.tools',
        'https://co.eepy.today',
        'll.hyper.lol', // Some instances are hosted via this domain as fallback
        'https://cobalt.moe',
        'https://cobalt.pe',
        'https://cobalt.shun.pw',
        'https://co.wuk.sh',
        'https://api.cobalt.tools',
        'https://cobalt.api.ryboflaven.com',
        'https://api.cobalt.run'
      ];

      let lastError: string | null = null;
      let success = false;
      let responseData: any = null;

      for (const server of cobaltServers) {
        try {
          const formattedServer = server.startsWith('http') ? server : `https://${server}`;
          console.log(`Attempting to request download from Cobalt server: ${formattedServer}`);
          const cobaltResponse = await fetch(formattedServer, {
            method: 'POST',
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.0'
            },
            body: JSON.stringify(payload)
          });

          if (!cobaltResponse.ok) {
            const errBody = await cobaltResponse.text();
            lastError = `Server ${formattedServer} responded with HTTP ${cobaltResponse.status}: ${errBody}`;
            console.warn(lastError);
            continue; // try next server
          }

          const respText = await cobaltResponse.text();
          try {
            responseData = JSON.parse(respText);
            success = true;
            break;
          } catch (jsonErr) {
            lastError = `Server ${formattedServer} returned non-JSON content: ${respText.substring(0, 120)}`;
            console.warn(lastError);
            continue; // try next server
          }
        } catch (err: any) {
          lastError = err?.message || String(err);
          console.warn(`Failed endpoint ${server}:`, lastError);
        }
      }

      if (!success) {
        res.status(502).json({ 
          error: `Failed to fetch download stream. Details: ${lastError || 'All fallback streams are currently overloaded.'}`
        });
        return;
      }

      // Parse successfully retrieved response from Cobalt
      // Typical responses:
      // status: 'redirect' | 'tunnel' | 'picker' | 'error' | 'success'
      // url: string (direct link)
      // text: string (message/error)
      res.json(responseData);

    } catch (error: any) {
      console.error('API Download processor error:', error);
      res.status(500).json({ error: error?.message || 'Internal streaming proxy failure' });
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
  });
}

startServer().catch((err) => {
  console.error('Uncaught startup exception:', err);
  process.exit(1);
});
