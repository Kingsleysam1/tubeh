/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface VideoInfo {
  title: string;
  author: string;
  thumbnailUrl: string;
  videoId: string;
  originalUrl: string;
}

export type VideoQuality = '144' | '240' | '360' | '480' | '720' | '1080' | '1440' | '2160' | 'max';

export type AudioFormat = 'mp3' | 'ogg' | 'wav' | 'aac' | 'opus';

export interface DownloadRequest {
  url: string;
  videoQuality?: VideoQuality;
  audioFormat?: AudioFormat;
  isAudioOnly?: boolean;
}

export interface DownloadResponse {
  status: 'success' | 'rate-limit' | 'error' | 'redirect' | 'tunnel' | 'picker';
  url?: string;
  text?: string;
  picker?: Array<{
    url: string;
    type: string;
    text?: string;
  }>;
}

export interface DownloaderHistoryItem {
  id: string;
  title: string;
  author: string;
  thumbnailUrl: string;
  originalUrl: string;
  downloadUrl: string;
  timestamp: number;
  isVideo: boolean;
  quality?: string;
}
