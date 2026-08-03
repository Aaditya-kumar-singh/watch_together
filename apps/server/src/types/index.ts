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
  fps?: number;                  // frame rate if available
  lastCorrectionTime?: number;   // local server timestamp (ms)
}

export interface HeartbeatPayload {
  clientId: string;
  currentPosition: number;
  buffered: number;              // end of first buffered time range in seconds
  playbackState: 'playing' | 'paused' | 'buffering';
  latency: number;               // measured RTT by client or ping
  timestamp: number;             // client-side timestamp when sent
  fps?: number;
}
