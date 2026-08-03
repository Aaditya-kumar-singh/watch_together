'use client';

import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import { PlaybackSession, DisplayClient } from '../types';

// ─── Log Entry ───────────────────────────────────────────────────────
interface LogEntry {
  timestamp: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'sync';
  message: string;
}

// ─── Store State ─────────────────────────────────────────────────────
interface StoreState {
  socket: Socket | null;
  isConnected: boolean;
  isConnecting: boolean;
  session: PlaybackSession | null;
  displays: DisplayClient[];
  logs: LogEntry[];
  registeredClientId: string | null; // Track registered display ID for reconnection

  // Actions
  initializeSocket: () => void;
  disconnectSocket: () => void;
  addLog: (type: LogEntry['type'], message: string) => void;
  clearLogs: () => void;

  // Controller Actions
  registerController: () => void;
  playVideo: () => void;
  pauseVideo: () => void;
  seekVideo: (position: number) => void;
  restartVideo: () => void;
  changeVideo: (videoId: string) => void;

  // Display Actions
  registerDisplay: (clientId: string) => void;
  sendHeartbeat: (payload: any) => void;
}

// ─── Server URL ──────────────────────────────────────────────────────
const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:4000';

// ─── Store ───────────────────────────────────────────────────────────
export const useStore = create<StoreState>((set, get) => ({
  socket: null,
  isConnected: false,
  isConnecting: false,
  session: null,
  displays: [],
  logs: [],
  registeredClientId: null,

  addLog: (type, message) => {
    const timestamp = new Date().toLocaleTimeString();
    set((state) => ({
      logs: [
        { timestamp, type, message },
        ...state.logs.slice(0, 199) // Keep last 200 logs
      ],
    }));
  },

  clearLogs: () => set({ logs: [] }),

  initializeSocket: () => {
    const { socket, isConnecting } = get();
    if (socket || isConnecting) return;

    set({ isConnecting: true });
    get().addLog('info', `Connecting to sync server (${SERVER_URL})...`);

    const newSocket = io(SERVER_URL, {
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      autoConnect: true,
    });

    newSocket.on('connect', () => {
      set({ socket: newSocket, isConnected: true, isConnecting: false });
      get().addLog('success', `Connected to sync server (ID: ${newSocket.id})`);

      // Reconnection: re-register display if we had one
      const { registeredClientId } = get();
      if (registeredClientId) {
        newSocket.emit('display:register', registeredClientId);
        get().addLog('sync', `Re-registered display "${registeredClientId}" after reconnect`);
      }
    });

    newSocket.on('disconnect', (reason) => {
      set({ isConnected: false });
      get().addLog('warning', `Disconnected: ${reason}`);
    });

    newSocket.on('connect_error', (error) => {
      set({ isConnecting: false, isConnected: false });
      get().addLog('error', `Connection error: ${error.message}`);
    });

    // ── Server Events ────────────────────────────────────────────────
    newSocket.on('server:sync', (session: PlaybackSession) => {
      set({ session });
    });

    newSocket.on('server:displays-update', (displays: DisplayClient[]) => {
      set({ displays });
    });

    newSocket.on('server:error', (error: { event: string; message: string }) => {
      get().addLog('error', `Server error on "${error.event}": ${error.message}`);
    });

    set({ socket: newSocket });
  },

  disconnectSocket: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
      set({ socket: null, isConnected: false, session: null, displays: [], registeredClientId: null });
      get().addLog('info', 'Socket manually disconnected');
    }
  },

  // ── Controller Actions ─────────────────────────────────────────────

  registerController: () => {
    const { socket } = get();
    if (socket) {
      socket.emit('controller:register');
      get().addLog('info', 'Registered as controller');
    }
  },

  playVideo: () => {
    const { socket } = get();
    if (socket) {
      socket.emit('controller:play');
      get().addLog('info', '▶ Sent PLAY command');
    }
  },

  pauseVideo: () => {
    const { socket } = get();
    if (socket) {
      socket.emit('controller:pause');
      get().addLog('info', '⏸ Sent PAUSE command');
    }
  },

  seekVideo: (position: number) => {
    const { socket } = get();
    if (socket) {
      socket.emit('controller:seek', position);
      get().addLog('info', `⏩ Sent SEEK to ${position.toFixed(2)}s`);
    }
  },

  restartVideo: () => {
    const { socket } = get();
    if (socket) {
      socket.emit('controller:restart');
      get().addLog('info', '🔄 Sent RESTART command');
    }
  },

  changeVideo: (videoId: string) => {
    const { socket } = get();
    if (socket) {
      socket.emit('controller:video-change', videoId);
      get().addLog('info', `🎬 Sent VIDEO_CHANGE to "${videoId}"`);
    }
  },

  // ── Display Actions ────────────────────────────────────────────────

  registerDisplay: (clientId: string) => {
    const { socket } = get();
    set({ registeredClientId: clientId }); // Persist for reconnection
    if (socket) {
      socket.emit('display:register', clientId);
      get().addLog('info', `📺 Registering display: ${clientId}`);
    }
  },

  sendHeartbeat: (payload: any) => {
    const { socket } = get();
    if (socket) {
      socket.emit('display:heartbeat', payload);
    }
  },
}));
