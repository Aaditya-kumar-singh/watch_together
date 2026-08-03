import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import logger from './logger';
import { SessionManager } from './services/SessionManager';
import { HeartbeatPayload } from './types';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

const sessionManager = SessionManager.getInstance();

// Health Check Endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    session: sessionManager.getSession(),
    displays: sessionManager.getConnectedDisplays().length
  });
});

// REST API endpoint to retrieve predefined videos
app.get('/api/videos', (req, res) => {
  res.json(sessionManager.getPredefinedVideos());
});

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: '*', // Allow connection from Next.js web application
    methods: ['GET', 'POST']
  }
});

// Broadcast helpers
const broadcastSyncState = () => {
  const syncState = {
    ...sessionManager.getSession(),
    expectedPosition: sessionManager.getExpectedPosition(),
    serverTimestamp: Date.now()
  };
  io.emit('server:sync', syncState);
};

const broadcastConnectedDisplays = () => {
  const displays = sessionManager.getConnectedDisplays();
  io.emit('server:displays-update', displays);
};

// Start a server interval to push sync states and telemetry reports
setInterval(() => {
  broadcastSyncState();
  broadcastConnectedDisplays();
}, 250);

io.on('connection', (socket: Socket) => {
  logger.info(`Client connected: ${socket.id}`);

  // Send initial playback state on connect
  socket.emit('server:sync', {
    ...sessionManager.getSession(),
    expectedPosition: sessionManager.getExpectedPosition(),
    serverTimestamp: Date.now()
  });

  // Handle Display registration
  socket.on('display:register', (clientId: string) => {
    sessionManager.registerDisplay(clientId, socket.id);
    broadcastConnectedDisplays();
  });

  // Handle Display telemetry heartbeats
  socket.on('display:heartbeat', (payload: HeartbeatPayload) => {
    sessionManager.handleHeartbeat(payload, socket.id);
  });

  // Controller commands
  socket.on('controller:play', () => {
    logger.info('Controller issued command: PLAY');
    sessionManager.play();
    broadcastSyncState();
  });

  socket.on('controller:pause', () => {
    logger.info('Controller issued command: PAUSE');
    sessionManager.pause();
    broadcastSyncState();
  });

  socket.on('controller:seek', (position: number) => {
    logger.info(`Controller issued command: SEEK to ${position}s`);
    sessionManager.seek(position);
    broadcastSyncState();
  });

  socket.on('controller:restart', () => {
    logger.info('Controller issued command: RESTART');
    sessionManager.seek(0);
    sessionManager.play();
    broadcastSyncState();
  });

  socket.on('controller:video-change', (videoId: string) => {
    logger.info(`Controller issued command: VIDEO_CHANGE to "${videoId}"`);
    sessionManager.changeVideo(videoId);
    broadcastSyncState();
  });

  // Disconnection handler
  socket.on('disconnect', () => {
    logger.info(`Client disconnected: ${socket.id}`);
    const clientId = sessionManager.removeDisplayBySocketId(socket.id);
    if (clientId) {
      broadcastConnectedDisplays();
    }
  });
});

httpServer.listen(PORT, () => {
  logger.info(`Authoritative Sync Server running on http://localhost:${PORT}`);
  logger.info(`Health check: http://localhost:${PORT}/health`);
});
