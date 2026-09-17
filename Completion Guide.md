# CollabLens — Completion & Progress Guide

> **Current Status:**
>
> - ✅ **Phase 1**: JWT Authentication & MongoDB Persistence (Fully Complete)
> - ✅ **Phase 2**: Real-Time Socket.IO Core & Room Lifecycle (Fully Complete)
> - ✅ **Phase 3**: Collaborative Workspace Tools (Whiteboard, Monaco Code Editor, Sticky Layout, Knock Rejoin) (Fully Complete)
> - ⚠️ **Phase 4**: Unified Microphone & Web Speech API Transcription (Partially Complete — Works on primary local host; network/no-speech errors on remote tunnel clients)
> - ✅ **Phase 5**: WebRTC Video/Audio Streaming (Working — Bidirectional media tested with 2 and 3 devices over Cloudflare tunnel)
> - ✅ **Phase 6**: Local & Remote Tunneling Infrastructure (Cloudflare Tunneling & HTTPS)
> - ✅ **Phase 7**: ML Intelligence Engine & Dynamics Analytics Report (Fully Complete — 9/9 Benchmark Tests Passing)

---

## 🎯 Detailed Feature & Architecture Status

### 1. Phase 1 — JWT Auth & Persistence (Completed ✅)

- **Authentication**: JWT login/register system with bcrypt password hashing (`/api/auth/register`, `/api/auth/login`, `/api/auth/me`).
- **Database**: MongoDB integration via Mongoose (`User`, `Session`, `Message`, `Report`, `WhiteboardEvent`, `EditorEvent`).
- **Frontend UI**: Glassmorphism Login/Register page with state-driven protected routes (`ProtectedRoute`).
- **Socket Security**: Socket.IO JWT auth handshake verification (`io.use()`).

### 2. Phase 2 — Real-Time Core & Participant Lifecycle (Completed ✅)

- **Rooms**: Socket.IO room management (Create/Join via 6-character room codes).
- **Real-Time Chat**: Bi-directional messaging with color-coded participant avatars.
- **Server Timer**: Synchronized countdown timer controlled by server.
- **Participant Actions & Toast Notifications**:
  - Host can **End Session** early.
  - Participants can **Leave Session** (emits `leave_room` and instantly updates room state for everyone).
  - Google Meet style floating **Toast Notifications** (`[Avatar] Name joined/left the session`) for real-time join & leave feedback.

### 3. Phase 3 — Collaborative Workspace Tools & Preserved Navigation (Completed ✅)

- **Collaborative Excalidraw Whiteboard (`WhiteboardPanel.tsx`)**:
  - Real-time drawing synchronization via debounced Socket.IO events.
  - Persistence to MongoDB (`WhiteboardEvent` collection).
  - Read-only mode on session end & state sync for late joiners / rejoiners.
  - Memoized with `React.memo` to prevent re-renders during speech or media events.
- **Collaborative Monaco Code Editor (`CodeEditorPanel.tsx`)**:
  - Real-time code synchronization (VS Dark theme, JetBrains Mono typography).
  - Multi-language support (JavaScript, Python, TypeScript, C++, Java, HTML, CSS) with synchronized language selection across participants.
  - Persistence to MongoDB (`EditorEvent` collection).
  - Memoized with `React.memo` to isolate editor state.
- **Pinned Workspace Navigation & Fixed Layout (`Workspace.css`)**:
  - Applied strict `min-height: 0; min-width: 0;` bounds across `.workspace-main`, `.chat-panel`, `.messages-container`, `.main-area`, and `.workspace-tab-content`.
  - Pinned `.workspace-tabs` (`Whiteboard` ✏️ | `Code Editor` 💻) and `.chat-header` firmly at the top, preventing canvas overflow or chat scrolling from pushing headers off the screen.
- **Participant Rejoin System (Google Meet Style)**:
  - Knock-to-admit flow: Participant who left an active session can request to rejoin. Host receives an admission toast bar with Accept / Deny controls.
  - Full state sync on rejoin (messages, whiteboard elements, code content, timer state).
