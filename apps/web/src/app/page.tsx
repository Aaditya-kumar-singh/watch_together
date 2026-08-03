'use client';

import React from 'react';
import Link from 'next/link';
import { Play, Tv, Shield, ArrowRight, Video, Radio, Cpu } from 'lucide-react';

export default function Home() {
  return (
    <div className="bg-slate-950 min-h-screen text-slate-100 flex flex-col font-sans select-none relative overflow-hidden">
      
      {/* Background radial glow */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-indigo-900/10 rounded-full blur-[120px]" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-900/10 rounded-full blur-[120px]" />

      <main className="flex-1 flex flex-col items-center justify-center max-w-4xl mx-auto p-6 text-center z-10">
        
        {/* Title Badge */}
        <div className="flex items-center gap-2 px-3 py-1 bg-slate-900 border border-slate-800 rounded-full mb-6 text-xs text-indigo-400 font-mono tracking-wider">
          <Cpu size={14} className="animate-pulse" />
          REAL-TIME SYNCHRONIZATION SYSTEM
        </div>

        {/* Heading */}
        <h1 className="text-4xl md:text-6xl font-black tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-500 bg-clip-text text-transparent leading-tight mb-4">
          Dual-App Video Sync
        </h1>
        <p className="text-slate-400 text-sm md:text-base max-w-2xl leading-relaxed mb-10">
          A production-inspired real-time platform that maintains a single authoritative timeline while multiple display screens synchronize themselves with sub-millisecond precision.
        </p>

        {/* Selection Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl mb-12">
          
          {/* Controller Card */}
          <div className="group bg-slate-900/40 hover:bg-slate-900/80 border border-slate-800/80 hover:border-slate-700/80 rounded-2xl p-6 transition-all duration-300 flex flex-col items-start text-left shadow-lg">
            <div className="p-3 bg-indigo-500/10 rounded-xl border border-indigo-500/20 text-indigo-400 mb-4 group-hover:scale-110 transition-transform">
              <Radio size={20} />
            </div>
            <h2 className="text-lg font-bold text-slate-100 mb-2">Controller Dashboard</h2>
            <p className="text-slate-400 text-xs leading-relaxed mb-6">
              Launch the master administrative dashboard to control playback, manage videos, track telemetry charts, and view real-time drifts.
            </p>
            <Link
              href="/controller"
              target="_blank"
              className="mt-auto flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl transition-all shadow-[0_0_15px_rgba(99,102,241,0.2)]"
            >
              LAUNCH CONTROLLER <ArrowRight size={14} />
            </Link>
          </div>

          {/* Displays Card */}
          <div className="group bg-slate-900/40 hover:bg-slate-900/80 border border-slate-800/80 hover:border-slate-700/80 rounded-2xl p-6 transition-all duration-300 flex flex-col items-start text-left shadow-lg">
            <div className="p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20 text-emerald-400 mb-4 group-hover:scale-110 transition-transform">
              <Tv size={20} />
            </div>
            <h2 className="text-lg font-bold text-slate-100 mb-2">Display Clients</h2>
            <p className="text-slate-400 text-xs leading-relaxed mb-6">
              Open multiple display screens in separate windows or side-by-side tabs. They will automatically register and sync to the server.
            </p>
            <div className="mt-auto flex flex-wrap gap-2 w-full">
              <Link
                href="/display?id=display-1"
                target="_blank"
                className="flex-1 flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-extrabold text-[10px] px-3 py-2.5 rounded-xl transition-all"
              >
                DISPLAY 1
              </Link>
              <Link
                href="/display?id=display-2"
                target="_blank"
                className="flex-1 flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-extrabold text-[10px] px-3 py-2.5 rounded-xl transition-all"
              >
                DISPLAY 2
              </Link>
            </div>
          </div>

        </div>

        {/* Feature Highlights */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 w-full max-w-3xl pt-8 border-t border-slate-900 text-left">
          <div className="flex gap-3">
            <div className="text-indigo-400 mt-1"><Shield size={16} /></div>
            <div>
              <h3 className="text-xs font-bold text-slate-300">Authoritative State</h3>
              <p className="text-[10px] text-slate-500 mt-1">Timeline calculations anchor to server clock timestamps.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="text-amber-400 mt-1"><Radio size={16} /></div>
            <div>
              <h3 className="text-xs font-bold text-slate-300">Heartbeat feedback</h3>
              <p className="text-[10px] text-slate-500 mt-1">Displays update server database every 250ms with telemetry.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="text-emerald-400 mt-1"><Play size={16} /></div>
            <div>
              <h3 className="text-xs font-bold text-slate-300">2-Level Correction</h3>
              <p className="text-[10px] text-slate-500 mt-1">Soft rate steering (0.95x - 1.05x) and hard seeks with lockouts.</p>
            </div>
          </div>
        </div>

      </main>

      {/* Footer */}
      <footer className="py-6 text-center text-[10px] text-slate-700 font-mono border-t border-slate-900/60 z-10">
        REAL-TIME TIMELINE SYNC ENGINE &bull; VERSION 1.0.0
      </footer>
    </div>
  );
}
