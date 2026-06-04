/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from 'motion/react';
import { 
  Download, 
  Search, 
  Video, 
  Volume2, 
  AlertCircle, 
  Sparkles, 
  Play, 
  Check, 
  Clock, 
  RefreshCw, 
  ArrowRight,
  Info,
  Activity,
  Zap,
  Globe,
  Trash2,
  Copy,
  Layers,
  Flame,
  FileDown
} from 'lucide-react';
import Navbar from './components/Navbar';
import FeatureCards from './components/FeatureCards';
import HistoryList from './components/HistoryList';
import { VideoInfo, VideoQuality, AudioFormat, DownloaderHistoryItem } from './types';

// Helper to extract YouTube ID client-side for ultra-fast previews
function extractYouTubeIdClient(url: string): string | null {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|shorts\/)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

const VIDEO_PRESETS = [
  { id: 'max' as VideoQuality, label: 'ORIGINAL MAX', sub: 'Best available source bitrates', codec: 'H.264 / AV1 Codec', format: 'MP4' },
  { id: '2160' as VideoQuality, label: '4K ULTRA HD', sub: '3840 x 2160 pixels / Cinematic density', codec: 'HEVC High Profile', format: 'MP4' },
  { id: '1440' as VideoQuality, label: '2K QUAD HD', sub: '2560 x 1440 pixels / Precise frame spacing', codec: 'MPEG-4 Container', format: 'MP4' },
  { id: '1080' as VideoQuality, label: '1080P FULL HD', sub: '1920 x 1080 pixels / Rich studio crisp', codec: 'MPEG-4 Base Stream', format: 'MP4' },
  { id: '720' as VideoQuality, label: '720P HIGH DEF', sub: '1280 x 720 pixels / Optimized weight', codec: 'Standard Comp', format: 'MP4' },
  { id: '360' as VideoQuality, label: '360P MOBILE', sub: '480 x 360 pixels / Minimal footprint', codec: 'Legacy Comp', format: 'MP4' },
];

const AUDIO_PRESETS = [
  { id: 'wav' as AudioFormat, label: 'LOSSLESS WAV', sub: 'Linear PCM digital master audio stream', info: 'Lossless 1411kbps', format: 'WAV' },
  { id: 'mp3' as AudioFormat, label: 'OPTIMIZED MP3', sub: 'Universal layout standard tracking', info: 'Agile 320kbps', format: 'MP3' },
  { id: 'aac' as AudioFormat, label: 'STUDIO AAC', sub: 'Mac/iOS native clear acoustics', info: 'Crisp 256kbps', format: 'M4A' },
  { id: 'opus' as AudioFormat, label: 'OPUS SMART', sub: 'Smart adaptable voice delivery', info: 'Dynamic Bitrate', format: 'OPUS' },
  { id: 'ogg' as AudioFormat, label: 'OGG VORBIS', sub: 'Open source acoustic frequency container', info: 'Spatial 320kbps', format: 'OGG' },
];

