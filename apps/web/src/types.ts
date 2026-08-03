export interface VideoInfo {
  id: string;
  title: string;
  url: string;
  duration: number; // in seconds
}

export interface PlaybackSession {
  sessionId: string;
  selectedVideo: VideoInfo;
  isPlaying: boolean;
  authoritativePosition: number; // in seconds
  playbackStartedAt: number;     // server timestamp (ms) when playback started/resumed
  sequenceNumber: number;        // increments on each play/pause/seek command
  playbackRate: number;
  expectedPosition?: number;     // server-calculated expected position
  serverTimestamp?: number;
}

export interface DisplayClient {
  clientId: string;
  socketId: string;
  connectionStatus: 'connected' | 'disconnected';
  lastHeartbeat: number;         // server timestamp (ms)
  latency: number;               // round-trip latency (ms)
  currentPosition: number;       // latest position reported by client (seconds)
  drift: number;                 // calculated drift from authoritative position (ms)
  playbackState: 'playing' | 'paused' | 'buffering';
  bufferHealth: number;          // amount of buffered video in seconds
  fps?: number;
  lastCorrectionTime?: number;
}
