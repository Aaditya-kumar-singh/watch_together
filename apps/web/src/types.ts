// ─── Video ───────────────────────────────────────────────────────────
export interface VideoInfo {
  id: string;
  title: string;
  url: string;
  duration: number; // seconds
}

// ─── Playback Session (Authoritative State) ──────────────────────────
export interface PlaybackSession {
  sessionId: string;
  selectedVideo: VideoInfo;
  isPlaying: boolean;
  authoritativePosition: number;   // seconds
  playbackStartedAt: number;       // server timestamp (ms)
  sequenceNumber: number;
  playbackRate: number;
  controllerId: string | null;
  lastModified: number;            // server timestamp (ms)
  expectedPosition?: number;       // server-calculated expected position
  serverTimestamp?: number;        // server timestamp when sync was emitted
}

// ─── Display Client (Telemetry Record) ───────────────────────────────
export type ConnectionQuality = 'excellent' | 'good' | 'fair' | 'poor';

export interface DisplayClient {
  clientId: string;
  socketId: string;
  connectionStatus: 'connected' | 'disconnected';
  connectionQuality: ConnectionQuality;
  lastHeartbeat: number;
  latency: number;
  currentPosition: number;
  drift: number;
  playbackState: 'playing' | 'paused' | 'buffering';
  bufferHealth: number;
  fps?: number;
  lastCorrectionTime?: number;
}
