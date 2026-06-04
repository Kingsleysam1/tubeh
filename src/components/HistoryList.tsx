/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Download, Video, Volume2, Trash2, Clock, ArrowUpRight } from 'lucide-react';
import { DownloaderHistoryItem } from '../types';

interface HistoryListProps {
  items: DownloaderHistoryItem[];
  onRemoveItem: (id: string) => void;
  onClearHistory: () => void;
}

export default function HistoryList({ items, onRemoveItem, onClearHistory }: HistoryListProps) {
  if (items.length === 0) {
    return (
      <div className="border border-white/[0.04] bg-[#07070a] p-12 text-center relative overflow-hidden" id="empty-history-wrapper">
        <div className="absolute inset-0 pointer-events-none opacity-5 bg-[radial-gradient(#bfa854_1px,transparent_1px)] bg-[size:1rem_1rem]" />
        <div className="mx-auto flex h-10 w-10 items-center justify-center bg-white/[0.01] text-gray-400 mb-5 border border-white/[0.06]" id="clock-icon-wrapper">
          <Clock className="h-4.5 w-4.5 text-[#bfa854]" />
        </div>
        <h3 className="font-display text-sm font-bold text-[#f7f5eb] uppercase tracking-wider" id="empty-history-title">
          No Heisted Elements
        </h3>
        <p className="mt-2 font-sans text-xs text-gray-400 max-w-sm mx-auto leading-relaxed font-light" id="empty-history-subtitle">
          Your extracted video and audio pipeline traces will accumulate here, logged safely to your browser cache.
        </p>
      </div>
    );
  }

  return (
    <div className="border border-white/[0.04] bg-[#07070a] p-6 sm:p-12" id="history-section-wrapper">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between border-b border-white/[0.05] pb-6 mb-8 gap-4" id="history-header">
        <div className="text-left">
          <span className="font-mono text-[9px] uppercase tracking-[0.3em] text-[#bfa854] font-semibold block mb-2">
            — LIVE COGNITION DATABASE LOG
          </span>
          <h3 className="font-display text-2xl font-extrabold text-white uppercase tracking-tight" id="history-section-title">
            EXTRACTED REGISTRY
          </h3>
        </div>
        <button
          onClick={onClearHistory}
          className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#bfa854] hover:text-white border border-[#bfa854]/20 hover:border-white/20 bg-transparent px-4 py-2 hover:bg-[#bfa854]/5 transition-all cursor-pointer text-left sm:text-right"
          id="clear-all-history-btn"
        >
          PURE LOG CLEAR
        </button>
      </div>

      <div className="divide-y divide-white/[0.04]" id="history-items-container">
        {items.map((item, index) => {
          const formattedIndex = String(index + 1).padStart(2, '0');
          return (
            <div 
              key={item.id} 
              className="flex flex-col md:flex-row md:items-center justify-between py-6 gap-6 group transition-all"
              id={`history-row-${item.id}`}
            >
              <div className="flex items-start md:items-center gap-6 overflow-hidden flex-grow">
                {/* Vintage index design */}
                <div className="font-mono text-xs text-gray-600 group-hover:text-[#bfa854] transition-colors pt-1 md:pt-0">
                  {formattedIndex}
                </div>

                {/* Elegant subtle frame */}
                <div className="relative h-14 w-24 shrink-0 overflow-hidden bg-black border border-white/[0.06]" id={`history-thumb-container-${item.id}`}>
                  <img
                    src={item.thumbnailUrl}
                    alt={item.title}
                    className="h-full w-full object-cover grayscale opacity-60 group-hover:grayscale-0 group-hover:opacity-90 transition-all duration-500 scale-100 group-hover:scale-105"
                    referrerPolicy="no-referrer"
                    id={`history-thumb-img-${item.id}`}
                  />
                  <div className="absolute top-1.5 right-1.5 h-5 w-5 rounded-full bg-black/60 border border-white/5 flex items-center justify-center">
                    {item.isVideo ? (
                      <Video className="h-2.5 w-2.5 text-white/80" />
                    ) : (
                      <Volume2 className="h-2.5 w-2.5 text-[#bfa854]" />
                    )}
                  </div>
                </div>

                <div className="flex flex-col min-w-0 text-left" id={`history-meta-container-${item.id}`}>
                  <span className="truncate font-display text-sm font-semibold text-gray-200 group-hover:text-[#bfa854] transition-colors leading-snug mb-1" id={`history-item-title-${item.id}`}>
                    {item.title}
                  </span>
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-500 font-sans" id={`history-item-author-row-${item.id}`}>
                    <span>{item.author}</span>
                    <span className="opacity-30">•</span>
                    <span className="font-mono text-[9px] text-[#bfa854] font-medium tracking-wider uppercase">
                      {item.isVideo ? 'VIDEO CONTAINER' : 'PURE STEREO AUDIO'}
                    </span>
                    {item.quality && (
                      <>
                        <span className="opacity-30">•</span>
                        <span className="font-mono text-[9px] text-gray-400 font-bold uppercase">
                          {item.quality === 'max' ? 'BEST RESOLUTION' : `${item.quality}P`}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Download actions designed like a high-end agency link list */}
              <div className="flex items-center gap-2 justify-end pl-12 md:pl-0" id={`history-actions-${item.id}`}>
                <a
                  href={item.downloadUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="flex items-center gap-2 font-mono text-[10px] tracking-[0.2em] font-medium uppercase text-gray-400 hover:text-white border border-white/[0.08] hover:border-[#bfa854] px-4 py-2.5 bg-transparent group-hover:bg-[#bfa854]/5 transition-all"
                  title="Acquire container"
                  id={`history-download-link-${item.id}`}
                >
                  <Download className="h-3 w-3 text-[#bfa854]" />
                  <span>DOWNLOAD</span>
                </a>
                <button
                  onClick={() => onRemoveItem(item.id)}
                  className="flex h-9 w-9 items-center justify-center border border-transparent hover:border-red-500/10 hover:bg-red-500/[0.02] text-gray-600 hover:text-red-400 transition-all cursor-pointer"
                  title="Purge trace"
                  id={`history-trash-btn-${item.id}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