export default function App() {
  const [url, setUrl] = useState('');
  const [hasEnteredValidUrl, setHasEnteredValidUrl] = useState(false);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  
  // Loading & Processing States
  const [isInspecting, setIsInspecting] = useState(false);
  const [isProcessingDownload, setIsProcessingDownload] = useState(false);
  
  // High-fidelity Hairline Progress Bar States
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [progressPhase, setProgressPhase] = useState('INITIALIZING PIPELINE CONNECTION...');
  const progressTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Mouse position tracking for cinematic parallax tilting on the framing image
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  // Smooth the values using a spring for that premium dampened luxury look
  const springConfig = { damping: 25, stiffness: 150, mass: 0.5 };
  const rotateX = useSpring(useTransform(mouseY, [-0.5, 0.5], [10, -10]), springConfig);
  const rotateY = useSpring(useTransform(mouseX, [-0.5, 0.5], [-10, 10]), springConfig);
  const tiltX = useSpring(useTransform(mouseY, [-0.5, 0.5], [6, -6]), springConfig);
  const tiltY = useSpring(useTransform(mouseX, [-0.5, 0.5], [-6, 6]), springConfig);

  const handleMouseMoveParallax = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    // Calculate mouse position relative to container center normalized between -0.5 and 0.5
    const relativeX = (e.clientX - rect.left) / width - 0.5;
    const relativeY = (e.clientY - rect.top) / height - 0.5;
    mouseX.set(relativeX);
    mouseY.set(relativeY);
  };

  const handleMouseLeaveParallax = () => {
    // Elegant spring-back to center
    mouseX.set(0);
    mouseY.set(0);
  };

  // Selected format trackers
  const [selectedVideoId, setSelectedVideoId] = useState<VideoQuality>('1080');
  const [selectedAudioId, setSelectedAudioId] = useState<AudioFormat>('mp3');
  const [isAudioMode, setIsAudioMode] = useState(false);

  // Data States
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [downloadLink, setDownloadLink] = useState<string | null>(null);
  
  // Error States
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoErrorMsg, setInfoErrorMsg] = useState<string | null>(null);

  // Local Storage history list
  const [history, setHistory] = useState<DownloaderHistoryItem[]>([]);

  // Load history from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('yt_download_history');
      if (stored) {
        setHistory(JSON.parse(stored));
      }
    } catch (e) {
      console.warn('Failed to parse download history from localStorage', e);
    }
  }, []);

  // Sync history to localStorage
  const saveHistory = (newHistory: DownloaderHistoryItem[]) => {
    setHistory(newHistory);
    try {
      localStorage.setItem('yt_download_history', JSON.stringify(newHistory));
    } catch (e) {
      console.error('Failed to save download history to localStorage', e);
    }
  };

  // Real-time URL validator and preview triggering
  const handleUrlInputChange = (inputVal: string) => {
    setUrl(inputVal);
    setErrorMsg(null);
    setInfoErrorMsg(null);
    
    const videoId = extractYouTubeIdClient(inputVal);
    if (videoId) {
      setHasEnteredValidUrl(true);
      setActiveVideoId(videoId);
      // Auto triggers info discovery
      triggerInfoFetch(inputVal);
    } else {
      setHasEnteredValidUrl(false);
      setActiveVideoId(null);
      setVideoInfo(null);
      setDownloadLink(null);
    }
  };

  // Explicit URL Analysis trigger
  const triggerInfoFetch = async (targetUrl: string) => {
    if (!targetUrl) return;
    setIsInspecting(true);
    setInfoErrorMsg(null);
    setDownloadLink(null);

    try {
      const resp = await fetch(`/api/info?url=${encodeURIComponent(targetUrl)}`);
      const respText = await resp.text();
      
      let data: any;
      try {
        data = JSON.parse(respText);
      } catch (parseErr) {
        throw new Error('Invalid metadata response format received from extraction pipeline.');
      }

      if (!resp.ok) {
        throw new Error(data.error || 'Failed to inspect link properties');
      }
      
      setVideoInfo(data as VideoInfo);
    } catch (err: any) {
      console.warn('Metadata fetch fallback:', err);
      const vidId = extractYouTubeIdClient(targetUrl);
      if (vidId) {
        setVideoInfo({
          title: `YouTube Stream ${vidId}`,
          author: 'Independent Author Profile',
          thumbnailUrl: `https://img.youtube.com/vi/${vidId}/maxresdefault.jpg`,
          videoId: vidId,
          originalUrl: targetUrl
        });
      } else {
        setInfoErrorMsg(err.message || 'The specified target could not be verified. Confirm availability.');
      }
    } finally {
      setIsInspecting(false);
    }
  };

  const handleInspectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;
    triggerInfoFetch(url);
  };

  // Paste from system Clipboard with fallback support
  const handlePasteFromClipboard = async () => {
    try {
      setErrorMsg(null);
      setInfoErrorMsg(null);
      const clipboardText = await navigator.clipboard.readText();
      if (clipboardText && clipboardText.trim().startsWith('http')) {
        handleUrlInputChange(clipboardText.trim());
      } else if (clipboardText) {
        setUrl(clipboardText);
        setErrorMsg('Pasted content is not a recognized web URL.');
      } else {
        throw new Error('Clipboard is empty.');
      }
    } catch (err) {
      console.warn('Clipboard read blocker fell back to standard target', err);
      // Premium aesthetic placeholder trigger
      const defaultTestLink = 'https://www.youtube.com/shorts/87S8W-bMByw';
      handleUrlInputChange(defaultTestLink);
    }
  };

  // Real-time progress simulation sequence
  const startProgressSimulation = () => {
    if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    
    setDownloadProgress(2);
    setProgressPhase('BOOTSTRAPPING PROTOCOLS...');

    progressTimerRef.current = setInterval(() => {
      setDownloadProgress((prev) => {
        if (prev >= 98) {
          return prev; // hold until finished
        }
        
        let increment = 1;
        if (prev < 20) {
          setProgressPhase('ESTABLISHING SECURE GATEWAYS...');
          increment = Math.floor(Math.random() * 4) + 2;
        } else if (prev < 45) {
          setProgressPhase('SHIELDING GEOGRAPHIC ENFORCEMENTS...');
          increment = Math.floor(Math.random() * 3) + 1;
        } else if (prev < 75) {
          setProgressPhase('PACKETIZING CHUNKS FROM CDN HOSTS...');
          increment = Math.floor(Math.random() * 2) + 1;
        } else if (prev < 92) {
          setProgressPhase('ASSEMBLING MULTIPLEXED DIGITAL STREAM...');
          increment = 1;
        } else {
          setProgressPhase('FINISHING CONTAINER CODEC SYNCHRONIZATION...');
          increment = 0.5;
        }

        const nextVal = prev + increment;
        return nextVal > 98 ? 98 : nextVal;
      });
    }, 85);
  };

  const completeProgressSimulation = () => {
    if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    setDownloadProgress(100);
    setProgressPhase('TRANSLATION RESOLVED. COMPILATION INTACT.');
  };

  // Direct fetch call down to the local streaming proxy gateway
  const executeHeistFlow = async (qualityOverride?: VideoQuality, audioFormatOverride?: AudioFormat, forceAudio?: boolean) => {
    if (!url) {
      setErrorMsg('Please specify a valid YouTube URL stream.');
      return;
    }

    const currentAudioOnly = forceAudio !== undefined ? forceAudio : isAudioMode;
    const finalQuality = qualityOverride || selectedVideoId;
    const finalFormat = audioFormatOverride || selectedAudioId;

    setIsProcessingDownload(true);
    setErrorMsg(null);
    setDownloadLink(null);
    startProgressSimulation();

    // Scroll elegantly to focus on processing flow
    setTimeout(() => {
      const el = document.getElementById('pipeline-progress-anchor');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);

    try {
      const payload = {
        url,
        videoQuality: currentAudioOnly ? undefined : finalQuality,
        audioFormat: currentAudioOnly ? finalFormat : undefined,
        isAudioOnly: currentAudioOnly
      };

      const resp = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const respText = await resp.text();
      let result: any;
      try {
        result = JSON.parse(respText);
      } catch (parseErr) {
        throw new Error('The gateway returned an invalid non-JSON stream container response.');
      }

      if (!resp.ok) {
        throw new Error(result.error || 'The secure backend gateway rejected extraction.');
      }
      
      if (result.status === 'error') {
        throw new Error(result.text || 'The Cobalt engine rejected configuration for this stream.');
      }

      if (result.url) {
        completeProgressSimulation();
        setDownloadLink(result.url);
        
        // Push successful entry to history
        const activeTitle = videoInfo?.title || `YouTube Heist (${activeVideoId})`;
        const activeAuthor = videoInfo?.author || 'Independent Creator';
        const activeThumb = videoInfo?.thumbnailUrl || `https://img.youtube.com/vi/${activeVideoId}/maxresdefault.jpg`;
        
        const newHistoryItem: DownloaderHistoryItem = {
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          title: activeTitle,
          author: activeAuthor,
          thumbnailUrl: activeThumb,
          originalUrl: url,
          downloadUrl: result.url,
          timestamp: Date.now(),
          isVideo: !currentAudioOnly,
          quality: currentAudioOnly ? undefined : finalQuality
        };

        const updatedHistory = [newHistoryItem, ...history.slice(0, 19)]; // Limit to max 20 entries
        saveHistory(updatedHistory);

        // Auto trigger download trigger inside the viewport
        try {
          const ghostAnchor = document.createElement('a');
          ghostAnchor.href = result.url;
          ghostAnchor.target = '_blank';
          ghostAnchor.rel = 'noreferrer noopener';
          const cleanTitle = activeTitle.replace(/[^a-zA-Z0-9]/g, '_');
          ghostAnchor.download = currentAudioOnly ? `${cleanTitle}.${finalFormat}` : `${cleanTitle}_${finalQuality}p.mp4`;
          document.body.appendChild(ghostAnchor);
          ghostAnchor.click();
          document.body.removeChild(ghostAnchor);
        } catch (downloadErr) {
          console.warn('Sub-browser security isolated direct click. Manual fallback triggered.', downloadErr);
        }

      } else if (result.status === 'picker' && result.picker && result.picker.length > 0) {
        completeProgressSimulation();
        const pickedUrl = result.picker[0].url;
        setDownloadLink(pickedUrl);
      } else {
        throw new Error('A secure container reference could not be compiled down.');
      }

    } catch (err: any) {
      console.error(err);
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
      setDownloadProgress(0);
      setErrorMsg(err.message || 'Stream interception was interrupted by network conditions.');
    } finally {
      setIsProcessingDownload(false);
    }
  };

  const handleRemoveHistoryItem = (id: string) => {
    const updated = history.filter(item => item.id !== id);
    saveHistory(updated);
  };

  const handleClearHistory = () => {
    if (window.confirm('Clear all logged traces of downloaded media?')) {
      saveHistory([]);
    }
  };

  const handlePastePresetLink = (preset: string) => {
    handleUrlInputChange(preset);
  };

  // Clean layout elements
  useEffect(() => {
    return () => {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#050507] text-[#ededf1] flex flex-col font-sans relative selection:bg-[#bfa854] selection:text-black overflow-hidden" id="main-app-container">
      
      {/* Background Interactive Ambient Grid Lines (Laurenti Design Studio style) */}
      <div className="absolute inset-0 pointer-events-none opacity-5 bg-[linear-gradient(to_right,#bfa854_1px,transparent_1px),linear-gradient(to_bottom,#bfa854_1px,transparent_1px)] bg-[size:5rem_5rem]" id="grid-bg-effect" />
      <div className="absolute top-[10%] left-0 w-[600px] h-[600px] bg-[#bfa854]/5 rounded-full blur-[150px] pointer-events-none" id="radial-glow-left" />
      <div className="absolute bottom-[20%] right-0 w-[500px] h-[500px] bg-[#bfa854]/3 rounded-full blur-[130px] pointer-events-none" id="radial-glow-right" />

      <Navbar />

      <main className="flex-grow mx-auto max-w-7xl px-6 sm:px-12 py-16 w-full z-10 space-y-24" id="content-main">
        
        {/* LAURENTI STYLE: HERO ZONE (CINEMATIC, ARRESTING HERO LANDING PORTAL) */}
        <section className="flex flex-col items-center justify-center min-h-[75vh] py-12 text-center relative" id="editorial-hero">
          <div className="absolute top-0 opacity-15 font-mono text-[9px] uppercase tracking-[0.4em] text-gray-500 mb-8 select-none">
            [ SECURE EXTRACTION COMPASS — SYSTEM LIVE ]
          </div>

          <div className="max-w-4xl space-y-8 flex flex-col items-center mt-6">
            <h1 className="font-display font-light text-5xl sm:text-7xl md:text-8xl tracking-tight leading-[0.95] text-white uppercase text-center">
              Download YouTube <br />
              <span className="font-serif italic font-normal text-gold-300 antialiased tracking-wide text-glow-gold">Videos in High</span> Quality
            </h1>
            
            <p className="max-w-2xl text-gray-400 font-sans text-xs sm:text-sm font-light leading-relaxed tracking-wide select-none text-center">
              An elegant, non-intrusive container bypass suite designed to parse, isolate, and package video streams and premium high-fidelity audio waves straight to your workspace directory.
            </p>
          </div>

          {/* Luxury Central Input Console */}
          <div className="w-full max-w-2xl mt-12" id="hero-input-console">
            <form onSubmit={handleInspectSubmit} className="relative" id="interactive-paste-form">
              <div className="relative flex flex-col sm:flex-row items-stretch sm:items-center bg-[#08080a] border border-white/[0.06] focus-within:border-[#bfa854]/40 p-2 sm:p-2.5 transition-all duration-500 rounded-none gold-border-glow" id="input-capsule">
                <div className="flex items-center gap-3.5 pl-4 flex-grow min-w-0 py-3 sm:py-0">
                  <Search className="h-4 w-4 text-gray-500 shrink-0" />
                  <input
                    id="extractor-url-input"
                    type="text"
                    placeholder="Enter valid YouTube, Shorts, or clip URL..."
                    value={url}
                    onChange={(e) => handleUrlInputChange(e.target.value)}
                    className="w-full bg-transparent border-0 outline-hidden focus:outline-hidden text-sm text-[#f7f5eb] placeholder-gray-600 font-sans pr-4"
                    required
                  />
                </div>

                <div className="flex items-center gap-2 px-1 pb-1 sm:pb-0" id="action-panel-inline">
                  {/* Paste Clipboard button */}
                  <button
                    type="button"
                    onClick={handlePasteFromClipboard}
                    className="flex-1 sm:flex-initial flex items-center justify-center gap-2 border border-white/[0.08] hover:border-[#bfa854]/30 bg-white/[0.01] hover:bg-[#bfa854]/5 rounded-none font-mono text-[9px] uppercase tracking-[0.2em] text-gray-400 hover:text-white py-3.5 px-5 transition-all text-center cursor-pointer"
                    title="Paste live URL clipboard content"
                    id="paste-link-util-btn"
                  >
                    <Copy className="h-3.5 w-3.5 text-[#bfa854]" />
                    <span>Paste</span>
                  </button>

                  {/* Intercept / Analyze Button */}
                  <button
                    type="submit"
                    disabled={isInspecting || !url}
                    className="flex-1 sm:flex-initial flex items-center justify-center gap-2 bg-[#bfa854] hover:bg-[#aa8f40] disabled:bg-[#4a4221] disabled:text-gray-400 disabled:opacity-30 rounded-none font-mono text-[9px] font-bold tracking-[0.2em] text-black py-3.5 px-6 transition-all duration-300 disabled:cursor-not-allowed uppercase cursor-pointer"
                    id="analyse-input-btn"
                  >
                    {isInspecting ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Zap className="h-3.5 w-3.5 fill-current" />
                    )}
                    <span>Analyze</span>
                  </button>
                </div>
              </div>
            </form>

            <AnimatePresence>
              {/* Preset triggers for fast luxury demo */}
              {!hasEnteredValidUrl && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-wrap items-center justify-center gap-3 mt-5"
                  id="presets-panel"
                >
                  <span className="font-mono text-[8px] uppercase tracking-[0.3em] text-gray-500 font-medium">DESIGN DEMOS:</span>
                  <button
                    onClick={() => handlePastePresetLink('https://www.youtube.com/shorts/87S8W-bMByw')}
                    className="font-mono text-[9px] uppercase tracking-[0.2em] text-gray-400 hover:text-[#bfa854] bg-transparent border-b border-white/[0.06] hover:border-[#bfa854] pb-0.5 transition-all cursor-pointer"
                    id="preset-sh-1"
                  >
                    Neon Short Archive
                  </button>
                  <span className="text-gray-700 font-mono text-[8px]">•</span>
                  <button
                    onClick={() => handlePastePresetLink('https://youtube.com/watch?v=dQw4w9WgXcQ')}
                    className="font-mono text-[9px] uppercase tracking-[0.2em] text-gray-400 hover:text-[#bfa854] bg-transparent border-b border-white/[0.06] hover:border-[#bfa854] pb-0.5 transition-all cursor-pointer"
                    id="preset-sh-2"
                  >
                    Classic Retro Stream
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Loading status (Analyzing...) */}
          {url && hasEnteredValidUrl && !videoInfo && isInspecting && (
            <div className="mt-12 flex items-center gap-3.5 px-6 py-4.5 border border-[#bfa854]/10 bg-[#08080a] opacity-90 text-left rounded-none luxury-loading-glow max-w-sm" id="dynamic-loading-state">
              <RefreshCw className="h-4 w-4 text-[#bfa854] animate-spin shrink-0" />
              <div className="flex flex-col">
                <span className="font-display text-xs font-bold uppercase tracking-wider text-[#f7f5eb]">Analyzing Stream...</span>
                <span className="font-mono text-[8px] uppercase tracking-widest text-[#bfa854] mt-0.5">querying unencrypted oembed source</span>
              </div>
            </div>
          )}

          {/* Target Query Error Block */}
          {infoErrorMsg && (
            <div className="mt-8 border border-red-900/30 bg-red-950/10 p-5 flex items-start gap-3.5 text-left max-w-xl" id="info-error-card">
              <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
              <div className="flex flex-col">
                <span className="font-display text-xs font-bold text-red-400 uppercase tracking-[0.1em]">Verification Interrupted</span>
                <p className="font-sans text-[11px] text-gray-400 leading-relaxed mt-1 font-light">{infoErrorMsg}</p>
              </div>
            </div>
          )}
        </section>

        {/* LAURENTI STYLE: PORTFOLIO REVEAL (REVEAL PREVIEW + GALLERY EXPOSITION TILES) */}
        <AnimatePresence mode="wait">
          {videoInfo && (
            <motion.section
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.8, cubicBezier: [0.16, 1, 0.3, 1] }}
              className="space-y-16 py-12 border-t border-white/[0.04]"
              id="portfolio-reveal-section"
            >
              
              {/* HEADER CAPTURE DETAILS */}
              <div className="grid md:grid-cols-12 gap-8 items-start text-left" id="reveal-details-grid">
                <div className="md:col-span-8 space-y-4">
                  <div className="flex items-center gap-3" id="meta-intercepted-tag">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#bfa854] opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-[#bfa854]"></span>
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#bfa854] font-semibold">
                      [ ARTIFACT CAPTURED ]
                    </span>
                  </div>

                  <h2 className="font-display text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-white leading-tight uppercase" id="video-info-primary-title">
                    {videoInfo.title}
                  </h2>
                </div>

                <div className="md:col-span-4 border-l border-white/[0.06] pl-6 py-1 space-y-4 font-mono text-[10px] text-gray-500 uppercase tracking-[0.2em]" id="reveal-owner-box">
                  <div>
                    <span className="text-gray-600 block mb-1">PRODUCER PROFILE</span>
                    <span className="text-[#f7f5eb] font-bold text-xs font-sans tracking-tight">{videoInfo.author}</span>
                  </div>
                  <div>
                    <span className="text-gray-600 block mb-1">COBALT UNIQUE ID</span>
                    <a 
                      href={videoInfo.originalUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-[#bfa854] hover:text-[#cdbd6c] transition-colors underline decoration-[#bfa854]/20 underline-offset-4"
                    >
                      {videoInfo.videoId}
                    </a>
                  </div>
                </div>
              </div>

              {/* GIANT LARGE FRAMING ARTISTIC THUMBNAIL WITH CINEMATIC PARALLAX */}
              <motion.div
                onMouseMove={handleMouseMoveParallax}
                onMouseLeave={handleMouseLeaveParallax}
                style={{
                  rotateX,
                  rotateY,
                  transformStyle: 'preserve-3d',
                  perspective: 1200
                }}
                className="relative group overflow-hidden border border-white/[0.08] bg-black bg-opacity-40 aspect-video md:aspect-[21/9] rounded-none shadow-2xl hover:border-[#bfa854]/40 transition-[border-color,box-shadow] duration-500" 
                id="curated-framing-video-player"
              >
                <motion.img
                  src={videoInfo.thumbnailUrl}
                  alt={videoInfo.title}
                  style={{
                    x: tiltY,
                    y: tiltX,
                    scale: 1.1, // slightly scaled up to offset translations and prevent empty edge gaps
                  }}
                  className="h-full w-full object-cover grayscale opacity-50 contrast-125 transition-all duration-1000 group-hover:grayscale-0 group-hover:opacity-85 absolute inset-0"
                  referrerPolicy="no-referrer"
                  id="video-preview-img-tag"
                />
                
                <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/30 pointer-events-none" />
                
                {/* Floating Aesthetic Grid labels inside the art frame using 3D translation */}
                <motion.div 
                  style={{ translateZ: 30 }}
                  className="absolute top-6 left-6 font-mono text-[8px] text-[#bfa854] tracking-[0.4em] select-none uppercase pointer-events-none"
                >
                  HEIST CAMERA INLINE // ZONE_SECURE
                </motion.div>
                <motion.div 
                  style={{ translateZ: 30 }}
                  className="absolute bottom-6 right-6 font-mono text-[8px] text-gray-500 tracking-[0.3em] select-none uppercase pointer-events-none"
                >
                  COORDINATES_STDL_0x89C
                </motion.div>

                <motion.div 
                  style={{ translateZ: 50 }}
                  className="absolute inset-0 flex items-center justify-center pointer-events-none"
                >
                  <div className="flex h-16 w-16 items-center justify-center rounded-none bg-black border border-[#bfa854]/40 text-[#bfa854] shadow-2xl group-hover:border-[#bfa854] transition-all duration-500 hover:scale-105">
                    <Play className="h-6 w-6 ml-0.5 fill-current" />
                  </div>
                </motion.div>
              </motion.div>

              {/* CURATED GALLERY EXPOSITION FOR FORMAT SELECTION (VIDEO & AUDIO EXPOSITIONS) */}
              <div className="space-y-16" id="exhibition-format-selectors">
                
                {/* METHOD TOGGLER */}
                <div className="flex justify-center border-b border-white/[0.04]" id="exposition-mode-toggle">
                  <div className="inline-flex gap-8 mb-[-1px]">
                    <button
                      type="button"
                      onClick={() => {
                        setIsAudioMode(false);
                        setDownloadLink(null);
                      }}
                      className={`font-display text-sm sm:text-base font-bold pb-4 tracking-[0.25em] uppercase border-b-2 transition-all transition-all duration-300 cursor-pointer ${
                        !isAudioMode
                          ? 'border-[#bfa854] text-white font-black'
                          : 'border-transparent text-gray-500 hover:text-gray-300'
                      }`}
                      id="video-exhibit-trigger"
                    >
                      VIDEO CONTAINER PACKETS (.MP4)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsAudioMode(true);
                        setDownloadLink(null);
                      }}
                      className={`font-display text-sm sm:text-base font-bold pb-4 tracking-[0.25em] uppercase border-b-2 transition-all transition-all duration-300 cursor-pointer ${
                        isAudioMode
                          ? 'border-[#bfa854] text-white font-black'
                          : 'border-transparent text-gray-500 hover:text-gray-300'
                      }`}
                      id="audio-exhibit-trigger"
                    >
                      STEREO SOUND EXTRACTS (.WAV/.MP3)
                    </button>
                  </div>
                </div>

                {/* HIGH-FIDELITY ACTIVE SELECTION TRACKER */}
                <div className="text-center font-mono text-[10px] text-gray-400 uppercase tracking-[0.2em]" id="selection-guideline-badge">
                  [ Click any art tile below to trigger live high-speed stream translation ]
                </div>

                {/* GALLERIES BLOCK */}
                <div>
                  {!isAudioMode ? (
                    /* VIDEO GALLERIES GRID */
                    <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3" id="video-exposition-grid">
                      {VIDEO_PRESETS.map((preset) => {
                        const isSelected = selectedVideoId === preset.id && !isAudioMode;
                        return (
                          <div
                            key={preset.id}
                            onClick={() => {
                              setSelectedVideoId(preset.id);
                              setDownloadLink(null);
                              executeHeistFlow(preset.id, undefined, false);
                            }}
                            className={`group relative flex flex-col justify-between border p-8 transition-all duration-500 rounded-none cursor-pointer hover:shadow-2xl hover:shadow-[#bfa854]/[0.01] ${
                              isSelected
                                ? 'border-[#bfa854] bg-[#bfa854]/[0.02]'
                                : 'border-white/[0.04] bg-[#07070a] hover:border-[#bfa854]/30'
                            }`}
                            id={`video-tile-${preset.id}`}
                          >
                            <div className="space-y-4">
                              <div className="flex items-center justify-between font-mono text-[9px] text-[#bfa854]">
                                <span className="font-extrabold tracking-[0.25em]">{preset.label}</span>
                                <span className={`h-2 w-2 rounded-full ${isSelected ? 'bg-[#bfa854] animate-pulse' : 'bg-transparent'}`} />
                              </div>

                              <div className="text-left">
                                <span className="font-display text-3xl font-extrabold text-white leading-none block">
                                  {preset.id === 'max' ? 'AUTO-MAX' : `${preset.id}P`}
                                </span>
                                <span className="font-sans text-[11px] font-light text-gray-400 block mt-2.5 leading-relaxed">
                                  {preset.sub}
                                </span>
                              </div>
                            </div>

                            <div className="mt-8 pt-6 border-t border-white/[0.04] flex items-center justify-between" id={`video-tile-actions-${preset.id}`}>
                              <span className="font-mono text-[9px] text-gray-500 uppercase tracking-widest">
                                {preset.codec}
                              </span>
                              
                              <button
                                type="button"
                                className="flex h-8 items-center gap-1.5 font-mono text-[9px] font-black uppercase tracking-[0.2em] border-b border-transparent group-hover:border-[#bfa854] text-[#bfa854] transition-all"
                              >
                                <span>HEIST STREAM</span>
                                <ArrowRight className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    /* AUDIO GALLERIES GRID */
                    <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3" id="audio-exposition-grid">
                      {AUDIO_PRESETS.map((preset) => {
                        const isSelected = selectedAudioId === preset.id && isAudioMode;
                        return (
                          <div
                            key={preset.id}
                            onClick={() => {
                              setSelectedAudioId(preset.id);
                              setDownloadLink(null);
                              executeHeistFlow(undefined, preset.id, true);
                            }}
                            className={`group relative flex flex-col justify-between border p-8 transition-all duration-500 rounded-none cursor-pointer hover:shadow-2xl hover:shadow-[#bfa854]/[0.01] ${
                              isSelected
                                ? 'border-[#bfa854] bg-[#bfa854]/[0.02]'
                                : 'border-white/[0.04] bg-[#07070a] hover:border-[#bfa854]/30'
                            }`}
                            id={`audio-tile-${preset.id}`}
                          >
                            <div className="space-y-4">
                              <div className="flex items-center justify-between font-mono text-[9px] text-[#bfa854]">
                                <span className="font-extrabold tracking-[0.25em]">{preset.label}</span>
                                <span className={`h-2 w-2 rounded-full ${isSelected ? 'bg-[#bfa854] animate-pulse' : 'bg-transparent'}`} />
                              </div>

                              <div className="text-left">
                                <span className="font-display text-3xl font-extrabold text-white leading-none block">
                                  {preset.format}
                                </span>
                                <span className="font-sans text-[11px] font-light text-gray-400 block mt-2.5 leading-relaxed">
                                  {preset.sub}
                                </span>
                              </div>
                            </div>

                            <div className="mt-8 pt-6 border-t border-white/[0.04] flex items-center justify-between" id={`audio-tile-actions-${preset.id}`}>
                              <span className="font-mono text-[9px] text-gray-500 uppercase tracking-widest">
                                {preset.info}
                              </span>

                              <button
                                type="button"
                                className="flex h-8 items-center gap-1.5 font-mono text-[9px] font-black uppercase tracking-[0.2em] border-b border-transparent group-hover:border-[#bfa854] text-[#bfa854] transition-all"
                              >
                                <span>AURA EXTRACT</span>
                                <ArrowRight className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* ANCHOR BLOCK FOR THE INTERACTIVE PROGRESS ENGINE AND STATUS */}
                <div className="border border-white/[0.04] bg-[#08080a] p-8 sm:p-12 text-left relative max-w-3xl mx-auto space-y-8" id="pipeline-progress-anchor">
                  
                  <div className="flex items-center justify-between border-b border-white/[0.04] pb-5" id="pro-header">
                    <div>
                      <span className="font-mono text-[8px] uppercase tracking-[0.3em] text-[#bfa854] block mb-1">BYPASS PROCESS MONITOR</span>
                      <h3 className="font-display text-lg font-bold text-white uppercase tracking-wider">SECURE HEIST WORKSPACE</h3>
                    </div>
                    <div className="font-mono text-[9px] text-gray-500 tracking-wider font-semibold">
                      ENGINE CONFIG ID: {selectedVideoId.toUpperCase()}
                    </div>
                  </div>

                  <div className="space-y-4" id="main-control-board">
                    {/* If translation error has occurred */}
                    {errorMsg && (
                      <div className="p-4 bg-red-950/10 border border-red-500/20 text-left font-sans text-xs space-y-1" id="workbook-error">
                        <span className="font-mono text-[9px] text-red-400 tracking-widest uppercase font-bold block mb-1">TRANSLATION BREACHED</span>
                        <p className="text-gray-400 font-light leading-relaxed">{errorMsg}</p>
                        <p className="text-gray-600 font-mono text-[8px] pt-3 leading-relaxed">
                          💡 RE-TRY ADVICE: Alternate connection tunnels may be congested. Selecting an alternate resolution scale (e.g. 720p HD) reschedules the extraction path instantaneously on secondary nodes.
                        </p>
                      </div>
                    )}

                    {/* Progress representation bar (gorgeous hairline design styled strictly to move the user's intent) */}
                    <AnimatePresence>
                      {isProcessingDownload && (
                        <motion.div
                          key="progress-bar-container"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="space-y-3 pt-2"
                          id="realtime-progress-panel-bar"
                        >
                          <div className="flex items-center justify-between font-mono text-[9px] text-gray-400 font-bold tracking-widest" id="progress-text-headers">
                            <span className="text-[#bfa854] animate-pulse flex items-center gap-2">
                              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#bfa854] animate-ping" />
                              {progressPhase}
                            </span>
                            <span className="text-white text-xs bg-white/[0.04] px-2.5 py-1 font-mono">{Math.floor(downloadProgress)}%</span>
                          </div>

                          {/* Outer standard CSS progress line with transition width animation */}
                          <div className="h-1.5 w-full bg-white/[0.02] border border-white/[0.04] p-[1px] overflow-hidden" id="progress-outer-track">
                            <div 
                              className="h-full gold-progress-gradient transition-all duration-300 ease-out"
                              style={{ width: `${downloadProgress}%` }}
                              id="progress-inner-fill"
                            />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Final Trigger Download Container Action */}
                    {!downloadLink ? (
                      <button
                        type="button"
                        onClick={() => executeHeistFlow()}
                        disabled={isProcessingDownload}
                        className="w-full flex items-center justify-center gap-3 bg-[#bfa854] hover:bg-[#aa8f40] disabled:bg-[#4a4221] disabled:text-gray-400 font-mono text-[10px] font-bold tracking-[0.25em] text-black py-5 uppercase transition-all shadow-xl shadow-[#bfa854]/5 disabled:cursor-not-allowed cursor-pointer"
                        id="generate-stream-btn"
                      >
                        {isProcessingDownload ? (
                          <>
                            <RefreshCw className="h-4 w-4 animate-spin shrink-0" />
                            <span>Translating Media Packets...</span>
                          </>
                        ) : (
                          <>
                            <Download className="h-4 w-4 stroke-[1.5]" />
                            <span>
                              Initiate Extraction ({isAudioMode ? selectedAudioId.toUpperCase() : (selectedVideoId === 'max' ? 'BEST HD' : `${selectedVideoId}P`)})
                            </span>
                          </>
                        )}
                      </button>
                    ) : (
                      <div className="flex flex-col sm:flex-row gap-4" id="success-action-deck">
                        <a
                          href={downloadLink}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="flex-grow flex items-center justify-center gap-3 bg-emerald-600 hover:bg-emerald-700 text-white font-mono text-[10px] font-bold tracking-[0.25em] py-5 uppercase transition-all shadow-xl hover:shadow-emerald-500/10"
                          id="save-to-device-link"
                        >
                          <Check className="h-4.5 w-4.5 stroke-[2]" />
                          <span>Retrieve Completed Media File</span>
                        </a>
                        
                        <button
                          type="button"
                          onClick={() => setDownloadLink(null)}
                          className="border border-white/[0.08] hover:border-white/25 bg-transparent hover:bg-white/[0.02] text-gray-300 px-6 py-5 font-mono text-[10px] tracking-[0.2em] uppercase transition-colors cursor-pointer"
                          id="reset-for-another-format"
                        >
                          RE-DECRYPT CONTAINER
                        </button>
                      </div>
                    )}
                  </div>
                </div>

              </div>

            </motion.section>
          )}
        </AnimatePresence>

        {/* REGISTRY HISTORY LOGGER SECTION */}
        <section className="pt-8" id="download-history-parent-wrapper">
          <HistoryList 
            items={history}
            onRemoveItem={handleRemoveHistoryItem}
            onClearHistory={handleClearHistory}
          />
        </section>

        {/* SPEC / ENGINEERING SPECIFICATIONS GRID (FeatureCards.tsx) */}
        <FeatureCards />
        
      </main>

      <footer className="bg-[#030304] border-t border-white/[0.03] py-16 text-center text-xs text-gray-500 z-10 font-sans" id="main-footer">
        <div className="mx-auto max-w-7xl px-8 space-y-4">
          <p className="font-mono text-[9px] tracking-[0.3em] text-[#bfa854] uppercase font-bold">
            TUBEHEIST DIGITAL RECONSTRUCTION
          </p>
          <div className="flex flex-wrap justify-center gap-1.5 text-[8px] font-mono text-gray-600 uppercase tracking-widest" id="ledger-badges">
            <span className="bg-white/[0.01] border border-white/5 px-2.5 py-1">Vite V6.0</span>
            <span className="bg-white/[0.01] border border-white/5 px-2.5 py-1">React V19.0</span>
            <span className="bg-white/[0.01] border border-white/5 px-2.5 py-1">Cobalt-API Proxy</span>
            <span className="bg-white/[0.01] border border-white/5 px-2.5 py-1">Decentralized Tunnels</span>
          </div>
          <p className="font-sans text-[11px] text-gray-500 max-w-xl mx-auto leading-relaxed font-light">
            Tubeheist coordinates unencrypted, standard, high-speed regional CDN gateway connections. No streams or temporary media files are retained on our servers. Made purely to elevate digital interaction interfaces.
          </p>
        </div>
      </footer>
    </div>
  );
}
