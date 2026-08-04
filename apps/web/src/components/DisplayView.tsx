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
  const playerRef = useRef<any>(null);

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
  const [isHudMinimized, setIsHudMinimized] = useState<boolean>(false);

  // YouTube States
  const [videoType, setVideoType] = useState<'html5' | 'youtube'>('html5');
  const [ytPlayer, setYtPlayer] = useState<any>(null);
  const [ytReady, setYtReady] = useState<boolean>(false);

  // Lock corrections after a hard seek to let player buffer
  const cooldownRef = useRef<boolean>(false);
  const lastSequenceRef = useRef<number>(-1);

  const [isMounted, setIsMounted] = useState<boolean>(false);

  // Extract YouTube Video ID from any watch link
  const getYoutubeVideoId = (url: string): string | null => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  // Determine video type based on url
  useEffect(() => {
    if (!session?.selectedVideo?.url) return;
    const isYt = !!getYoutubeVideoId(session.selectedVideo.url);
    setVideoType(isYt ? 'youtube' : 'html5');
  }, [session?.selectedVideo?.url]);

  // Load YouTube IFrame API script dynamically
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!(window as any).YT) {
      (window as any).onYouTubeIframeAPIReady = () => {
        setYtReady(true);
      };
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag);
    } else {
      setYtReady(true);
    }
  }, []);

  // Initialize or update YouTube Player instance
  useEffect(() => {
    if (!ytReady || videoType !== 'youtube' || !session?.selectedVideo?.url) return;
    const videoId = getYoutubeVideoId(session.selectedVideo.url);
    if (!videoId) return;

    if (playerRef.current) {
      try {
        if (playerRef.current.getVideoData && playerRef.current.getVideoData().video_id !== videoId) {
          playerRef.current.cueVideoById({ videoId });
        }
      } catch (err) {
        console.error("Error cueing YouTube video:", err);
      }
    } else {
      try {
        playerRef.current = new (window as any).YT.Player('yt-player-placeholder', {
          videoId: videoId,
          playerVars: {
            autoplay: 0,
            controls: 0,
            disablekb: 1,
            fs: 0,
            rel: 0,
            showinfo: 0,
            modestbranding: 1,
            iv_load_policy: 3,
            enablejsapi: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: (event: any) => {
              setYtPlayer(event.target);
              if (isMuted) {
                event.target.mute();
              } else {
                event.target.unMute();
              }
            },
            onError: (event: any) => {
              const errCode = event.data;
              let errMsg = 'YouTube load error';
              switch (errCode) {
                case 2: errMsg = 'Invalid YouTube video ID'; break;
                case 5: errMsg = 'YouTube HTML5 player error'; break;
                case 100: errMsg = 'YouTube video not found / removed'; break;
                case 101:
                case 150: errMsg = 'YouTube video embedding blocked by creator'; break;
              }
              setVideoError(errMsg);
              addLog('error', `YT Player Error: ${errMsg}`);
            }
          }
        });
      } catch (e) {
        console.error("Failed to create YT Player:", e);
      }
    }
  }, [ytReady, videoType, session?.selectedVideo?.url]);

  // Handle switching players (pause the inactive player)
  useEffect(() => {
    if (videoType === 'html5') {
      if (ytPlayer && ytPlayer.pauseVideo) {
        try {
          ytPlayer.pauseVideo();
        } catch (e) {}
      }
    } else {
      if (videoRef.current) {
        videoRef.current.pause();
      }
    }
  }, [videoType, ytPlayer]);

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
      if (videoType === 'youtube') {
        if (playerRef.current && playerRef.current.setPlaybackRate) {
          try {
            playerRef.current.setPlaybackRate(1.0);
          } catch (e) {}
        }
      } else {
        if (videoRef.current) {
          videoRef.current.playbackRate = 1.0;
        }
      }
      setPlaybackRate(1.0);
    }, ms);
  }, [videoType]);

  // Unified Player Adapter
  const player = {
    isYt: videoType === 'youtube',
    
    isReady: (): boolean => {
      if (videoType === 'youtube') {
        return !!(ytPlayer && ytPlayer.getPlayerState);
      }
      return !!(videoRef.current && isMounted);
    },

    play: async () => {
      if (videoType === 'youtube') {
        if (ytPlayer && ytPlayer.playVideo) ytPlayer.playVideo();
      } else {
        if (videoRef.current) await videoRef.current.play().catch(() => {});
      }
    },

    pause: () => {
      if (videoType === 'youtube') {
        if (ytPlayer && ytPlayer.pauseVideo) ytPlayer.pauseVideo();
      } else {
        if (videoRef.current) videoRef.current.pause();
      }
    },

    seek: (seconds: number) => {
      if (videoType === 'youtube') {
        if (ytPlayer && ytPlayer.seekTo) ytPlayer.seekTo(seconds, true);
      } else {
        if (videoRef.current) videoRef.current.currentTime = seconds;
      }
    },

    getCurrentTime: (): number => {
      if (videoType === 'youtube') {
        return (ytPlayer && ytPlayer.getCurrentTime) ? ytPlayer.getCurrentTime() : 0;
      }
      return videoRef.current ? videoRef.current.currentTime : 0;
    },

    getDuration: (): number => {
      if (videoType === 'youtube') {
        return (ytPlayer && ytPlayer.getDuration) ? ytPlayer.getDuration() : 0;
      }
      return videoRef.current ? videoRef.current.duration : 0;
    },

    getBufferedEnd: (): number => {
      if (videoType === 'youtube') {
        if (ytPlayer && ytPlayer.getVideoLoadedFraction && ytPlayer.getDuration) {
          return ytPlayer.getVideoLoadedFraction() * ytPlayer.getDuration();
        }
        return 0;
      }
      if (videoRef.current && videoRef.current.buffered.length > 0) {
        return videoRef.current.buffered.end(videoRef.current.buffered.length - 1);
      }
      return 0;
    },

    setPlaybackRate: (rate: number) => {
      if (videoType === 'youtube') {
        if (ytPlayer && ytPlayer.setPlaybackRate) ytPlayer.setPlaybackRate(rate);
      } else {
        if (videoRef.current) videoRef.current.playbackRate = rate;
      }
    },

    getPlaybackRate: (): number => {
      if (videoType === 'youtube') {
        return (ytPlayer && ytPlayer.getPlaybackRate) ? ytPlayer.getPlaybackRate() : 1.0;
      }
      return videoRef.current ? videoRef.current.playbackRate : 1.0;
    },

    isPaused: (): boolean => {
      if (videoType === 'youtube') {
        if (ytPlayer && ytPlayer.getPlayerState) {
          const state = ytPlayer.getPlayerState();
          return state === 2 || state === 5 || state === -1 || state === 0;
        }
        return true;
      }
      return videoRef.current ? videoRef.current.paused : true;
    },

    isBufferingOrSeeking: (): boolean => {
      if (videoType === 'youtube') {
        if (ytPlayer && ytPlayer.getPlayerState) {
          const state = ytPlayer.getPlayerState();
          return state === 3; // 3 is buffering
        }
        return false;
      }
      return videoRef.current ? (videoRef.current.seeking || videoRef.current.readyState < 3) : false;
    },

    mute: (muted: boolean) => {
      if (videoType === 'youtube') {
        if (ytPlayer) {
          if (muted && ytPlayer.mute) ytPlayer.mute();
          if (!muted && ytPlayer.unMute) ytPlayer.unMute();
        }
      } else {
        if (videoRef.current) videoRef.current.muted = muted;
      }
    }
  };

  // ── Sync with authoritative session state ──────────────────────────
  useEffect(() => {
    if (!session || !player.isReady()) return;

    // Estimate network latency from server timestamp
    if (session.serverTimestamp) {
      setLatency(Math.max(0, Date.now() - session.serverTimestamp));
    }

    // 1. HTML5 Video source change detection
    if (videoType === 'html5' && videoRef.current) {
      const video = videoRef.current;
      const currentSrc = video.src;
      // Prevent assigning YouTube URLs to HTML5 video element due to state race conditions
      const isActuallyYoutube = session.selectedVideo?.url ? !!getYoutubeVideoId(session.selectedVideo.url) : false;
      
      if (!isActuallyYoutube && session.selectedVideo && !currentSrc.includes(session.selectedVideo.url)) {
        addLog('info', `Loading video: ${session.selectedVideo.title}`);
        video.src = session.selectedVideo.url;
        video.load();
        setVideoError(null);
        lastSequenceRef.current = -1;
      }
    }

    // 2. Play/Pause sync
    if (session.isPlaying && player.isPaused()) {
      player.play();
      addLog('sync', 'Auth → PLAY');
    } else if (!session.isPlaying && !player.isPaused()) {
      player.pause();
      addLog('sync', 'Auth → PAUSE');
    }

    // 3. Sequence-based command sync (seek/restart)
    if (session.sequenceNumber > lastSequenceRef.current) {
      const expected = calculateExpectedPosition();
      const currentDrift = Math.round((player.getCurrentTime() - expected) * 1000);

      if (Math.abs(currentDrift) > 300) {
        addLog('sync', `Seq ${session.sequenceNumber}: Hard seek → ${expected.toFixed(2)}s`);
        player.seek(expected);
        triggerCooldown(3000);
      }
      lastSequenceRef.current = session.sequenceNumber;
    }
  }, [session, isMounted, videoType, ytPlayer, calculateExpectedPosition, triggerCooldown]);

  // ── Heartbeat & Drift Correction Loop (250ms) ─────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      if (!session || !player.isReady()) return;

      // 1. Calculate expected position
      const expected = calculateExpectedPosition();
      setExpectedPos(expected);

      // 2. Compute drift
      const currentDrift = Math.round((player.getCurrentTime() - expected) * 1000);
      setDrift(currentDrift);

      // 3. Send heartbeat to server
      const bufferedEnd = player.getBufferedEnd();

      let state: 'playing' | 'paused' | 'buffering' = 'paused';
      if (player.isBufferingOrSeeking()) {
        state = 'buffering';
      } else if (!player.isPaused()) {
        state = 'playing';
      }

      sendHeartbeat({
        clientId,
        currentPosition: player.getCurrentTime(),
        buffered: bufferedEnd,
        playbackState: state,
        latency,
        timestamp: Date.now(),
        duration: player.getDuration() || undefined,
      });
      setHeartbeatCount(prev => prev + 1);

      // 4. Drift Correction Algorithm (skip if in cooldown, seeking, or buffering)
      if (cooldownRef.current) {
        setSyncStatus('cooldown');
        return;
      }

      if (player.isBufferingOrSeeking()) {
        setSyncStatus(state === 'buffering' ? 'buffering' : 'seeking');
        return;
      }

      const absDrift = Math.abs(currentDrift);

      if (absDrift < 150) {
        // Level 0: In Sync — no correction needed
        if (player.getPlaybackRate() !== 1.0) {
          player.setPlaybackRate(1.0);
          setPlaybackRate(1.0);
        }
        setSyncStatus('in-sync');
      } else if (absDrift <= 500) {
        // Level 1: Soft Sync — adjust playback rate
        setSyncStatus('soft');
        const newRate = currentDrift > 0 ? 0.95 : 1.05;
        player.setPlaybackRate(newRate);
        setPlaybackRate(newRate);
      } else {
        // Level 2: Hard Sync — seek directly
        setSyncStatus('hard');
        addLog('warning', `Drift ${currentDrift}ms → Hard seek to ${expected.toFixed(2)}s`);
        player.seek(expected);
        triggerCooldown(4000);
      }
    }, 250);

    return () => clearInterval(interval);
  }, [session, latency, videoType, ytPlayer, calculateExpectedPosition]);

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
      {/* YouTube Player Element */}
      <div className={`w-full h-full ${videoType === 'youtube' ? 'block' : 'hidden'}`}>
        <div id="yt-player-placeholder" className="w-full h-full pointer-events-none" />
      </div>

      {/* HTML5 Video Element */}
      <video
        ref={videoRef}
        className={`w-full h-full object-contain pointer-events-none ${videoType === 'html5' ? 'block' : 'hidden'}`}
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
            player.mute(false);
          }}
          className="absolute top-4 left-4 z-50 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold px-4 py-2 rounded-xl text-xs shadow-lg flex items-center gap-2 transition-all"
        >
          <Wifi size={14} /> CLICK TO UNMUTE
        </button>
      )}

      {/* ── Glassmorphism Diagnostic HUD Overlay ──────────────────────── */}
      <div className={`absolute bottom-6 left-6 right-6 md:right-auto z-40 bg-slate-950/85 backdrop-blur-md border border-slate-800 rounded-2xl p-4 shadow-2xl font-mono text-white select-none transition-all duration-300 ${isHudMinimized ? 'md:w-[260px] w-auto' : 'md:w-[420px] w-auto'}`}>
        
        {isHudMinimized ? (
          <div 
            className="flex items-center justify-between text-xs cursor-pointer hover:bg-slate-900/40 p-1 rounded-lg transition-all"
            onClick={() => setIsHudMinimized(false)}
          >
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
              <span className="font-bold text-slate-300 text-[10px]">{clientId}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-[9px] font-extrabold uppercase ${getSyncStatusColor()}`}>
                {syncStatus}
              </span>
              <span className="text-[8px] text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-1 py-0.5 rounded font-bold uppercase tracking-wider">
                EXPAND
              </span>
            </div>
          </div>
        ) : (
          <>
            {/* HUD Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                <span className="text-xs font-bold text-slate-300">DISPLAY TELEMETRY</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-500 bg-slate-900 px-2 py-0.5 rounded">{clientId}</span>
                <button 
                  onClick={() => setIsHudMinimized(true)}
                  className="text-[9px] text-slate-400 hover:text-slate-200 font-extrabold px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 cursor-pointer transition-all"
                >
                  MINIMIZE
                </button>
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
              {formatTime(player.getCurrentTime())}
              <span className="text-[10px] text-slate-500 hidden sm:inline"> ({player.getCurrentTime().toFixed(2)}s)</span>
            </span>
          </div>

          <div className="flex justify-between border-b border-slate-900 pb-1.5">
            <span className="text-slate-500 uppercase">Expected Position</span>
            <span className="text-slate-200 font-bold">
              {formatTime(expectedPos)}
              <span className="text-[10px] text-slate-500 hidden sm:inline"> ({expectedPos.toFixed(2)}s)</span>
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
              {player.isReady()
                ? `${Math.max(0, player.getBufferedEnd() - player.getCurrentTime()).toFixed(1)}s`
                : '0.0s'}
            </span>
          </div>
          <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 transition-all duration-300 rounded-full"
              style={{
                width: `${Math.min(
                  100,
                  player.isReady()
                    ? ((player.getBufferedEnd() - player.getCurrentTime()) / 20) * 100
                    : 0
                )}%`,
              }}
            />
          </div>
        </div>
          </>
        )}
      </div>
    </div>
  );
}
