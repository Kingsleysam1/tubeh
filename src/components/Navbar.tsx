/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Github, Hexagon, Compass } from 'lucide-react';

export default function Navbar() {
  return (
    <header className="border-b border-white/[0.04] bg-[#060608]/90 backdrop-blur-md sticky top-0 z-50 transition-all duration-300" id="main-header">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6 sm:px-12">
        <div className="flex items-center gap-4" id="header-brand-container">
          <div className="flex h-10 w-10 items-center justify-center rounded-sm bg-[#bfa854]/5 border border-[#bfa854]/20 text-[#bfa854] shadow-sm shadow-[#bfa854]/5" id="brand-icon-wrapper">
            <Hexagon className="h-5 w-5 stroke-[1.5]" />
          </div>
          <div className="flex flex-col text-left">
            <span className="font-display text-base font-bold tracking-[0.25em] text-[#f7f5eb] leading-tight select-none">
              TUBEHEIST.
            </span>
            <span className="font-mono text-[8px] uppercase tracking-[0.3em] text-[#bfa854] font-medium mt-0.5">
              STREAM EXTRACTION LAB
            </span>
          </div>
        </div>

        <nav className="flex items-center gap-6" id="main-nav-links">
          <div className="hidden md:flex items-center gap-2.5 rounded-full bg-white/[0.02] border border-white/5 px-4 py-1.5 font-mono text-[9px] font-medium text-gray-400 tracking-wider">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#bfa854] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#bfa854]"></span>
            </span>
            <span>BYPASS DIRECTIVE 1.05 ACTIVE</span>
          </div>
          
          <a
            href="https://github.com/imputnet/cobalt"
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-9 items-center gap-2 rounded-none border-b border-transparent hover:border-[#bfa854]/60 text-[10px] font-mono tracking-widest uppercase text-gray-400 hover:text-[#fdfdfa] transition-all"
            id="nav-github-link"
          >
            <Github className="h-3.5 w-3.5" />
            <span>OPEN COBALT ENGINE</span>
          </a>
        </nav>
      </div>
    </header>
  );
}
