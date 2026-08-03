'use client';

import React, { useEffect, useRef, useState } from 'react';
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
    addLog
  } = useStore();

  const videoRef = useRef<HTMLVideoElement>(null);
  
  // Local Telemetry State
  const [drift, setDrift] = useState<number>(0);
  const [latency, setLatency] = useState<number>(0);
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);
  const [syncStatus, setSyncStatus] = useState<'in-sync' | 'soft' | 'hard' | 'cooldown'>('in-sync');
  const [expectedPos, setExpectedPos] = useState<number>(0);
  const [isMuted, setIsMuted] = useState<boolean>(true); // Browser policy requires user action for audio, so we default to muted.

  // Lock corrections after a hard seek to let player buffer
  const cooldownRef = useRef<boolean>(false);
  const lastSequenceRef = useRef<number>(-1);

  useEffect(() => {
    initializeSocket();
    registerDisplay(clientId);
  }, []);

  // Listen to authoritative session sync state broadcasts
  useEffect(() => {
    if (!session || !videoRef.current) return;
    const video = videoRef.current;

    // Estimate network latency based on server time offsets
    if (session.serverTimestamp) {
      setLatency(Math.max(0, Date.now() - session.serverTimestamp));
    }

    // 1. Check if the video selected has changed
    const currentSrc = video.src;
    if (session.selectedVideo && !currentSrc.includes(session.selectedVideo.url)) {
      addLog('info', `Loading new video: ${session.selectedVideo.title}`);
      video.src = session.selectedVideo.url;
      video.load();
      lastSequenceRef.current = -1; // Reset sequence check
    }

    // 2. Play/Pause command sync
    if (session.isPlaying && video.paused) {
      video.play().catch(err => console.log('Autoplay blocked: user interaction needed.', err));
      addLog('sync', 'Auth state: PLAY');
    } else if (!session.isPlaying && !video.paused) {
      video.pause();
      addLog('sync', 'Auth state: PAUSE');
    }

    // 3. Absolute commands sequence matching (Seek / Restart)
    if (session.sequenceNumber > lastSequenceRef.current) {
      // Calculate server's expected timeline position
      const expected = calculateExpectedPosition();
      const currentDrift = Math.round((video.currentTime - expected) * 1000);

      // Force hard seek if out of sync on new commands
      if (Math.abs(currentDrift) > 300) {
        addLog('sync', `Command Seq ${session.sequenceNumber}: Forcing Hard Seek to ${expected.toFixed(2)}s`);
        video.currentTime = expected;
        triggerCooldown(3000);
      }
      lastSequenceRef.current = session.sequenceNumber;
    }
  }, [session]);

  // Telemetry Heartbeat and Drift Check Loop (every 250ms)
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

      // 3. Send Heartbeat to Server
      let bufferedEnd = 0;
      if (video.buffered.length > 0) {
        bufferedEnd = video.buffered.end(video.buffered.length - 1);
      }

      sendHeartbeat({
        clientId,
        currentPosition: video.currentTime,
        buffered: bufferedEnd,
        playbackState: video.paused ? 'paused' : 'playing',
        latency,
        timestamp: Date.now()
      });

      // 4. Run Drift Correction Algorithm (only if not in cooldown)
      if (cooldownRef.current) {
        setSyncStatus('cooldown');
        return;
      }

      const absDrift = Math.abs(currentDrift);

      if (absDrift < 150) {
        // Level 0: In Sync
        if (video.playbackRate !== 1.0) {
          video.playbackRate = 1.0;
          setPlaybackRate(1.0);
        }
        setSyncStatus('in-sync');
      } else if (absDrift >= 150 && absDrift <= 500) {
        // Level 1: Soft Sync (dynamic playback rate shift)
        setSyncStatus('soft');
        if (currentDrift > 0) {
          // Client is ahead, slow down
          video.playbackRate = 0.95;
          setPlaybackRate(0.95);
        } else {
          // Client is behind, speed up
          video.playbackRate = 1.05;
          setPlaybackRate(1.05);
        }
      } else {
        // Level 2: Hard Sync (seek directly)
        setSyncStatus('hard');
        addLog('warning', `Drift limit exceeded (${currentDrift}ms). Hard seeking to ${expected.toFixed(2)}s`);
        video.currentTime = expected;
        // Pause sync adjustments to allow loading/buffering
        triggerCooldown(4000);
      }
    }, 250);

    return () => clearInterval(interval);
  }, [session, latency]);

  const calculateExpectedPosition = (): number => {
    if (!session) return 0;
    if (!session.isPlaying) {
      return session.authoritativePosition;
    }
    const elapsed = (Date.now() - session.playbackStartedAt) / 1000;
    const expected = session.authoritativePosition + elapsed * session.playbackRate;
    return Math.min(expected, session.selectedVideo?.duration || 0);
  };

  const triggerCooldown = (ms: number) => {
    cooldownRef.current = true;
    setTimeout(() => {
      cooldownRef.current = false;
      if (videoRef.current) {
        videoRef.current.playbackRate = 1.0;
        setPlaybackRate(1.0);
      }
    }, ms);
  };

  const formatTime = (seconds: number) => {
    if (!seconds) return '00:00';
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
      />

      {/* Floating Audio Notice if Muted */}
      {isMuted && (
        <button
          onClick={() => {
            setIsMuted(false);
            if (videoRef.current) videoRef.current.muted = false;
          }}
          className="absolute top-4 left-4 z-50 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold px-4 py-2 rounded-xl text-xs shadow-lg flex items-center gap-2 transition-all"
        >
          <Wifi size={14} /> CLICK TO UNMUTE AUDIO
        </button>
      )}

      {/* Glassmorphism Diagnostic HUD Overlay */}
      <div className="absolute bottom-6 left-6 right-6 md:right-auto md:w-96 z-40 bg-slate-950/85 backdrop-blur-md border border-slate-800 rounded-2xl p-5 shadow-2xl font-mono text-white select-none">
        
        {/* HUD Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-bold text-slate-300">DISPLAY METRICS</span>
          </div>
          <span className="text-[10px] text-slate-500">{clientId}</span>
        </div>

        {/* HUD Data Grid */}
        <div className="flex flex-col gap-2.5 text-[11px] leading-relaxed">
          <div className="flex justify-between border-b border-slate-900 pb-1.5">
            <span className="text-slate-500 uppercase">Connection Quality</span>
            <span className="text-emerald-400 font-bold flex items-center gap-1">
              <Wifi size={12} /> {isConnected ? 'ONLINE' : 'OFFLINE'}
            </span>
          </div>

          <div className="flex justify-between border-b border-slate-900 pb-1.5">
            <span className="text-slate-500 uppercase">Local Position</span>
            <span className="text-slate-200 font-bold">{formatTime(videoRef.current?.currentTime || 0)} <span className="text-[10px] text-slate-500">({(videoRef.current?.currentTime || 0).toFixed(2)}s)</span></span>
          </div>

          <div className="flex justify-between border-b border-slate-900 pb-1.5">
            <span className="text-slate-500 uppercase">Master Position</span>
            <span className="text-slate-200 font-bold">{formatTime(expectedPos)} <span className="text-[10px] text-slate-500">({expectedPos.toFixed(2)}s)</span></span>
          </div>

          <div className="flex justify-between border-b border-slate-900 pb-1.5">
            <span className="text-slate-500 uppercase">Estimated Drift</span>
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

          <div className="flex justify-between items-center pt-1.5">
            <span className="text-slate-500 uppercase">Sync Status</span>
            <span className="font-bold flex items-center gap-1.5 uppercase text-xs">
              {getSyncStatusIcon()}
              {syncStatus}
            </span>
          </div>
        </div>

        {/* Dynamic Telemetry Graph Bars */}
        <div className="mt-4 pt-3 border-t border-slate-800 flex flex-col gap-2">
          <div className="flex justify-between text-[9px] text-slate-500 uppercase">
            <span>Buffer Health</span>
            <span>
              {videoRef.current && videoRef.current.buffered.length > 0
                ? `${(videoRef.current.buffered.end(videoRef.current.buffered.length - 1) - videoRef.current.currentTime).toFixed(1)}s`
                : '0.0s'}
            </span>
          </div>
          <div className="w-full h-1 bg-slate-900 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 transition-all duration-300"
              style={{
                width: `${Math.min(
                  100,
                  videoRef.current && videoRef.current.buffered.length > 0
                    ? ((videoRef.current.buffered.end(videoRef.current.buffered.length - 1) - videoRef.current.currentTime) / 20) * 100
                    : 0
                )}%`
              }}
            />
          </div>
        </div>

      </div>
    </div>
  );
}
