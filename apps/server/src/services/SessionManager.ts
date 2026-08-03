import { PlaybackSession, DisplayClient, VideoInfo, HeartbeatPayload, ConnectionQuality } from '../types';
import logger from '../logger';

// ─── Predefined Videos ───────────────────────────────────────────────
export const PREDEFINED_VIDEOS: VideoInfo[] = [
  {
    id: 'big-buck-bunny',
    title: 'Big Buck Bunny',
    url: 'https://cdn.jsdelivr.net/npm/big-buck-bunny-1080p@0.0.6/video.mp4',
    duration: 596
  },
  {
    id: 'sintel',
    title: 'Sintel Trailer',
    url: 'https://media.w3.org/2010/05/sintel/trailer_hd.mp4',
    duration: 52
  },
  {
    id: 'oceans',
    title: 'Oceans (VideoJS)',
    url: 'https://vjs.zencdn.net/v/oceans.mp4',
    duration: 46
  }
];

// ─── Stale Heartbeat Threshold ───────────────────────────────────────
const STALE_HEARTBEAT_MS = 5000; // 5 seconds without heartbeat → disconnected

// ─── Session Manager (Singleton) ─────────────────────────────────────
export class SessionManager {
  private static instance: SessionManager;
  private session: PlaybackSession;
  private displays: Map<string, DisplayClient> = new Map();

  private constructor() {
    this.session = {
      sessionId: 'default-session',
      selectedVideo: PREDEFINED_VIDEOS[0],
      isPlaying: false,
      authoritativePosition: 0,
      playbackStartedAt: Date.now(),
      sequenceNumber: 0,
      playbackRate: 1.0,
      controllerId: null,
      lastModified: Date.now(),
    };
  }

