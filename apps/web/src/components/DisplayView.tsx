'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useStore } from '../store/useStore';
import { Heart, Activity, Wifi, ShieldAlert, CheckCircle, RefreshCw } from 'lucide-react';

interface DisplayViewProps {
  clientId: string;
}

export default function DisplayView({ clientId }: DisplayViewProps) {
  const {
    session,
    isConnected,
    initializeSocket,
    registerDisplay,
    sendHeartbeat,
    addLog,
  } = useStore();

  const videoRef = useRef<HTMLVideoElement>(null);

  // Local Telemetry State
  const [drift, setDrift] = useState<number>(0);
  const [latency, setLatency] = useState<number>(0);
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);
  const [syncStatus, setSyncStatus] = useState<'in-sync' | 'soft' | 'hard' | 'cooldown' | 'seeking' | 'buffering'>('in-sync');
  const [expectedPos, setExpectedPos] = useState<number>(0);
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const [heartbeatCount, setHeartbeatCount] = useState<number>(0);
  const [lastCorrection, setLastCorrection] = useState<string>('—');
  const [videoError, setVideoError] = useState<string | null>(null);

  // Lock corrections after a hard seek to let player buffer
  const cooldownRef = useRef<boolean>(false);
  const lastSequenceRef = useRef<number>(-1);

  const [isMounted, setIsMounted] = useState<boolean>(false);

  useEffect(() => {
    setIsMounted(true);
    initializeSocket();
    registerDisplay(clientId);
  }, []);

  // Calculate expected position from authoritative session state
  const calculateExpectedPosition = useCallback((): number => {
    if (!session) return 0;
    if (!session.isPlaying) {
      return session.authoritativePosition;
    }
    const elapsed = (Date.now() - session.playbackStartedAt) / 1000;
    const expected = session.authoritativePosition + elapsed * session.playbackRate;
    return Math.min(Math.max(0, expected), session.selectedVideo?.duration || 0);
  }, [session]);

  // Cooldown trigger after hard seek
  const triggerCooldown = useCallback((ms: number) => {
    cooldownRef.current = true;
    setLastCorrection(new Date().toLocaleTimeString());
    setTimeout(() => {
      cooldownRef.current = false;
      if (videoRef.current) {
        videoRef.current.playbackRate = 1.0;
        setPlaybackRate(1.0);
      }
    }, ms);
  }, []);

  // ── Sync with authoritative session state ──────────────────────────
  useEffect(() => {
    if (!session || !videoRef.current) return;
    const video = videoRef.current;

    // Estimate network latency from server timestamp
    if (session.serverTimestamp) {
      setLatency(Math.max(0, Date.now() - session.serverTimestamp));
    }

    // 1. Video source change detection
    const currentSrc = video.src;
    if (session.selectedVideo && !currentSrc.includes(session.selectedVideo.url)) {
      addLog('info', `Loading video: ${session.selectedVideo.title}`);
      video.src = session.selectedVideo.url;
      video.load();
      setVideoError(null); // Reset error state on source change
      lastSequenceRef.current = -1;
    }

    // 2. Play/Pause sync
    if (session.isPlaying && video.paused) {
      video.play().catch(() => {});
      addLog('sync', 'Auth → PLAY');
    } else if (!session.isPlaying && !video.paused) {
      video.pause();
      addLog('sync', 'Auth → PAUSE');
    }

    // 3. Sequence-based command sync (seek/restart)
    if (session.sequenceNumber > lastSequenceRef.current) {
      const expected = calculateExpectedPosition();
      const currentDrift = Math.round((video.currentTime - expected) * 1000);

      if (Math.abs(currentDrift) > 300) {
        addLog('sync', `Seq ${session.sequenceNumber}: Hard seek → ${expected.toFixed(2)}s`);
        video.currentTime = expected;
        triggerCooldown(3000);
      }
      lastSequenceRef.current = session.sequenceNumber;
    }
  }, [session, isMounted, calculateExpectedPosition, triggerCooldown]);

  // ── Heartbeat & Drift Correction Loop (250ms) ─────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      if (!videoRef.current || !session) return;
      const video = videoRef.current;

      // 1. Calculate expected position
      const expected = calculateExpectedPosition();
      setExpectedPos(expected);

      // 2. Compute drift
      const currentDrift = Math.round((video.currentTime - expected) * 1000);
      setDrift(currentDrift);

      // 3. Send heartbeat to server
      let bufferedEnd = 0;
      if (video.buffered.length > 0) {
        bufferedEnd = video.buffered.end(video.buffered.length - 1);
      }

      let state: 'playing' | 'paused' | 'buffering' = 'paused';
      if (video.seeking || video.readyState < 3) {
        state = 'buffering';
      } else if (!video.paused) {
        state = 'playing';
      }

      sendHeartbeat({
        clientId,
        currentPosition: video.currentTime,
        buffered: bufferedEnd,
        playbackState: state,
        latency,
        timestamp: Date.now(),
      });
      setHeartbeatCount(prev => prev + 1);

      // 4. Drift Correction Algorithm (skip if in cooldown, seeking, or buffering)
      if (cooldownRef.current) {
        setSyncStatus('cooldown');
        return;
      }

      if (video.seeking) {
        setSyncStatus('seeking');
        return;
      }

      if (video.readyState < 3) {
        setSyncStatus('buffering');
        return;
      }

      const absDrift = Math.abs(currentDrift);

      if (absDrift < 150) {
        // Level 0: In Sync — no correction needed
        if (video.playbackRate !== 1.0) {
          video.playbackRate = 1.0;
          setPlaybackRate(1.0);
        }
        setSyncStatus('in-sync');
      } else if (absDrift <= 500) {
        // Level 1: Soft Sync — adjust playback rate
        setSyncStatus('soft');
        const newRate = currentDrift > 0 ? 0.95 : 1.05;
        video.playbackRate = newRate;
        setPlaybackRate(newRate);
      } else {
        // Level 2: Hard Sync — seek directly
        setSyncStatus('hard');
        addLog('warning', `Drift ${currentDrift}ms → Hard seek to ${expected.toFixed(2)}s`);
        video.currentTime = expected;
        triggerCooldown(4000);
      }
    }, 250);

    return () => clearInterval(interval);
  }, [session, latency, calculateExpectedPosition]);

  if (!isMounted) {
    return (
      <div className="relative w-full h-screen bg-black overflow-hidden flex flex-col justify-center items-center">
        <div className="bg-black text-slate-500 font-mono text-xs animate-pulse">
          Connecting to display sync session...
        </div>
      </div>
    );
  }

  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getSyncStatusIcon = () => {
    switch (syncStatus) {
      case 'in-sync':
        return <CheckCircle className="text-emerald-400" size={16} />;
      case 'soft':
        return <Activity className="text-amber-400 animate-pulse" size={16} />;
      case 'hard':
        return <ShieldAlert className="text-rose-500 animate-bounce" size={16} />;
      case 'cooldown':
        return <RefreshCw className="text-cyan-400 animate-spin" size={16} />;
      case 'seeking':
        return <RefreshCw className="text-blue-400 animate-spin" size={16} />;
      case 'buffering':
        return <Activity className="text-amber-500 animate-pulse" size={16} />;
    }
  };

  const getSyncStatusColor = () => {
    switch (syncStatus) {
      case 'in-sync': return 'text-emerald-400';
      case 'soft': return 'text-amber-400';
      case 'hard': return 'text-rose-500';
      case 'cooldown': return 'text-cyan-400';
      case 'seeking': return 'text-blue-400';
      case 'buffering': return 'text-amber-500';
    }
  };

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden flex flex-col justify-center items-center">
      {/* HTML5 Video Element */}
      <video
        ref={videoRef}
        className="w-full h-full object-contain pointer-events-none"
        playsInline
        muted={isMuted}
        loop={false}
        onError={(e) => {
          const err = videoRef.current?.error;
          let errMsg = 'Unknown error';
          if (err) {
            switch (err.code) {
              case 1: errMsg = 'Media playback aborted by user'; break;
              case 2: errMsg = 'Network error while loading video'; break;
              case 3: errMsg = 'Video decoding failed'; break;
              case 4: errMsg = 'Video format/source not supported or blocked'; break;
            }
          }
          setVideoError(errMsg);
          addLog('error', `Video Load Error: ${errMsg}`);
        }}
      />

      {/* Unmute Button (browser autoplay policy) */}
      {isMuted && (
        <button
          onClick={() => {
            setIsMuted(false);
            if (videoRef.current) videoRef.current.muted = false;
          }}
          className="absolute top-4 left-4 z-50 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold px-4 py-2 rounded-xl text-xs shadow-lg flex items-center gap-2 transition-all"
        >
          <Wifi size={14} /> CLICK TO UNMUTE
        </button>
      )}

      {/* ── Glassmorphism Diagnostic HUD Overlay ──────────────────────── */}
      <div className="absolute bottom-6 left-6 right-6 md:right-auto md:w-[420px] z-40 bg-slate-950/85 backdrop-blur-md border border-slate-800 rounded-2xl p-5 shadow-2xl font-mono text-white select-none">

        {/* HUD Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
            <span className="text-xs font-bold text-slate-300">DISPLAY TELEMETRY</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-500 bg-slate-900 px-2 py-0.5 rounded">{clientId}</span>
          </div>
        </div>

        {/* HUD Data Grid */}
        <div className="flex flex-col gap-2 text-[11px] leading-relaxed">
          <div className="flex justify-between border-b border-slate-900 pb-1.5">
            <span className="text-slate-500 uppercase">Connection</span>
            <span className={`font-bold flex items-center gap-1 ${isConnected ? 'text-emerald-400' : 'text-red-400'}`}>
              <Wifi size={12} /> {isConnected ? 'ONLINE' : 'OFFLINE'}
            </span>
          </div>

          <div className="flex justify-between border-b border-slate-900 pb-1.5">
            <span className="text-slate-500 uppercase">Local Position</span>
            <span className="text-slate-200 font-bold">
              {formatTime(videoRef.current?.currentTime || 0)}{' '}
              <span className="text-[10px] text-slate-500">({(videoRef.current?.currentTime || 0).toFixed(2)}s)</span>
            </span>
          </div>

          <div className="flex justify-between border-b border-slate-900 pb-1.5">
            <span className="text-slate-500 uppercase">Expected Position</span>
            <span className="text-slate-200 font-bold">
              {formatTime(expectedPos)}{' '}
              <span className="text-[10px] text-slate-500">({expectedPos.toFixed(2)}s)</span>
            </span>
          </div>

          <div className="flex justify-between border-b border-slate-900 pb-1.5">
            <span className="text-slate-500 uppercase">Drift</span>
            <span className={`font-bold ${Math.abs(drift) > 150 ? 'text-amber-400 font-black' : 'text-slate-200'}`}>
              {drift > 0 ? `+${drift}` : drift} ms
            </span>
          </div>

          <div className="flex justify-between border-b border-slate-900 pb-1.5">
            <span className="text-slate-500 uppercase">RTT Latency</span>
            <span className="text-slate-200 font-bold">{latency} ms</span>
          </div>

          <div className="flex justify-between border-b border-slate-900 pb-1.5">
            <span className="text-slate-500 uppercase">Playback Rate</span>
            <span className="text-slate-200 font-bold">{playbackRate.toFixed(2)}x</span>
          </div>

          <div className="flex justify-between border-b border-slate-900 pb-1.5">
            <span className="text-slate-500 uppercase">Sequence №</span>
            <span className="text-indigo-400 font-bold">{session?.sequenceNumber ?? 0}</span>
          </div>

          <div className="flex justify-between border-b border-slate-900 pb-1.5">
            <span className="text-slate-500 uppercase">Heartbeats Sent</span>
            <span className="text-slate-200 font-bold flex items-center gap-1">
              <Heart size={10} className="text-rose-400" /> {heartbeatCount}
            </span>
          </div>

          <div className="flex justify-between border-b border-slate-900 pb-1.5">
            <span className="text-slate-500 uppercase">Last Correction</span>
            <span className="text-slate-200 font-bold">{lastCorrection}</span>
          </div>

          <div className="flex justify-between items-center pt-1">
            <span className="text-slate-500 uppercase">Sync Status</span>
            <span className={`font-bold flex items-center gap-1.5 uppercase text-xs ${getSyncStatusColor()}`}>
              {getSyncStatusIcon()}
              {syncStatus}
            </span>
          </div>
        </div>

        {videoError && (
          <div className="mt-2 p-2 bg-rose-500/20 border border-rose-500/30 rounded-xl text-[10px] text-rose-400 font-bold uppercase tracking-wider text-center">
            ⚠️ {videoError}
          </div>
        )}

        {/* Buffer Health Bar */}
        <div className="mt-4 pt-3 border-t border-slate-800 flex flex-col gap-2">
          <div className="flex justify-between text-[9px] text-slate-500 uppercase">
            <span>Buffer Health</span>
            <span>
              {videoRef.current && videoRef.current.buffered.length > 0
                ? `${(videoRef.current.buffered.end(videoRef.current.buffered.length - 1) - videoRef.current.currentTime).toFixed(1)}s`
                : '0.0s'}
            </span>
          </div>
          <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 transition-all duration-300 rounded-full"
              style={{
                width: `${Math.min(
                  100,
                  videoRef.current && videoRef.current.buffered.length > 0
                    ? ((videoRef.current.buffered.end(videoRef.current.buffered.length - 1) - videoRef.current.currentTime) / 20) * 100
                    : 0
                )}%`,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
