# Authoritative Real-Time Multi-Display Video Synchronization Engine

A production-grade, distributed real-time system that maintains a single authoritative playback timeline across multiple decoupled display screens.

Built with **Next.js (App Router)**, **TypeScript**, **Node.js**, **Express**, **Socket.IO**, **Zustand**, and **TailwindCSS**.

---

## System Design & Architecture

The system is designed with a unidirectional command model and a bi-directional telemetry loop. The central Sync Server remains the single source of truth for the playback session state.

```
                   ┌────────────────────────────┐
                   │       Controller UI         │
                   │ (Master Dashboard / Admin) │
                   └─────────────┬──────────────┘
                                 │
                        Socket.IO Command events
                                 │
        ┌────────────────────────┴────────────────────────┐
        │                                                 │
        │             Sync Server (Node.js)               │
        │                                                 │
        │ ┌────────────────────────────────────────────┐  │
        │ │ Session Manager (Autoritative State)       │  │
        │ │ Telemetry Database                         │  │
        │ │ expectedPosition timeline evaluator        │  │
        │ └────────────────────────────────────────────┘  │
        │                                                 │
        └───────────────┬───────────────┬─────────────────┘
                        │               │
                 Sync & Telemetry   Sync & Telemetry
                        │               │
             ┌──────────┘               └───────────┐
             │                                      │
      Display Client A                     Display Client B
  (Local Drift Correction)               (Local Drift Correction)
```

### Folder Structure
```
/
├─ package.json (Monorepo Root)
├─ .gitignore
├─ .graphifyignore
├─ apps/
│  ├─ server/ (Node.js + Express + Socket.IO Backend)
│  │  ├─ src/
│  │  │  ├─ index.ts (Server Entrypoint)
│  │  │  ├─ logger.ts (Winston logging wrapper)
│  │  │  ├─ types/ (Shared models)
│  │  │  └─ services/
│  │  │     └─ SessionManager.ts (Playback state calculations)
│  ├─ web/ (Next.js Frontend)
│  │  ├─ src/
│  │  │  ├─ app/ (App Router pages)
│  │  │  │  ├─ page.tsx (Home Portal)
│  │  │  │  ├─ controller/ (Admin Controller page)
│  │  │  │  └─ display/ (Playback Client page)
│  │  │  ├─ components/ (Reusable UI Components)
│  │  │  │  ├─ ControllerDashboard.tsx
│  │  │  │  ├─ DisplayView.tsx
│  │  │  │  └─ LogConsole.tsx
│  │  │  ├─ store/
│  │  │  │  └─ useStore.ts (Client Zustand store)
│  │  │  └─ types.ts
```

---

## Synchronization Algorithm

To calculate the expected authoritative position of a video at any instant without locking ports or polling databases, the server uses a **time-anchored expected position formula**:

$$\text{Expected Position} = \text{authoritativePosition} + \left( \frac{\text{Current Server Time} - \text{playbackStartedAt}}{1000} \right) \times \text{playbackRate}$$

When a display client reports its playback state, the server compares the reported position to this calculated expected position to gauge drift.

---

## Two-Level Drift Correction Strategy

Each display client calculates its local drift relative to the server broadcast ticks:

$$\text{Drift (ms)} = (\text{clientVideo.currentTime} - \text{Expected Position}) \times 1000$$

The client applies a **Two-Level Sync Engine** to correct offsets smoothly:

| Drift Level | Threshold | Action Taken | Rationale |
| :--- | :--- | :--- | :--- |
| **Level 0 (In Sync)** | $< 150$ ms | None | Prevents constant rate alterations under jitter. |
| **Level 1 (Soft Sync)** | $150$ ms to $500$ ms | Adjust playback rate to $0.95\text{x}$ or $1.05\text{x}$ | Slowly drags position back into sync without visible visual skipping. |
| **Level 2 (Hard Sync)** | $> 500$ ms | Seek directly to Expected Position | Triggers a hard seek to force recovery during severe drift. |

### Anti-Oscillation Cooldown Lock
After a **Level 2** hard seek, a **3-4 second cooldown lock** is activated. During this lock, all sync rate corrections are frozen. This lets the player's decoder buffer frames and stabilize before recalculating drift, preventing "seek loops".

---

## Socket Event Flow

| Event Name | Sent By | Payload | Purpose |
| :--- | :--- | :--- | :--- |
| `display:register` | Client | `clientId` | Registers a display client to the telemetry table. |
| `display:heartbeat` | Client | Current time, buffer end, state, latency, timestamp | Emitted every 250ms to report telemetry. |
| `controller:play` | Controller | None | Starts master video playback. |
| `controller:pause` | Controller | None | Freezes master playback. |
| `controller:seek` | Controller | `position` | Seeks master timeline to a coordinate. |
| `controller:video-change` | Controller | `videoId` | Loads a different movie. |
| `server:sync` | Server | Authoritative session details | Emitted every 250ms to sync displays. |
| `server:displays-update`| Server | Connected displays database | Emitted every 250ms to feed Controller charts. |

---

## Engineering Trade-offs & Design Decisions

### 1. Decoupled Frontends in Monorepo
* **Decision**: Kept server and client in separate workspaces rather than bundling Socket.IO into Next.js edge functions.
* **Trade-off**: Requires running two processes (managed via concurrently), but guarantees WebSocket connection performance.

### 2. Client-Side Drift Correction Logic
* **Decision**: Let the display client run the drift correction rules rather than server-issued seek commands.
* **Trade-off**: Offloads processing from the server, improving horizontal scalability.

### 3. Rate-Steering vs. Constant Seeking
* **Decision**: Soft sync at $150\text{ms}-500\text{ms}$ thresholds.
* **Trade-off**: Under jitter, rate-steering is virtually invisible to viewers, keeping video frames flowing.

---

## Future Implementations & Scaling (N+1)
* **Redis Pub/Sub adapter** to scale Socket.IO connections across multiple server instances.
* **WebRTC Data Channel** for display-to-display peer coordination.
* **Prometheus health endpoints** to monitor buffer health drops globally.

---

## Setup & Running Locally

### Prerequisites
- Node.js (v18 or higher)
- npm (v9 or higher)

### 1. Install dependencies
```bash
npm install
```

### 2. Start the development environment (Starts both Server and Next.js Web App)
```bash
npm run dev
```

The console will boot up concurrently:
* **Next.js Web Portal**: `http://localhost:3000`
* **Authoritative Sync Server**: `http://localhost:4000`
* **Server Health Checks**: `http://localhost:4000/health`
