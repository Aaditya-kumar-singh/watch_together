import { PlaybackSession, DisplayClient, VideoInfo, HeartbeatPayload } from '../types';
import logger from '../logger';

export const PREDEFINED_VIDEOS: VideoInfo[] = [
  {
    id: 'big-buck-bunny',
    title: 'Big Buck Bunny (Animation)',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    duration: 596
  },
  {
    id: 'sintel',
    title: 'Sintel (CGI Open Film)',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
    duration: 888
  },
  {
    id: 'tears-of-steel',
    title: 'Tears of Steel (VFX Sci-Fi)',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
    duration: 734
  }
];

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
      playbackRate: 1.0
    };
  }

  public static getInstance(): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager();
    }
    return SessionManager.instance;
  }

  public getSession(): PlaybackSession {
    return this.session;
  }

  public getPredefinedVideos(): VideoInfo[] {
    return PREDEFINED_VIDEOS;
  }

  /**
   * Calculates the authoritative expected timeline position in seconds.
   * If playing, expectedPosition = authoritativePosition + elapsed_time * playbackRate.
   * If paused, expectedPosition = authoritativePosition.
   */
  public getExpectedPosition(): number {
    if (!this.session.isPlaying) {
      return this.session.authoritativePosition;
    }
    const elapsedSeconds = (Date.now() - this.session.playbackStartedAt) / 1000;
    const computedPosition = this.session.authoritativePosition + elapsedSeconds * this.session.playbackRate;
    return Math.min(computedPosition, this.session.selectedVideo.duration);
  }

  /**
   * Updates state from controller commands: play, pause, seek, restart, video-change.
   */
  public play(): void {
    if (!this.session.isPlaying) {
      this.session.playbackStartedAt = Date.now();
      this.session.isPlaying = true;
      this.session.sequenceNumber++;
      logger.info(`Session Playing: Started at position ${this.session.authoritativePosition.toFixed(2)}s`);
    }
  }

  public pause(): void {
    if (this.session.isPlaying) {
      // Freeze the position at the calculated expected position
      this.session.authoritativePosition = this.getExpectedPosition();
      this.session.isPlaying = false;
      this.session.sequenceNumber++;
      logger.info(`Session Paused: Frozen at position ${this.session.authoritativePosition.toFixed(2)}s`);
    }
  }

  public seek(position: number): void {
    const clampedPosition = Math.max(0, Math.min(position, this.session.selectedVideo.duration));
    this.session.authoritativePosition = clampedPosition;
    this.session.playbackStartedAt = Date.now(); // reset timer anchor for playing progress
    this.session.sequenceNumber++;
    logger.info(`Session Seeked: Authoritative position updated to ${clampedPosition.toFixed(2)}s`);
  }

  public changeVideo(videoId: string): void {
    const video = PREDEFINED_VIDEOS.find(v => v.id === videoId);
    if (video) {
      this.session.selectedVideo = video;
      this.session.authoritativePosition = 0;
      this.session.isPlaying = false;
      this.session.playbackStartedAt = Date.now();
      this.session.sequenceNumber++;
      logger.info(`Session Video Changed: Loaded video "${video.title}"`);
    }
  }

  public registerDisplay(clientId: string, socketId: string): void {
    this.displays.set(clientId, {
      clientId,
      socketId,
      connectionStatus: 'connected',
      lastHeartbeat: Date.now(),
      latency: 0,
      currentPosition: 0,
      drift: 0,
      playbackState: 'paused',
      bufferHealth: 0
    });
    logger.info(`Display registered: ${clientId} (Socket: ${socketId})`);
  }

  public removeDisplayBySocketId(socketId: string): string | null {
    for (const [clientId, display] of this.displays.entries()) {
      if (display.socketId === socketId) {
        display.connectionStatus = 'disconnected';
        logger.info(`Display disconnected: ${clientId}`);
        return clientId;
      }
    }
    return null;
  }

  public handleHeartbeat(payload: HeartbeatPayload, socketId: string): void {
    const { clientId, currentPosition, buffered, playbackState, latency } = payload;
    let display = this.displays.get(clientId);

    if (!display) {
      // Re-register if not found
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

    // Calculate drift: client currentPosition - expected authoritativePosition
    const expected = this.getExpectedPosition();
    display.drift = Math.round((currentPosition - expected) * 1000); // drift in ms
  }

  public getConnectedDisplays(): DisplayClient[] {
    return Array.from(this.displays.values());
  }
}
