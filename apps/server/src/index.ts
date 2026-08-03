import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import logger from './logger';
import { SessionManager } from './services/SessionManager';
import {
  HeartbeatPayloadSchema,
  SeekPayloadSchema,
  VideoChangePayloadSchema,
  ClientIdSchema,
} from './types';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

const sessionManager = SessionManager.getInstance();

// ─── REST Endpoints ──────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    session: sessionManager.getSessionSummary(),
    connectedDisplays: sessionManager.getConnectedDisplays().length,
  });
});

app.get('/api/videos', (_req, res) => {
  res.json(sessionManager.getPredefinedVideos());
});

// ─── Socket.IO Server ────────────────────────────────────────────────

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// ─── Broadcast Helpers ───────────────────────────────────────────────

const broadcastSyncState = () => {
  io.emit('server:sync', sessionManager.getSessionSummary());
};

const broadcastConnectedDisplays = () => {
  io.emit('server:displays-update', sessionManager.getConnectedDisplays());
};

// ─── Sync Tick (250ms) ───────────────────────────────────────────────
// Pushes authoritative state and display telemetry to all clients.
// Also runs stale heartbeat detection.

setInterval(() => {
  sessionManager.detectStaleDisplays();
  broadcastSyncState();
  broadcastConnectedDisplays();
}, 250);

// ─── Connection Handler ──────────────────────────────────────────────

io.on('connection', (socket: Socket) => {
  logger.info(`🔌 Client connected: ${socket.id}`);

  // Immediately send current session state on connect (reconnection sync)
  socket.emit('server:sync', sessionManager.getSessionSummary());

  // ── Controller Registration ──────────────────────────────────────
  socket.on('controller:register', () => {
    sessionManager.setControllerId(socket.id);
    socket.emit('server:sync', sessionManager.getSessionSummary());
  });

  // ── Display Registration ─────────────────────────────────────────
  socket.on('display:register', (clientId: unknown) => {
    const parsed = ClientIdSchema.safeParse(clientId);
    if (!parsed.success) {
      socket.emit('server:error', { event: 'display:register', message: parsed.error.message });
      return;
    }
    sessionManager.registerDisplay(parsed.data, socket.id);
    // Immediately sync this display with current state (reconnection support)
    socket.emit('server:sync', sessionManager.getSessionSummary());
    broadcastConnectedDisplays();
  });

  // Also support the alias client:register
  socket.on('client:register', (clientId: unknown) => {
    const parsed = ClientIdSchema.safeParse(clientId);
    if (!parsed.success) {
      socket.emit('server:error', { event: 'client:register', message: parsed.error.message });
      return;
    }
    sessionManager.registerDisplay(parsed.data, socket.id);
    socket.emit('server:sync', sessionManager.getSessionSummary());
    broadcastConnectedDisplays();
  });

  // ── Display Heartbeat ────────────────────────────────────────────
  socket.on('display:heartbeat', (payload: unknown) => {
    const parsed = HeartbeatPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      socket.emit('server:error', { event: 'display:heartbeat', message: parsed.error.message });
      return;
    }
    sessionManager.handleHeartbeat(parsed.data, socket.id);
  });

  // ── Controller Commands ──────────────────────────────────────────

  socket.on('controller:play', () => {
    logger.info('Controller → PLAY');
    sessionManager.play();
    broadcastSyncState();
  });

  socket.on('controller:pause', () => {
    logger.info('Controller → PAUSE');
    sessionManager.pause();
    broadcastSyncState();
  });

  socket.on('controller:seek', (position: unknown) => {
    const parsed = SeekPayloadSchema.safeParse(position);
    if (!parsed.success) {
      socket.emit('server:error', { event: 'controller:seek', message: parsed.error.message });
      return;
    }
    logger.info(`Controller → SEEK to ${parsed.data.toFixed(2)}s`);
    sessionManager.seek(parsed.data);
    broadcastSyncState();
  });

  socket.on('controller:restart', () => {
    logger.info('Controller → RESTART');
    sessionManager.seek(0);
    sessionManager.play();
    broadcastSyncState();
  });

  socket.on('controller:video-change', (videoId: unknown) => {
    const parsed = VideoChangePayloadSchema.safeParse(videoId);
    if (!parsed.success) {
      socket.emit('server:error', { event: 'controller:video-change', message: parsed.error.message });
      return;
    }
    logger.info(`Controller → VIDEO_CHANGE to "${parsed.data}"`);
    sessionManager.changeVideo(parsed.data);
    broadcastSyncState();
  });

  // ── Disconnection ────────────────────────────────────────────────
  socket.on('disconnect', () => {
    logger.info(`🔌 Client disconnected: ${socket.id}`);
    sessionManager.clearControllerId(socket.id);
    const clientId = sessionManager.removeDisplayBySocketId(socket.id);
    if (clientId) {
      broadcastConnectedDisplays();
    }
  });
});

// ─── Start Server ────────────────────────────────────────────────────

httpServer.listen(PORT, () => {
  logger.info(`🚀 Sync Server running on http://localhost:${PORT}`);
  logger.info(`   Health: http://localhost:${PORT}/health`);
  logger.info(`   Videos: http://localhost:${PORT}/api/videos`);
});