- **Edge Case Hardening**:
  - **Host Transfer**: Auto-promotes longest-tenured participant if host disconnects.
  - **Reconnection Grace Period**: 15-second grace window on brief WiFi/socket drops with transparent reconnection.
  - **Host Kick Ability**: Host can kick disruptive participants with real-time room notification.
  - **Tab Closure Warning**: `beforeunload` guard prevents accidental browser tab closing.

---

### 4. Phase 4 — Unified Microphone & Voice Speech-to-Text (⚠️ Partially Complete)

- **Implemented Functionality**:
  - Master microphone toggle in header controlling both WebRTC audio capture and speech recognition.
  - Auto-submission of finalized speech transcripts into chat with `🎙` badge.
- **Known Limitations & Failure Points**:
  - **Remote Device Speech Recognition Failure**: Chrome's `webkitSpeechRecognition` relies on Google Cloud speech servers. When running on secondary laptops or remote tunnels (e.g. Cloudflare tunnel), the recognition engine frequently reports `no-speech` or `network` errors and fails to transcribe voice audio.
  - **Browser Dependency**: Only functions reliably on Google Chrome desktop under direct localhost; Safari and Firefox lack native support for `webkitSpeechRecognition`.

---

### 5. Phase 5 — WebRTC Video/Audio Streaming (✅ Working — Tested Multi-Device)

> [!NOTE]
> **Status updated 2026-08-27**: WebRTC bidirectional video and audio is now **working** across remote devices via Cloudflare tunnel. Successfully tested with **2 devices** (Host Manish ↔ Jhon Doe) and **3 devices** (Manish ↔ Jhon Doe ↔ Collab). All participants can see and hear each other when camera/mic are enabled.

#### What Was Fixed (2026-08-27)

Three critical bugs in `useWebRTC.ts` were resolved:

1. **`renegotiateWithAllPeers` violated W3C offerer/answerer roles (ROOT CAUSE)**:
   - Previously, `renegotiateWithAllPeers` always called `createOfferAndSend` regardless of which peer should be the offerer. When the polite peer (answerer, higher userId) turned on mic/camera, it would send an offer that collided with the impolite peer's (offerer, lower userId) offer — and the impolite peer would ignore it per W3C Perfect Negotiation rules. This meant the offerer never learned about the answerer's new media tracks.
   - **Fix**: `renegotiateWithAllPeers` now checks `userId < peerId` — if we're the offerer, we create the offer; if we're the answerer, we send `webrtc_renegotiate_request` asking the other peer to send us an offer.

2. **Answerer didn't attach local tracks before creating the SDP answer**:
   - When the answerer received an offer and created an answer, its existing local media tracks (mic/camera) were not attached to the transceiver senders. The answer's SDP direction would be `recvonly` instead of `sendrecv`, so the offerer never received the answerer's tracks.
   - **Fix**: Before `createAnswer()`, the code now checks for local audio/video tracks and attaches them to the appropriate transceivers with `sendrecv` direction.

3. **No receiver track synchronization after renegotiation**:
   - `ontrack` only fires when NEW tracks are added. For existing transceivers, renegotiation doesn't re-fire `ontrack`. So even after successful renegotiation, `remoteStreams` state didn't include newly-active tracks.
   - **Fix**: Added `syncAllReceiverTracks()` that runs after every `setRemoteDescription(answer)` and `createAnswer()` — it scans all transceivers' receiver tracks and ensures they're in the `remoteStreams` state.

#### Testing Observations

- **2-device test** (Manish ↔ Jhon Doe): Bidirectional video and audio worked correctly. Both could see and hear each other. Camera on/off toggling propagated correctly. `currentDirection=sendrecv` confirmed on both transceivers after renegotiation.
- **3-device test** (Manish ↔ Jhon Doe ↔ Collab): Full mesh established. All three participants could see and hear each other. Role-based renegotiation (`Renegotiating as OFFERER` / `Requesting renegotiation from`) working correctly per userId ordering.
- **Connection recovery**: When a participant briefly disconnected (Collab ICE `disconnected` → `connected`), the peer connection recovered automatically and media resumed after re-offer/answer.
- **Transceiver proliferation**: On the answerer side, 4 transceivers are observed (2 from `createPeerConnection` + 2 matched from the offer). Tracks are correctly routed through transceivers 2 & 3 (`currentDirection=sendrecv`) while transceivers 0 & 1 remain `currentDirection=null`. This is harmless but could be optimized in a future refactor.

