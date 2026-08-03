import { z } from 'zod';

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
  playbackStartedAt: number;       // server timestamp (ms) when playback started/resumed
  sequenceNumber: number;          // increments on each play/pause/seek command
  playbackRate: number;
  controllerId: string | null;     // socket ID of the connected controller
  lastModified: number;            // server timestamp (ms) of last state mutation
}

// ─── Display Client (Telemetry Record) ───────────────────────────────
export type ConnectionQuality = 'excellent' | 'good' | 'fair' | 'poor';

export interface DisplayClient {
  clientId: string;
  socketId: string;
  connectionStatus: 'connected' | 'disconnected';
  connectionQuality: ConnectionQuality;
  lastHeartbeat: number;           // server timestamp (ms)
  latency: number;                 // round-trip latency (ms)
  currentPosition: number;         // latest position reported by client (seconds)
  drift: number;                   // calculated drift from authoritative position (ms)
  playbackState: 'playing' | 'paused' | 'buffering';
  bufferHealth: number;            // amount of buffered video ahead in seconds
  fps?: number;                    // frame rate if available
  lastCorrectionTime?: number;     // server timestamp (ms) of last drift correction
}

// ─── Heartbeat Payload (from Display → Server) ──────────────────────
export interface HeartbeatPayload {
  clientId: string;
  currentPosition: number;
  buffered: number;                // end of first buffered time range in seconds
  playbackState: 'playing' | 'paused' | 'buffering';
  latency: number;                 // measured RTT by client or ping
  timestamp: number;               // client-side timestamp when sent
  fps?: number;
  duration?: number;
}

// ─── Zod Validation Schemas ──────────────────────────────────────────

export const HeartbeatPayloadSchema = z.object({
  clientId: z.string().min(1, 'clientId is required'),
  currentPosition: z.number().min(0),
  buffered: z.number().min(0),
  playbackState: z.enum(['playing', 'paused', 'buffering']),
  latency: z.number().min(0),
  timestamp: z.number().positive(),
  fps: z.number().min(0).optional(),
  duration: z.number().min(0).optional(),
});

export const SeekPayloadSchema = z.number().min(0);

export const VideoChangePayloadSchema = z.string().min(1, 'videoId is required');

export const ClientIdSchema = z.string().min(1, 'clientId is required');
