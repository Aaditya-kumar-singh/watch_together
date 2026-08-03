'use client';

import React, { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import { Play, Pause, RotateCcw, Monitor, Layers, Compass, Video } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ConnectionQuality } from '../types';
import LogConsole from './LogConsole';

export default function ControllerDashboard() {
  const {
    session,
    displays,
    isConnected,
    isConnecting,
    initializeSocket,
    registerController,
    playVideo,
    pauseVideo,
    seekVideo,
    restartVideo,
    changeVideo,
  } = useStore();

  const [driftHistory, setDriftHistory] = useState<any[]>([]);
  const [videos, setVideos] = useState<any[]>([]);

  const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:4000';

  useEffect(() => {
    initializeSocket();
    // Register as controller after a short delay to ensure socket is ready
    const timer = setTimeout(() => registerController(), 500);

    // Fetch predefined videos list
    fetch(`${SERVER_URL}/api/videos`)
      .then(res => res.json())
      .then(data => setVideos(data))
      .catch(err => console.error('Error fetching videos:', err));

    return () => clearTimeout(timer);
  }, []);

  // Update drift history for the Recharts graph
  useEffect(() => {
    if (displays.length === 0) return;

    const timestamp = new Date().toLocaleTimeString();
    const entry: any = { time: timestamp };
    displays.forEach(display => {
      entry[display.clientId] = display.drift;
    });

    setDriftHistory(prev => {
      const next = [...prev, entry];
      if (next.length > 30) next.shift();
      return next;
    });
  }, [displays]);

  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    seekVideo(parseFloat(e.target.value));
  };

  const getQualityColor = (quality: ConnectionQuality) => {
    switch (quality) {
      case 'excellent': return 'bg-emerald-500';
      case 'good': return 'bg-green-400';
      case 'fair': return 'bg-amber-500';
      case 'poor': return 'bg-rose-500';
    }
  };

  const getQualityLabel = (quality: ConnectionQuality) => {
    switch (quality) {
      case 'excellent': return 'Excellent';
      case 'good': return 'Good';
      case 'fair': return 'Fair';
      case 'poor': return 'Poor';
    }
  };

  const getDriftStatusColor = (drift: number) => {
    const absDrift = Math.abs(drift);
    if (absDrift < 150) return 'bg-emerald-500';
    if (absDrift < 500) return 'bg-amber-500';
    return 'bg-rose-500';
  };

  const getDriftStatusLabel = (drift: number) => {
    const absDrift = Math.abs(drift);
    if (absDrift < 150) return 'In Sync';
    if (absDrift < 500) return 'Soft Correcting';
    return 'Drift Warning';
  };

  const getTimeSince = (timestamp: number) => {
    const seconds = Math.round((Date.now() - timestamp) / 1000);
    if (seconds < 1) return 'just now';
    if (seconds < 60) return `${seconds}s ago`;
    return `${Math.floor(seconds / 60)}m ago`;
  };

  const activeDisplays = displays.filter(d => d.connectionStatus === 'connected');

  return (
    <div className="flex flex-col gap-6 text-white max-w-6xl mx-auto p-4 md:p-6 bg-slate-950 min-h-screen">
      {/* Top Bar / Status */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] uppercase font-extrabold tracking-widest bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
              Controller
            </span>
            {activeDisplays.length > 0 && (
              <span className="px-2 py-0.5 rounded text-[10px] uppercase font-extrabold tracking-widest bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                {activeDisplays.length} Display{activeDisplays.length !== 1 ? 's' : ''} Active
              </span>
            )}
          </div>
          <h1 className="text-2xl font-black tracking-tight mt-1 bg-gradient-to-r from-white via-slate-200 to-slate-500 bg-clip-text text-transparent">
            MULTI-DISPLAY VIDEO SYNC
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-4 py-2 rounded-xl">
            <div className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              {isConnecting ? 'CONNECTING...' : isConnected ? 'SERVER CONNECTED' : 'DISCONNECTED'}
            </span>
          </div>
        </div>
      </header>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left column: Video Selector, Playback Controls */}
        <div className="lg:col-span-2 flex flex-col gap-6">

          {/* Active Session & Predefined Video Selection */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col gap-4">
            <h2 className="text-sm uppercase font-bold tracking-wider text-slate-400 flex items-center gap-2">
              <Video size={16} className="text-indigo-400" />
              Video Selector
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {videos.map((vid) => (
                <button
                  key={vid.id}
                  onClick={() => changeVideo(vid.id)}
                  className={`flex flex-col gap-1 p-4 rounded-xl border text-left transition-all ${
                    session?.selectedVideo?.id === vid.id
                      ? 'bg-indigo-600/10 border-indigo-500 text-white shadow-[0_0_12px_rgba(99,102,241,0.2)]'
                      : 'bg-slate-950/40 border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span className="text-xs font-black tracking-tight">{vid.title}</span>
                  <span className="text-[10px] text-slate-500">{formatTime(vid.duration)} duration</span>
                </button>
              ))}
            </div>
          </div>

          {/* Master Timeline & Transport Control */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col gap-5">
            <h2 className="text-sm uppercase font-bold tracking-wider text-slate-400 flex items-center gap-2">
              <Compass size={16} className="text-indigo-400" />
              Authoritative Playback Controls
            </h2>

            {/* Video Meta Info */}
            <div className="bg-slate-950/60 border border-slate-800/80 px-4 py-3 rounded-xl flex items-center justify-between">
              <div>
                <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Currently Playing</div>
                <div className="font-bold text-slate-200">{session?.selectedVideo?.title || 'None Selected'}</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Sequence</div>
                <div className="font-bold text-indigo-400 font-mono">{session?.sequenceNumber ?? 0}</div>
              </div>
            </div>

            {/* Scrub Slider */}
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-xs font-mono text-slate-400 mb-1">
                <span>{formatTime(session?.expectedPosition || 0)}</span>
                <span>{formatTime(session?.selectedVideo?.duration || 0)}</span>
              </div>
              <input
                type="range"
                min="0"
                max={session?.selectedVideo?.duration || 100}
                step="0.1"
                value={session?.expectedPosition || 0}
                onChange={handleSeekChange}
                className="w-full h-1.5 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400 transition-all"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-3">
              {session?.isPlaying ? (
                <button
                  onClick={pauseVideo}
                  className="flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-5 py-2.5 rounded-xl transition-all shadow-[0_0_15px_rgba(245,158,11,0.2)]"
                >
                  <Pause size={16} /> PAUSE
                </button>
              ) : (
                <button
                  onClick={playVideo}
                  className="flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-5 py-2.5 rounded-xl transition-all shadow-[0_0_15px_rgba(16,185,129,0.2)]"
                >
                  <Play size={16} /> PLAY
                </button>
              )}

              <button
                onClick={restartVideo}
                className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 font-bold px-5 py-2.5 rounded-xl border border-slate-700 transition-all text-slate-200"
              >
                <RotateCcw size={16} /> RESTART
              </button>
            </div>
          </div>

          {/* Drift Graph */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col gap-4">
            <h2 className="text-sm uppercase font-bold tracking-wider text-slate-400 flex items-center gap-2">
              <Layers size={16} className="text-indigo-400" />
              Real-Time Drift Analytics (ms)
            </h2>

            <div className="h-60 w-full">
              {driftHistory.length === 0 ? (
                <div className="h-full flex items-center justify-center text-slate-600 text-xs">
                  Awaiting display telemetry...
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={driftHistory}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="time" stroke="#64748b" fontSize={9} />
                    <YAxis stroke="#64748b" fontSize={9} label={{ value: 'Drift (ms)', angle: -90, position: 'insideLeft', fill: '#64748b' }} />
                    <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff', fontSize: '11px' }} />
                    {displays.map((display, index) => {
                      const colors = ['#818cf8', '#34d399', '#f59e0b', '#f43f5e'];
                      return (
                        <Line
                          key={display.clientId}
                          type="monotone"
                          dataKey={display.clientId}
                          stroke={colors[index % colors.length]}
                          strokeWidth={2}
                          activeDot={{ r: 4 }}
                          dot={false}
                        />
                      );
                    })}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

        </div>

        {/* Right column: Display Monitor */}
        <div className="lg:col-span-1 flex flex-col gap-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col gap-4">
            <h2 className="text-sm uppercase font-bold tracking-wider text-slate-400 flex items-center gap-2">
              <Monitor size={16} className="text-indigo-400" />
              Connected Displays ({displays.length})
            </h2>

            <div className="flex flex-col gap-4">
              {displays.length === 0 ? (
                <div className="text-center py-16 border border-dashed border-slate-800 rounded-xl text-slate-600 text-xs">
                  No active displays connected.
                  <br />
                  <span className="text-[10px] text-slate-700">Open /display in new tabs</span>
                </div>
              ) : (
                displays.map((display) => (
                  <div
                    key={display.clientId}
                    className={`bg-slate-950 border rounded-xl p-4 flex flex-col gap-3 transition-all ${
                      display.connectionStatus === 'connected'
                        ? 'border-slate-800/80 hover:border-slate-700'
                        : 'border-slate-800/40 opacity-60'
                    }`}
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-slate-800/60 pb-2">
                      <span className="font-mono text-xs font-bold text-indigo-400">{display.clientId}</span>
                      <div className="flex items-center gap-1.5">
                        <div className={`w-2 h-2 rounded-full ${display.connectionStatus === 'connected' ? getDriftStatusColor(display.drift) : 'bg-red-500'}`} />
                        <span className="text-[10px] text-slate-400 font-bold uppercase">
                          {display.connectionStatus === 'connected' ? getDriftStatusLabel(display.drift) : 'offline'}
                        </span>
                      </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs">
                      <div>
                        <span className="text-slate-500 text-[10px] uppercase block">Position</span>
                        <span className="font-mono font-bold text-slate-300">{formatTime(display.currentPosition)}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[10px] uppercase block">Drift</span>
                        <span className={`font-mono font-bold ${Math.abs(display.drift) > 150 ? 'text-amber-400' : 'text-slate-300'}`}>
                          {display.drift > 0 ? `+${display.drift}` : display.drift} ms
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[10px] uppercase block">Latency</span>
                        <span className="font-mono font-bold text-slate-300">{display.latency} ms</span>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[10px] uppercase block">Buffer</span>
                        <span className="font-mono font-bold text-slate-300">{display.bufferHealth.toFixed(1)}s</span>
                      </div>
                    </div>

                    {/* Status Footer */}
                    <div className="flex items-center justify-between bg-slate-900 border border-slate-800/60 px-3 py-1.5 rounded-lg text-[10px] font-bold text-slate-400">
                      <span>STATE: <span className="text-slate-200 uppercase">{display.connectionStatus === 'connected' ? display.playbackState : 'offline'}</span></span>
                      <span className="flex items-center gap-1">
                        <div className={`w-1.5 h-1.5 rounded-full ${display.connectionStatus === 'connected' ? getQualityColor(display.connectionQuality) : 'bg-red-500'}`} />
                        <span>{display.connectionStatus === 'connected' ? getQualityLabel(display.connectionQuality) : 'offline'}</span>
                      </span>
                      <span>HB: <span className="text-slate-200">{getTimeSince(display.lastHeartbeat)}</span></span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          <LogConsole />
        </div>

      </div>
    </div>
  );
}