#### Remaining Observations & Known Edge Cases

- **Long session stability**: In a ~10 minute session, tracks ended (`Remote audio track ended from Jhon Doe`) — likely caused by the Cloudflare tunnel dropping the backend connection (confirmed by cloudflared logs: `Unable to reach the origin service... target machine actively refused it`). This is a **tunnel stability issue**, not a WebRTC bug. The backend server was briefly unreachable, causing Socket.IO disconnect which triggered peer connection teardown.
- **Cloudflare tunnel limitations**: The tunnel only proxies HTTP/WebSocket traffic. WebRTC media flows peer-to-peer via STUN/TURN (UDP/TCP). When peers are behind symmetric NATs, they rely on TURN relay. The free OpenRelay TURN servers are used as fallback, which may have rate limits or reduced reliability for sustained sessions.

#### Session End & UX Fixes (2026-09-18)

Four additional bugs were fixed after continued multi-device testing:

1. **Camera/mic stayed on after session ended**:
   - When the host ended the session, the `session_ended` event handler only set `roomStatus` to `completed` — it did not stop WebRTC media tracks or tear down peer connections. The webcam LED would remain on and video tiles stayed visible.
   - **Fix**: `session_ended` handler now calls `webrtc.leaveCall()` which stops all local media tracks (turns off webcam LED), closes all `RTCPeerConnection`s, and clears remote streams. Speech recognition is also stopped.

2. **Could not start a new session after ending one ("active session in another tab")**:
   - After a session ended, the in-memory `rooms` map still contained the completed room with participants listed. `findRoomByUserId()` found the user in the completed room and blocked new room creation.
   - **Fix**: `findRoomByUserId()` now skips rooms with `status === 'completed'`. Additionally, a 5-minute delayed cleanup (`setTimeout`) deletes completed rooms from the `rooms` map to free memory.

3. **Video tiles overlapped when multiple cameras turned on**:
   - Each `VideoTile` captured its initial position once via `useState`. When new tiles appeared (e.g. a remote peer turned on camera), existing tiles didn't reposition — causing visual overlap.
   - **Fix**: Added a `positionKey` to the `useDraggable` hook. When the layout changes (tiles added/removed), each tile's position recalculates to maintain proper vertical stacking (150px spacing). Tiles remain fully draggable after initial positioning.

4. **Session duration always showed configured timer instead of actual elapsed time**:
   - The `session_ended` event only sent `duration: room.settings.timerDuration` (the configured value, e.g. 15m), not the actual elapsed time when the host ends early.
   - **Fix**: Backend now computes `actualDuration` from `startedAt` → `endedAt` timestamps and sends it in the `session_ended` event. The session summary UI displays the real elapsed time.

5. **Removed redundant "Check Report" button**:
   - A gray "Check Report" button appeared in the session summary during ML analysis. It served no useful purpose since the full "View Team Intelligence Report" button appears once analysis completes.
   - **Fix**: Removed the button entirely. Users now see the analysis progress indicator, then the report button when ready.

---

### 6. Phase 6 — Multi-Device Remote Tunneling & HTTPS (Completed ✅)

- **Cloudflare Tunnel Support**: Full support for exposing backend/frontend via `cloudflared tunnel --url http://localhost:3001` or Vite proxy.
- **Local HTTPS Certificates**: Self-signed RSA-2048 SSL certificates in `frontend/.cert/cert.pem` for LAN IP testing (`https://<LAN-IP>:5173`).
- **Secure Context Compliance**: WebRTC and Web APIs require HTTPS to allow hardware microphone/webcam permissions.