  public static getInstance(): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager();
    }
    return SessionManager.instance;
  }

  // ─── Session Accessors ─────────────────────────────────────────────

  public getSession(): PlaybackSession {
    return { ...this.session };
  }

  public getPredefinedVideos(): VideoInfo[] {
    return PREDEFINED_VIDEOS;
  }

  /**
   * Returns a complete session summary suitable for broadcasting to clients.
   * Includes the computed expected position and current server timestamp.
   */
  public getSessionSummary() {
    return {
      ...this.session,
      expectedPosition: this.getExpectedPosition(),
      serverTimestamp: Date.now(),
    };
  }

  /**
   * Calculates the authoritative expected timeline position (seconds).
   *
   * Formula:
   *   If paused:  expectedPosition = authoritativePosition
   *   If playing: expectedPosition = authoritativePosition + elapsed × playbackRate
   *
   * Clamped to [0, video duration].
   */
  public getExpectedPosition(): number {
    if (!this.session.isPlaying) {
      return this.session.authoritativePosition;
    }
    const elapsedSeconds = (Date.now() - this.session.playbackStartedAt) / 1000;
    const computedPosition = this.session.authoritativePosition + elapsedSeconds * this.session.playbackRate;
    return Math.min(Math.max(0, computedPosition), this.session.selectedVideo.duration);
  }

  // ─── State Mutations ───────────────────────────────────────────────

  private touch(): void {
    this.session.lastModified = Date.now();
    this.session.sequenceNumber++;
  }

  public play(): void {
    if (!this.session.isPlaying) {
      this.session.playbackStartedAt = Date.now();
      this.session.isPlaying = true;
      this.touch();
      logger.info(`▶ PLAY at position ${this.session.authoritativePosition.toFixed(2)}s [seq=${this.session.sequenceNumber}]`);
    }
  }

  public pause(): void {
    if (this.session.isPlaying) {
      // Freeze position at the calculated expected position
      this.session.authoritativePosition = this.getExpectedPosition();
      this.session.isPlaying = false;
      this.touch();
      logger.info(`⏸ PAUSE frozen at ${this.session.authoritativePosition.toFixed(2)}s [seq=${this.session.sequenceNumber}]`);
    }
  }

  public seek(position: number): void {
    const clampedPosition = Math.max(0, Math.min(position, this.session.selectedVideo.duration));
    this.session.authoritativePosition = clampedPosition;
    this.session.playbackStartedAt = Date.now(); // reset timer anchor
    this.touch();
    logger.info(`⏩ SEEK to ${clampedPosition.toFixed(2)}s [seq=${this.session.sequenceNumber}]`);
  }

  public changeVideo(videoId: string): void {
    let video = PREDEFINED_VIDEOS.find(v => v.id === videoId);

    // If not in predefined list, check if it's a URL
    if (!video && (videoId.startsWith('http://') || videoId.startsWith('https://'))) {
      const urlParts = videoId.split('/');
      const fileName = urlParts[urlParts.length - 1] || 'custom-video.mp4';
      // Clean up file extension for the title
      const title = fileName.split('?')[0].replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
      video = {
        id: videoId,
        title: (title.charAt(0).toUpperCase() + title.slice(1)) || 'Custom Video Link',
        url: videoId,
        duration: 1800 // Default placeholder, will auto-correct on client load
      };
    }

    if (video) {
      this.session.selectedVideo = video;
      this.session.authoritativePosition = 0;
      this.session.isPlaying = false;
      this.session.playbackStartedAt = Date.now();
      this.touch();
      logger.info(`🎬 VIDEO CHANGE → "${video.title}" [seq=${this.session.sequenceNumber}]`);
    }
  }

  // ─── Controller Registration ───────────────────────────────────────

  public setControllerId(socketId: string): void {
    this.session.controllerId = socketId;
    logger.info(`🎮 Controller registered: ${socketId}`);
  }

  public clearControllerId(socketId: string): void {
    if (this.session.controllerId === socketId) {
      this.session.controllerId = null;
      logger.info(`🎮 Controller disconnected: ${socketId}`);
    }
  }

  // ─── Display Management ────────────────────────────────────────────

  public registerDisplay(clientId: string, socketId: string): void {
    this.displays.set(clientId, {
      clientId,
      socketId,
      connectionStatus: 'connected',
      connectionQuality: 'good',
      lastHeartbeat: Date.now(),
      latency: 0,
      currentPosition: 0,
      drift: 0,
      playbackState: 'paused',
      bufferHealth: 0,
    });
    logger.info(`📺 Display registered: ${clientId} (socket=${socketId})`);
  }

  public removeDisplayBySocketId(socketId: string): string | null {
    for (const [clientId, display] of this.displays.entries()) {
      if (display.socketId === socketId) {
        display.connectionStatus = 'disconnected';
        display.connectionQuality = 'poor';
        logger.info(`📺 Display disconnected: ${clientId}`);
        return clientId;
      }
    }
    return null;
  }

  public handleHeartbeat(payload: HeartbeatPayload, socketId: string): void {
    const { clientId, currentPosition, buffered, playbackState, latency, fps, duration } = payload;
    let display = this.displays.get(clientId);

    if (!display) {
      // Auto-register if not found (reconnection case)
      this.registerDisplay(clientId, socketId);
      display = this.displays.get(clientId)!;
    }

    // Refresh telemetry
    display.socketId = socketId;
    display.connectionStatus = 'connected';
    display.lastHeartbeat = Date.now();
    display.currentPosition = currentPosition;
    display.playbackState = playbackState;
    display.bufferHealth = Math.max(0, buffered - currentPosition);
    display.latency = latency;
    display.connectionQuality = this.computeConnectionQuality(latency);
    if (fps !== undefined) display.fps = fps;

    // Update session duration if client reports a valid duration for a custom video link
    if (duration && this.session.selectedVideo.id === this.session.selectedVideo.url && duration !== this.session.selectedVideo.duration) {
      this.session.selectedVideo.duration = Math.ceil(duration);
      this.touch();
    }

    // Calculate drift: client currentPosition − expected authoritativePosition
    const expected = this.getExpectedPosition();
    display.drift = Math.round((currentPosition - expected) * 1000); // drift in ms
  }

  /**
   * Computes connection quality based on latency thresholds.
   *
   *   < 50ms   → excellent
   *   < 100ms  → good
   *   < 200ms  → fair
   *   ≥ 200ms  → poor
   */
  private computeConnectionQuality(latency: number): ConnectionQuality {
    if (latency < 50) return 'excellent';
    if (latency < 100) return 'good';
    if (latency < 200) return 'fair';
    return 'poor';
  }

  /**
   * Marks displays as disconnected if no heartbeat received within STALE_HEARTBEAT_MS.
   * Should be called periodically (e.g. every sync interval).
   */
  public detectStaleDisplays(): void {
    const now = Date.now();
    for (const display of this.displays.values()) {
      if (display.connectionStatus === 'connected' && (now - display.lastHeartbeat) > STALE_HEARTBEAT_MS) {
        display.connectionStatus = 'disconnected';
        display.connectionQuality = 'poor';
        logger.warn(`⚠ Display "${display.clientId}" marked stale (no heartbeat for ${STALE_HEARTBEAT_MS}ms)`);
      }
    }
  }

  public getConnectedDisplays(): DisplayClient[] {
    return Array.from(this.displays.values());
  }
}
