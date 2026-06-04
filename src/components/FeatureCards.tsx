/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Shield, Sparkles, Compass, Eye, ArrowDown, Activity } from 'lucide-react';

export default function FeatureCards() {
  const specs = [
    {
      title: 'Lossless Audio Extraction',
      description: 'Isolate crystal-clear audio waves directly from high speed CDN clusters. Package streams instantly into PCM WAV or MP3 codecs.',
      category: 'AUDIO ACQUISITION',
      ref: '[ SPEC 01 ]'
    },
    {
      title: 'Cinematic High Frame Resolution',
      description: 'Preserve full color density, master bitrates, and source frame configurations. Render UHD 4K, 2K, and 1080p with zero visual noise.',
      category: 'VISUAL PRESERVATION',
      ref: '[ SPEC 02 ]'
    },
    {
      title: 'Ad Filtering & Stream Cleansing',
      description: 'Bypass telemetry trackers, region-specific licensing gates, and repetitive sponsor segments to yield pristine local media files.',
      category: 'TRANSLATION RETRIEVAL',
      ref: '[ SPEC 03 ]'
    }
  ];

  return (
    <section className="mt-24 border-t border-white/[0.04] pt-16" id="features-section">
      <div className="flex flex-col md:flex-row md:items-end justify-between pb-12">
        <div className="text-left max-w-xl">
          <span className="font-mono text-[9px] uppercase tracking-[0.3em] text-[#bfa854] font-semibold mb-4 block">
            — PIPELINE CAPABILITIES
          </span>
          <h2 className="font-display text-4xl font-extrabold tracking-tight text-white uppercase" id="features-heading">
            CRAFTED ENGINEERING
          </h2>
          <p className="mt-3 text-sm text-gray-400 font-sans leading-relaxed" id="features-subheading">
            TUBEHEIST operates on an intelligent routing framework built to parse and packetize media channels with pure artistic intent.
          </p>
        </div>
        <div className="mt-6 md:mt-0 font-mono text-[10px] text-gray-500 uppercase tracking-[0.25em] text-left md:text-right max-w-[200px]">
          [ BUILT FOR CREATIVE DIRECTORS AND DIGITAL COLLECTORS ]
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3" id="features-grid">
        {specs.map((item, idx) => (
          <div
            key={idx}
            className="group relative flex flex-col justify-between border border-white/[0.04] bg-[#08080b] p-8 hover:border-[#bfa854]/30 transition-all duration-500 rounded-none text-left"
            id={`feature-card-${idx}`}
          >
            <div>
              <div className="flex items-center justify-between font-mono text-[10px] text-gray-500 mb-8" id={`feature-tag-row-${idx}`}>
                <span className="text-[#bfa854] tracking-[0.2em]">{item.category}</span>
                <span className="opacity-40">{item.ref}</span>
              </div>
              <h3 className="font-display text-base font-bold text-white mb-3 tracking-wide group-hover:text-[#bfa854] transition-colors" id={`feature-item-title-${idx}`}>
                {item.title}
              </h3>
              <p className="font-sans text-xs leading-relaxed text-gray-400 font-light" id={`feature-item-desc-${idx}`}>
                {item.description}
              </p>
            </div>

            <div className="mt-8 pt-6 border-t border-white/[0.03] flex items-center justify-between font-mono text-[9px] text-gray-600 tracking-widest">
              <span>CDN ACCESS SECURED</span>
              <ArrowDown className="h-3 w-3 translate-y-0 group-hover:translate-y-1 transition-transform duration-300 text-gray-500 group-hover:text-[#bfa854]" />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-12 rounded-none border border-white/[0.04] bg-[#07070a] p-6 sm:p-8 flex gap-5 text-left items-start gold-border-glow" id="disclaimer-container">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-[#bfa854]/5 text-[#bfa854] border border-[#bfa854]/15" id="disclaimer-icon-wrapper">
          <Shield className="h-5 w-5" />
        </div>
        <div className="flex flex-col">
          <h4 className="font-mono text-[10px] uppercase tracking-[0.25em] text-[#bfa854] font-bold" id="disclaimer-title">
            TERMS OF ENGAGEMENT
          </h4>
          <p className="font-sans text-xs text-gray-400 font-light leading-relaxed mt-2" id="disclaimer-text">
            This private extraction suite retrieves content under fair-use protocols. Media outputs are intended for high-fidelity personal preservation, offline workspace previews, and acoustic auditing.
          </p>
        </div>
      </div>
    </section>
  );
}
