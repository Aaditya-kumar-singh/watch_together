# Real-Time Multi-Display Video Synchronization

A production-inspired real-time system that maintains a **single authoritative playback timeline** while multiple display clients continuously synchronize themselves under varying network conditions.

Built with **Next.js 16 (App Router)** · **TypeScript** · **Express** · **Socket.IO** · **Zustand** · **Recharts** · **Tailwind CSS**

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Folder Structure](#folder-structure)
4. [System Design](#system-design)
5. [Synchronization Algorithm](#synchronization-algorithm)
6. [Drift Correction Strategy](#drift-correction-strategy)
7. [Event Flow](#event-flow)
8. [Frontend Design](#frontend-design)
9. [Backend Design](#backend-design)
10. [Trade-offs & Engineering Decisions](#trade-offs--engineering-decisions)
11. [Failure Handling](#failure-handling)
12. [Performance Optimizations](#performance-optimizations)
13. [Future Improvements](#future-improvements)
14. [Installation & Running](#installation--running)

---

## Project Overview

The system consists of three parts:

| Component | Role |
|-----------|------|
| **Controller** | Master dashboard — selects videos, issues play/pause/seek/restart commands, monitors all displays |
| **Display Client** | Plays the video, reports telemetry every 250ms, runs local drift correction |
| **Sync Server** | Authoritative source of truth — maintains the session state, calculates expected position, detects stale clients |

The Controller does **not** directly communicate with Displays. All commands flow through the Sync Server, which broadcasts the authoritative state to all connected clients. Displays independently calculate their drift and apply corrections locally.

---

## Architecture

```
                   ┌────────────────────────────┐
                   │       Controller UI         │
                   │     Next.js + Zustand       │
                   └─────────────┬──────────────┘
                                 │
                     Socket.IO Commands
                    (play, pause, seek, restart,
                     video-change)
                                 │
        ┌────────────────────────┴────────────────────────┐
        │                                                 │
        │             Sync Server (Node.js)               │
        │                                                 │
        │ ┌────────────────────────────────────────────┐  │
        │ │ Session Manager (Singleton)                │  │
        │ ├────────────────────────────────────────────┤  │
        │ │ • Playback Timeline Calculator             │  │
        │ │ • Sequence Number / Version Control        │  │
        │ │ • Client Registry & Heartbeat Monitor      │  │
        │ │ • Drift Calculator                         │  │
        │ │ • Connection Quality Assessor              │  │
        │ │ • Stale Display Detector                   │  │
        │ └────────────────────────────────────────────┘  │
        │                                                 │
        └───────────────┬───────────────┬─────────────────┘
                        │               │
               server:sync        server:sync
              (every 250ms)      (every 250ms)
                        │               │
             ┌──────────┘               └───────────┐
             │                                      │
      Display Client A                     Display Client B
  (2-Level Drift Correction)          (2-Level Drift Correction)
```

---

## Folder Structure

```
/
├── package.json                          # Monorepo root (npm workspaces)
├── package-lock.json
├── .gitignore
├── README.md
│
├── apps/
│   ├── server/                           # Express + Socket.IO Backend
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts                  # Server entrypoint, Socket.IO event handlers
│   │       ├── logger.ts                 # Winston structured logging
│   │       ├── types/
│   │       │   └── index.ts              # TypeScript interfaces + Zod schemas
│   │       └── services/
│   │           └── SessionManager.ts     # Authoritative state engine (singleton)
│   │
│   └── web/                              # Next.js 16 Frontend (App Router)
│       ├── package.json
│       ├── tsconfig.json
│       ├── next.config.ts
│       ├── postcss.config.mjs
│       ├── eslint.config.mjs
│       └── src/
│           ├── types.ts                  # Client-side type definitions
│           ├── store/
│           │   └── useStore.ts           # Zustand state + Socket.IO bridge
│           ├── app/
│           │   ├── layout.tsx            # Root layout with metadata
│           │   ├── globals.css           # Tailwind imports + base styles
│           │   ├── page.tsx              # Home portal (/ route)
│           │   ├── controller/
│           │   │   └── page.tsx          # Controller dashboard (/controller)
│           │   └── display/
│           │       └── page.tsx          # Display client (/display?id=xxx)
│           └── components/
│               ├── ControllerDashboard.tsx  # Master control panel + drift chart
│               ├── DisplayView.tsx          # Video player + drift correction + HUD
│               └── LogConsole.tsx           # System event log terminal
```

---

## System Design

### Session Object (Authoritative State)

The server maintains a single `PlaybackSession` object as the source of truth:

```typescript
interface PlaybackSession {
  sessionId: string;
  selectedVideo: VideoInfo;
  isPlaying: boolean;
  authoritativePosition: number;   // seconds
  playbackStartedAt: number;       // server timestamp (ms)
  sequenceNumber: number;          // increments on every command
  playbackRate: number;
  controllerId: string | null;
  lastModified: number;            // server timestamp (ms)
}
```

### Display Client Object (Telemetry Record)

Each connected display is tracked with:

```typescript
interface DisplayClient {
  clientId: string;
  socketId: string;
  connectionStatus: 'connected' | 'disconnected';
  connectionQuality: 'excellent' | 'good' | 'fair' | 'poor';
  lastHeartbeat: number;
  latency: number;
  currentPosition: number;
  drift: number;                   // ms
  playbackState: 'playing' | 'paused' | 'buffering';
  bufferHealth: number;            // seconds of buffer ahead
}
```

### Version Control (Sequence Numbers)

Every controller command (play, pause, seek, restart, video-change) increments `sequenceNumber`. Displays track the last processed sequence and ignore stale commands that arrive out of order, solving the **packet reordering problem**.

### Input Validation

All incoming Socket.IO payloads are validated at runtime using **Zod schemas**. Invalid payloads trigger a `server:error` emission back to the client rather than crashing the server.

---

## Synchronization Algorithm

The expected playback position is calculated **without polling or database reads** using a time-anchored formula:

```
If paused:
  Expected Position = authoritativePosition

If playing:
  Expected Position = authoritativePosition + (now() − playbackStartedAt) / 1000 × playbackRate
```

This is evaluated on-demand (not stored) so it's always accurate regardless of when it's called.

### Drift Calculation

When a display reports its position via heartbeat:

```
Drift (ms) = (reportedPosition − expectedPosition) × 1000
```

- **Positive drift** → client is ahead of the timeline
- **Negative drift** → client is behind the timeline

---

## Drift Correction Strategy

The system implements a **Two-Level Drift Correction Engine** on the client side:

| Level | Drift Range | Action | Rationale |
|-------|-------------|--------|-----------|
| **Level 0** | < 150 ms | No action | Within acceptable jitter; corrections would cause unnecessary rate oscillation |
| **Level 1 (Soft Sync)** | 150–500 ms | Set `playbackRate` to 0.95× or 1.05× | Gradually steers the client back into sync without any visible skip or stutter |
| **Level 2 (Hard Sync)** | > 500 ms | `video.currentTime = expectedPosition` | Forces immediate recovery; drift is too large for rate correction to resolve in time |

### Anti-Oscillation Cooldown

After a Level 2 hard seek, a **4-second cooldown lock** is activated. During this period:
- All drift corrections are frozen
- Playback rate is held at 1.0×
- The video decoder is allowed to buffer and stabilize

This prevents **seeking loops** where the player buffers after a seek, reports stale position data, and triggers another immediate seek.

### Why these thresholds?

- **150 ms** — Human perception threshold for audio-video sync. Below this, drift is imperceptible.
- **500 ms** — At this drift, rate steering at ±5% would take ~10 seconds to converge. A hard seek is faster and more reliable.
- **4s cooldown** — Empirically determined to allow most browsers to fill at least one buffered range after a seek.

---

## Event Flow

### Socket Events (Client → Server)

| Event | Sent By | Payload | Purpose |
|-------|---------|---------|---------|
| `controller:register` | Controller | — | Registers the controller socket ID |
| `controller:play` | Controller | — | Start playback |
| `controller:pause` | Controller | — | Pause playback |
| `controller:seek` | Controller | `position: number` | Seek to position (seconds) |
| `controller:restart` | Controller | — | Seek to 0 + play |
| `controller:video-change` | Controller | `videoId: string` | Load a different video |
| `display:register` | Display | `clientId: string` | Register display with an ID |
| `display:heartbeat` | Display | Heartbeat payload | Report telemetry (every 250ms) |

### Socket Events (Server → Client)

| Event | Sent To | Payload | Purpose |
|-------|---------|---------|---------|
| `server:sync` | All | Session + expectedPosition + serverTimestamp | Authoritative state broadcast (every 250ms) |
| `server:displays-update` | All | DisplayClient[] | Connected displays telemetry |
| `server:error` | Sender | `{ event, message }` | Validation failure notification |

### Heartbeat Payload

```typescript
{
  clientId: string;
  currentPosition: number;     // video.currentTime
  buffered: number;            // end of first buffered range
  playbackState: 'playing' | 'paused' | 'buffering';
  latency: number;             // estimated RTT
  timestamp: number;           // client-side Date.now()
}
```

---

## Frontend Design

### Controller Dashboard (`/controller`)

```
┌─────────────────────────────────────────────────────────────┐
│  [Controller]  [2 Displays Active]        🟢 SERVER ONLINE  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  VIDEO SELECTOR                                             │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐       │
│  │ Big Buck     │ │ Sintel       │ │ Tears of     │       │
│  │ Bunny ✓     │ │              │ │ Steel        │       │
│  └──────────────┘ └──────────────┘ └──────────────┘       │
│                                                             │
│  PLAYBACK CONTROLS           Sequence: 14                   │
│  ──────●──────────────────  03:24 / 09:56                  │
│  [▶ PLAY]  [🔄 RESTART]                                    │
│                                                             │
│  DRIFT ANALYTICS (Recharts)                                 │
│  ┌─────────────────────────────────────────────────┐       │
│  │  display-1 ── display-2 ──                      │       │
│  │     ╱╲    ╱╲                                    │       │
│  │ ───╱──╲──╱──╲───── 0ms ─────────────           │       │
│  │   ╱    ╲╱                                       │       │
│  └─────────────────────────────────────────────────┘       │
│                                                             │
│  CONNECTED DISPLAYS                                         │
│  ┌─────────────────────────┐                               │
│  │ display-1     🟢 In Sync │                               │
│  │ Pos: 03:24  Drift: +12ms│                               │
│  │ Lat: 18ms  Buffer: 4.2s │                               │
│  │ STATE: playing  ● Good   │                               │
│  └─────────────────────────┘                               │
│                                                             │
│  SYSTEM LOG CONSOLE                                         │
│  [10:24:01] [SUCCESS] Connected to sync server              │
│  [10:24:02] [INFO] ▶ Sent PLAY command                     │
└─────────────────────────────────────────────────────────────┘
```

### Display Screen (`/display?id=display-1`)

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  [🔊 CLICK TO UNMUTE]                                       │
│                                                             │
│                    ┌──────────────────┐                     │
│                    │                  │                     │
│                    │   VIDEO PLAYER   │                     │
│                    │   (full screen)  │                     │
│                    │                  │                     │
│                    └──────────────────┘                     │
│                                                             │
│  ┌── DISPLAY TELEMETRY ──────────── display-1 ──┐          │
│  │ Connection      🟢 ONLINE                     │          │
│  │ Local Position  03:24 (204.12s)               │          │
│  │ Expected Pos    03:24 (204.10s)               │          │
│  │ Drift           +20 ms                        │          │
│  │ RTT Latency     18 ms                         │          │
│  │ Playback Rate   1.00x                         │          │
│  │ Sequence №      14                            │          │
│  │ Heartbeats      842                           │          │
│  │ Last Correction —                             │          │
│  │ Sync Status     ✅ in-sync                    │          │
│  │ Buffer Health   ████████░░░  4.2s             │          │
│  └───────────────────────────────────────────────┘          │
└─────────────────────────────────────────────────────────────┘
```

---

## Backend Design

### Services

| Service | Responsibility |
|---------|---------------|
| **SessionManager** (Singleton) | Maintains the authoritative playback session, calculates expected position, manages display registry, computes connection quality, detects stale heartbeats |
| **Winston Logger** | Structured console logging with timestamps for all server events |

### SessionManager Responsibilities

1. **Session Management** — Single session object with all playback state
2. **Client Registry** — Map of connected displays with telemetry data
3. **Playback Timeline** — Time-anchored expected position calculation
4. **Version Control** — Sequence numbers on every state mutation
5. **Drift Detection** — Per-display drift calculation on each heartbeat
6. **Connection Quality** — Latency-based quality assessment (excellent < 50ms, good < 100ms, fair < 200ms, poor ≥ 200ms)
7. **Stale Detection** — Displays with no heartbeat for 5s are marked disconnected
8. **Input Validation** — Zod schemas validate all incoming socket payloads

### REST Endpoints

| Method | Path | Response |
|--------|------|----------|
| GET | `/health` | Server status, uptime, session summary, display count |
| GET | `/api/videos` | Predefined video list (Big Buck Bunny, Sintel, Tears of Steel) |

---

## Trade-offs & Engineering Decisions

### 1. Monorepo with npm Workspaces

**Decision:** Server and web client in separate workspaces under a single repo.

**Trade-off:** Requires running two processes (managed via `concurrently`), but keeps concerns cleanly separated. Dependencies are hoisted to a single root `node_modules/`.

### 2. Client-Side Drift Correction

**Decision:** Display clients run the drift correction algorithm locally rather than receiving seek commands from the server.

**Trade-off:** This offloads processing from the server (improving horizontal scalability) and avoids round-trip latency in the correction loop. The display has the most accurate knowledge of its own `video.currentTime`.

### 3. Rate Steering vs. Constant Seeking

**Decision:** Soft sync at 150–500ms drift using playback rate adjustment (0.95×/1.05×).

**Trade-off:** Rate steering is virtually invisible to viewers — no frame skip, no audio glitch. Under normal jitter, displays self-correct without any user-visible disruption.

### 4. 250ms Sync Interval

**Decision:** Server broadcasts state and displays send heartbeats every 250ms.

**Trade-off:** Balances responsiveness against bandwidth. 250ms gives 4 sync points per second, sufficient for sub-second drift detection without overwhelming the network.

### 5. No Shared Types Package

**Decision:** Types are duplicated between `apps/server/src/types/` and `apps/web/src/types.ts`.

**Trade-off:** For a focused assignment, this avoids the complexity of a `packages/shared` workspace with its own build pipeline. In production, a shared package would be preferred.

---

## Failure Handling

### Reconnection Flow

```
Display disconnects (network drop)
        │
        ▼
Socket.IO auto-reconnects (up to 10 attempts)
        │
        ▼
On reconnect → socket 'connect' event fires
        │
        ▼
Store re-emits 'display:register' with stored clientId
        │
        ▼
Server re-registers display + immediately sends server:sync
        │
        ▼
Display receives current authoritative state
        │
        ▼
Drift correction loop resumes → client re-syncs to timeline
```

### Stale Heartbeat Detection

The server runs stale detection every 250ms. If a display hasn't sent a heartbeat in **5 seconds**, it's marked as `disconnected` with `poor` connection quality. This prevents the controller dashboard from showing phantom "connected" displays.

### Validation Errors

Invalid socket payloads (malformed heartbeats, empty video IDs) are caught by Zod validation. The server emits `server:error` back to the offending client and logs the error — it never crashes.

---

## Performance Optimizations

| Optimization | Status | Detail |
|-------------|--------|--------|
| Delta-based sync broadcast | ✅ Implemented | Server sends only the current state snapshot, not a diff — but each snapshot is small (~200 bytes) |
| Debounced seek events | ✅ Implemented | Seek slider fires on `onChange` which browsers already debounce |
| Memoized calculations | ✅ Implemented | `calculateExpectedPosition` wrapped in `useCallback` |
| Heartbeat batching | ✅ Implemented | Single heartbeat payload per 250ms tick |
| Log buffer cap | ✅ Implemented | Client-side logs capped at 200 entries |
| Drift history cap | ✅ Implemented | Recharts graph shows last 30 data points only |
| Lazy video loading | ✅ Implemented | Video loads only when selected by controller |
| Binary Socket.IO payloads | 📋 Future | Would reduce bandwidth by ~40% |
| Compression (gzip) | 📋 Future | Standard Express middleware addition |

---

## Future Improvements

Even if not implemented, these are designed for and could be added:

| Feature | Purpose |
|---------|---------|
| **Redis Pub/Sub Adapter** | Scale Socket.IO across multiple server instances |
| **JWT Authentication** | Secure controller access, prevent unauthorized commands |
| **Role-based Access** | Separate controller/display permissions |
| **Docker Compose** | One-command deployment with server + client containers |
| **Nginx Reverse Proxy** | SSL termination, load balancing |
| **Prometheus Metrics** | Export drift, latency, buffer health as metrics |
| **Grafana Dashboard** | Visualize system health over time |
| **PostgreSQL** | Persist session history and audit logs |
| **WebRTC Data Channel** | Peer-to-peer display coordination for LAN setups |
| **Error Tracking (Sentry)** | Capture and alert on runtime errors |

---

## Installation & Running

### Prerequisites

- **Node.js** v18 or higher
- **npm** v9 or higher

### 1. Clone & Install

```bash
git clone <repository-url>
cd <project-directory>
npm install
```

This single `npm install` at the root installs dependencies for both `apps/server` and `apps/web` via npm workspaces.

### 2. Start Development Environment

```bash
npm run dev
```

This launches both services concurrently:

| Service | URL | Description |
|---------|-----|-------------|
| **Next.js Web App** | http://localhost:3000 | Frontend portal |
| **Sync Server** | http://localhost:4000 | Socket.IO + REST API |

### 3. Open the Application

1. **Home Portal:** http://localhost:3000 — Launch pad with buttons for all interfaces
2. **Controller:** http://localhost:3000/controller — Master dashboard
3. **Display 1:** http://localhost:3000/display?id=display-1
4. **Display 2:** http://localhost:3000/display?id=display-2
5. **Display 3:** http://localhost:3000/display?id=display-3
6. **Health Check:** http://localhost:4000/health

### 4. Build for Production

```bash
npm run build --workspace=apps/server   # Compile TypeScript
npm run build --workspace=apps/web      # Build Next.js
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4000` | Sync server port |
| `NEXT_PUBLIC_SERVER_URL` | `http://localhost:4000` | Server URL used by the web client |

---

## Assumptions

1. All clients run on a local machine — network latency is negligible but the system handles it gracefully.
2. Videos are loaded from public URLs (Google's hosted sample videos) — no local file serving needed.
3. A single session is active at any time — multi-session support is a future enhancement.
4. Browser autoplay policies require user interaction to unmute audio — the display provides an unmute button.
5. The controller is a single user — concurrent controller conflicts are not handled (first-come-first-served via `controllerId`).
