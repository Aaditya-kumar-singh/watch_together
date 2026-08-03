'use client';

import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import { PlaybackSession, DisplayClient, VideoInfo } from '../types';

interface LogEntry {
  timestamp: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'sync';
  message: string;
}

interface StoreState {
  socket: Socket | null;
  isConnected: boolean;
  isConnecting: boolean;
  session: PlaybackSession | null;
  displays: DisplayClient[];
  logs: LogEntry[];
  
  // Actions
  initializeSocket: () => void;
  disconnectSocket: () => void;
  addLog: (type: LogEntry['type'], message: string) => void;
  clearLogs: () => void;

  // Controller Actions
  playVideo: () => void;
  pauseVideo: () => void;
  seekVideo: (position: number) => void;
  restartVideo: () => void;
  changeVideo: (videoId: string) => void;

  // Display Actions
  registerDisplay: (clientId: string) => void;
  sendHeartbeat: (payload: any) => void;
}

const SERVER_URL = 'http://localhost:4000';

export const useStore = create<StoreState>((set, get) => ({
  socket: null,
  isConnected: false,
  isConnecting: false,
  session: null,
  displays: [],
  logs: [],

  addLog: (type, message) => {
    const timestamp = new Date().toLocaleTimeString();
    set((state) => ({
      logs: [
        { timestamp, type, message },
        ...state.logs.slice(0, 99) // Limit to last 100 logs
      ]
    }));
  },

  clearLogs: () => set({ logs: [] }),

  initializeSocket: () => {
    const { socket, isConnecting } = get();
    if (socket || isConnecting) return;

    set({ isConnecting: true });
    get().addLog('info', 'Connecting to sync server...');

    const newSocket = io(SERVER_URL, {
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
      autoConnect: true
    });

    newSocket.on('connect', () => {
      set({ socket: newSocket, isConnected: true, isConnecting: false });
      get().addLog('success', `Connected to sync server (ID: ${newSocket.id})`);
    });

    newSocket.on('disconnect', () => {
      set({ isConnected: false });
      get().addLog('warning', 'Disconnected from server');
    });

    newSocket.on('connect_error', (error) => {
      set({ isConnecting: false, isConnected: false });
      get().addLog('error', `Connection error: ${error.message}`);
    });

    newSocket.on('server:sync', (session: PlaybackSession) => {
      set({ session });
    });

    newSocket.on('server:displays-update', (displays: DisplayClient[]) => {
      set({ displays });
    });

    set({ socket: newSocket });
  },

  disconnectSocket: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
      set({ socket: null, isConnected: false, session: null, displays: [] });
      get().addLog('info', 'Socket manually disconnected');
    }
  },

  // Controller Actions
  playVideo: () => {
    const { socket } = get();
    if (socket) {
      socket.emit('controller:play');
      get().addLog('info', 'Sent PLAY command');
    }
  },

  pauseVideo: () => {
    const { socket } = get();
    if (socket) {
      socket.emit('controller:pause');
      get().addLog('info', 'Sent PAUSE command');
    }
  },

  seekVideo: (position: number) => {
    const { socket } = get();
    if (socket) {
      socket.emit('controller:seek', position);
      get().addLog('info', `Sent SEEK to ${position.toFixed(2)}s`);
    }
  },

  restartVideo: () => {
    const { socket } = get();
    if (socket) {
      socket.emit('controller:restart');
      get().addLog('info', 'Sent RESTART command');
    }
  },

  changeVideo: (videoId: string) => {
    const { socket } = get();
    if (socket) {
      socket.emit('controller:video-change', videoId);
      get().addLog('info', `Sent VIDEO_CHANGE to "${videoId}"`);
    }
  },

  // Display Actions
  registerDisplay: (clientId: string) => {
    const { socket } = get();
    if (socket) {
      socket.emit('display:register', clientId);
      get().addLog('info', `Registering display client: ${clientId}`);
    }
  },

  sendHeartbeat: (payload: any) => {
    const { socket } = get();
    if (socket) {
      socket.emit('display:heartbeat', payload);
    }
  }
}));
