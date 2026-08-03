'use client';

import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import { Terminal, Trash2, ChevronDown, ChevronUp } from 'lucide-react';

export default function LogConsole() {
  const { logs, clearLogs } = useStore();
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden font-mono shadow-2xl">
      <div className="flex items-center justify-between px-4 py-3 bg-slate-950/60 border-b border-slate-800/80">
        <div className="flex items-center gap-2 text-slate-300">
          <Terminal size={16} className="text-indigo-400" />
          <span className="text-sm font-semibold tracking-wider">SYSTEM LOG CONSOLE</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={clearLogs}
            className="text-slate-500 hover:text-red-400 transition-colors p-1"
            title="Clear logs"
          >
            <Trash2 size={14} />
          </button>
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="text-slate-400 hover:text-white transition-colors"
          >
            {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="p-3 max-h-48 overflow-y-auto text-[11px] leading-relaxed flex flex-col gap-1 h-48 select-text">
          {logs.length === 0 ? (
            <div className="text-slate-600 text-center py-12">Console idle. No events logged yet.</div>
          ) : (
            logs.map((log, idx) => {
              let typeColor = 'text-slate-400';
              if (log.type === 'success') typeColor = 'text-emerald-400 font-semibold';
              if (log.type === 'warning') typeColor = 'text-amber-400 font-semibold';
              if (log.type === 'error') typeColor = 'text-rose-400 font-semibold';
              if (log.type === 'sync') typeColor = 'text-cyan-400';

              return (
                <div key={idx} className="flex gap-2 hover:bg-slate-800/40 p-0.5 rounded transition-all">
                  <span className="text-slate-500">[{log.timestamp}]</span>
                  <span className={`uppercase font-bold tracking-wider ${typeColor}`}>
                    [{log.type}]
                  </span>
                  <span className="text-slate-300">{log.message}</span>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