---

### 7. Phase 7 — ML Intelligence Engine & Post-Session Report (Completed ✅)

- **9 Analysis Modules** (originally planned as 8, expanded to include `timeline.py`):
  1. `sentiment.py` — Sentiment scoring and emotional trajectory.
  2. `classifier.py` — Zero-shot message categorization (idea, question, agreement, dispute, etc.).
  3. `embeddings.py` — SentenceTransformer semantic embeddings (`all-MiniLM-L6-v2`).
  4. `clustering.py` — DBSCAN idea grouping and topic identification.
  5. `network.py` — NetworkX communication graphs and density analysis.
  6. `stuck_detection.py` — 4-signal temporal sliding-window deadlock detection.
  7. `contributions.py` — Gini coefficient and multi-dimensional equity breakdown.
  8. `timeline.py` — 60-second window cognitive progression generator.
  9. `exploration.py` — Shannon entropy-based idea exploration scoring.
- **Interactive Report View (`Report.tsx`)**:
  - Overall Team Score & Intelligence Indicators.
  - Recharts sentiment timeline & cognitive progression charts.
  - 2D force-directed communication graph.
  - Individual contribution radar/bar charts.
  - Strengths & Improvement recommendations.
- **Validation Suite (`test_pipeline.py`)**: 9/9 benchmark tests passing across all collaboration profiles.

---

## 📋 Implementation Plan Cross-Reference

### Plan 1: "WebRTC Video Fixes, Unified Mic, & ML Pipeline Testing"

| Item | Status | Notes |
|---|---|---|
| Fix Code Editor/Whiteboard vanishing when cameras appear | ✅ Done | `VideoOverlay.css` fixed with `pointer-events: none` + explicit positioning |
| Unified Mic Button (merge voice + WebRTC) | ✅ Done | Single mic toggle in `Workspace.tsx` controls both WebRTC audio and speech-to-text |
| Video visibility to others (Google Meet style) | ✅ Done | `webrtc_camera_toggle` events, `remoteCameraStates` tracking, avatar fallback tiles |
| ML Pipeline Validation with seed data | ✅ Done | 4 seed scenarios in `seed/`, `test_pipeline.py` with 9/9 passing |

### Plan 2: "WebRTC Multi-Peer Mesh Streaming & Professional Meeting Environment"

| Item | Status | Notes |
|---|---|---|
| Continuous Mesh Synchronization | ✅ Done | `participants` list scanned dynamically, missing peers connected via `connectToPeer` |
| W3C Perfect Negotiation with collision handling | ✅ Done | Polite/impolite peer roles, rollback on collision |
| Optimized transceiver & track replacement | ✅ Done | `replaceTrack` on toggle, `sendrecv` direction management, `syncAllReceiverTracks` |
| Resilient ICE server configuration | ✅ Done | Multi-STUN (Google, Cloudflare, Twilio, Mozilla) + open relay TURN fallback |
| Auto-recovery (ICE restart, reconnection) | ✅ Done | ICE failure → auto ICE restart, disconnection timer → recovery |
| Video muted + explicit `.play()` for autoplay | ✅ Done | `<video muted playsInline autoPlay />` with `.play().catch()` |
| Avatar fallback when camera is off | ✅ Done | Sleek participant badge with initials, name, color |
| Active speaker / muted indicators | ✅ Done | Muted badge, mic state indicators on video tiles |
| Professional glassmorphism styling | ✅ Done | `VideoOverlay.css` with glassmorphism, glow effects |

---

## 📊 Roadmap Implementation Audit

### From `roadmap_v2_part1.md` (Phases 0–3)

| Phase | Planned | Implemented |
|---|---|---|
| **Phase 0 — Foundation** | Vite + React, Express, Flask, MongoDB, seed data, contracts.md | ✅ All done. Seed data in `seed/` with 4 scenarios. `contracts.md` not created as a standalone file (contracts are implicitly defined in code), but not necessary. |
| **Phase 1 — Auth + DB** | JWT auth, bcrypt, separate Mongoose collections | ✅ All done. 6 separate collections: `User`, `Session`, `Message`, `Report`, `WhiteboardEvent`, `EditorEvent` |
| **Phase 2 — Real-Time Core** | Socket.IO rooms, chat, timer, disconnect handling | ✅ All done. Including 15s grace period reconnection, host transfer, zombie room cleanup |
| **Phase 3 — Workspace Tools** | Excalidraw (pinned), Monaco, CSS Grid layout | ✅ All done. Excalidraw pinned, Monaco with multi-language, CSS layout with strict bounds |
| **Zustand** | State management | ✅ Used for `useAuthStore` and `useAppStore` |
| **react-force-graph** | Network viz in Report | ✅ Used in `Report.tsx` |

### From `roadmap_v2_part2.md` (Phases 4–9)

| Phase | Planned | Implemented |
|---|---|---|
| **Phase 4 — ML Pipeline** | Flask + 7 modules + batch classification | ✅ All done. 9 modules total (added `timeline.py`, `contributions.py` beyond original plan) |
| **Phase 5 — Voice Input** | `useVoice` hook, Web Speech API | ✅ Done (as `useVoiceRecognition.ts`). Works locally, limited on remote tunnels |
| **Phase 6 — Report Page** | Recharts, network graph, contribution charts, insights | ✅ Done in `Report.tsx` |
| **Phase 7 — Integration** | Node→Python retry, zombie cleanup, error handling | ✅ Done. 3-retry with backoff, `analysis_pending` status, zombie room cleanup every 5 min |
| **Phase 8 — Problems Bank** | Problem collection in MongoDB | ❌ Not implemented. `problemText` is a free-text field set at room creation, but no `Problem` model or pre-built problems bank exists |
| **Phase 9 — Polish + Testing** | Edge case guards, testing checklist | ✅ Mostly done. All ML guard clauses present. Multi-device testing performed. |

---

## 🛠️ How to Run the Project (Local & Cloudflare Tunnel)

### 1. Start MongoDB

Ensure MongoDB is running locally:

```bash
mongod
# or start via Windows Services / Docker
```

### 2. Start Backend Server (Node.js)

```bash
cd backend
npm install
npm run dev
```

_(Runs on `http://localhost:3001`)_

### 3. Start Frontend Dev Server (React/Vite) — OR — Build for Production

**Development mode:**
```bash
cd frontend
npm install
npm run dev
```
_(Runs on `http://localhost:5173` or `https://localhost:5173`)_

**Production build (recommended for Cloudflare tunnel):**
```bash
cd frontend
npm run build
```
_(Built assets served by the backend at `http://localhost:3001`)_

### 4. Start Python ML Intelligence Service

```bash
cd ml-service
python -m venv venv
# Windows: venv\Scripts\activate
# Mac/Linux: source venv/bin/activate
pip install -r requirements.txt
python app.py
```

_(Runs on `http://localhost:5000`)_

### 5. Expose for Multi-Device Remote Testing (Cloudflare Tunnel)

To connect multiple laptops / remote devices over the internet:

```bash
# Build frontend first (so backend serves it):
cd frontend && npm run build && cd ..

# Start backend:
cd backend && npm run dev

# In a new terminal window:
cloudflared tunnel --url http://localhost:3001
```

_(Copy the generated HTTPS trycloudflare.com URL and share it with participants to join the collaborative workspace)_

> [!TIP]
> When using Cloudflare tunnel, build the frontend production bundle and let the backend serve it from `frontend/dist/`. This avoids needing to tunnel both the Vite dev server (5173) and the backend (3001) separately, and ensures all participants load the same built assets.

> [!WARNING]
> **Cloudflare tunnel stability**: The tunnel may occasionally drop backend connectivity (observed: `Unable to reach the origin service... target machine actively refused it`). This causes Socket.IO disconnections and WebRTC peer teardown. If this happens mid-session, participants will see connection interruption warnings and the system will attempt automatic recovery. Restarting the backend server typically resolves the issue.

