# CollabLens — Completion & Progress Guide

> **Current Status:**
>
> - ✅ **Phase 1**: JWT Authentication & MongoDB Persistence (Fully Complete)
> - ✅ **Phase 2**: Real-Time Socket.IO Core & Room Lifecycle (Fully Complete)
> - ✅ **Phase 3**: Collaborative Workspace Tools (Whiteboard, Monaco Code Editor, Sticky Layout, Knock Rejoin) (Fully Complete)
> - ⚠️ **Phase 4**: Unified Microphone & Web Speech API Transcription (Partially Complete — Works on primary local host; network/no-speech errors on remote tunnel clients)
> - ⚠️ **Phase 5**: WebRTC Video/Audio Streaming (Incomplete / Unfinished — Multi-device bidirectional video transmission fails between remote peers due to WebRTC mesh renegotiation & NAT limitations)
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

### 4. Phase 4 — Unified Microphone & Voice Speech-to-Text (⚠️ Partially Incomplete)

- **Implemented Functionality**:
  - Master microphone toggle in header controlling both WebRTC audio capture and speech recognition.
  - Auto-submission of finalized speech transcripts into chat with `🎙` badge.
- **Known Limitations & Failure Points**:
  - **Remote Device Speech Recognition Failure**: Chrome's `webkitSpeechRecognition` relies on Google Cloud speech servers. When running on secondary laptops or remote tunnels (e.g. Cloudflare tunnel), the recognition engine frequently reports `no-speech` or `network` errors and fails to transcribe voice audio.
  - **Browser Dependency**: Only functions reliably on Google Chrome desktop under direct localhost; Safari and Firefox lack native support for `webkitSpeechRecognition`.

---

### 5. Phase 5 — WebRTC Video/Audio Streaming (⚠️ Unfinished / Known Issues)

> [!WARNING]
> Multi-device WebRTC video and audio transmission across remote laptops/tunnels is currently **incomplete**. While local self-views render and peer signaling connects, remote peer video streams fail to render across devices (e.g. Host cannot view Jhon Doe's video even when turned on), and audio is also not being streamed.

#### Observed Diagnostic Symptoms (From Browser Console Logs)

1. **Asymmetric Track Delivery**:
   - Host (e.g. Manish) creates offer, attaches webcam track, and sends to Callee (Jhon Doe).
   - Jhon Doe receives remote video/audio from Manish.
   - When Jhon Doe subsequently turns ON webcam, Jhon Doe updates transceiver sender (`Video sender updated for Manish`) and sends an SDP answer.
   - However, Host (Manish) never triggers an `ontrack` event for Jhon Doe's track because Jhon Doe is an answerer and cannot unilaterally initiate a renegotiated SDP offer under the deterministic caller model.
2. **Offer/Answer Signaling Desynchronization**:
   - Console logs frequently show `Queued negotiation with Peer; current state is stable` or `Received renegotiate request` loops when multiple peers toggle devices simultaneously.
3. **Tunneling & Symmetric NAT Traversal Blockage**:
   - Cloudflare Tunnel (`cloudflared tunnel --url http://localhost:3001`) only tunnels HTTP/WebSocket traffic (TCP port 80/443).
   - Direct WebRTC media packets (UDP RTP/RTCP streams) cannot flow through an HTTP tunnel without dedicated, high-throughput TURN relays. Free public TURN servers (OpenRelay) suffer from rate limits and candidate rejections.

#### Architectural Root Causes

- **Mesh Topology Bottleneck ($O(N^2)$)**: In a peer-to-peer mesh, each client must maintain separate bidirectional RTCPeerConnections with every other client. Dynamic track replacement (toggling camera/mic mid-call) creates complex SDP negotiation glare and race conditions across multiple browsers.
- **Answerer Track Replacement Constraint**: In standard WebRTC, an answerer cannot add new media m-lines in an answer if they were not offered. The caller must renegotiate, but timing mismatches and state conflicts prevent the caller from picking up the new track.

---

### 6. Phase 6 — Multi-Device Remote Tunneling & HTTPS (Completed ✅)

- **Cloudflare Tunnel Support**: Full support for exposing backend/frontend via `cloudflared tunnel --url http://localhost:3001` or Vite proxy.
- **Local HTTPS Certificates**: Self-signed RSA-2048 SSL certificates in `frontend/.cert/cert.pem` for LAN IP testing (`https://<LAN-IP>:5173`).
- **Secure Context Compliance**: WebRTC and Web APIs require HTTPS to allow hardware microphone/webcam permissions.

---

### 7. Phase 7 — ML Intelligence Engine & Post-Session Report (Completed ✅)

- **8 Analysis Modules**:
  1. `sentiment.py` — Sentiment scoring and emotional trajectory.
  2. `classifier.py` — Zero-shot message categorization (idea, question, agreement, dispute, etc.).
  3. `embeddings.py` — SentenceTransformer semantic embeddings (`all-MiniLM-L6-v2`).
  4. `clustering.py` — DBSCAN idea grouping and topic identification.
  5. `network.py` — NetworkX communication graphs and density analysis.
  6. `stuck_detection.py` — 4-signal temporal sliding-window deadlock detection.
  7. `contributions.py` — Gini coefficient and multi-dimensional equity breakdown.
  8. `timeline.py` — 60-second window cognitive progression generator.
- **Interactive Report View (`Report.tsx`)**:
  - Overall Team Score & Intelligence Indicators.
  - Recharts sentiment timeline & cognitive progression charts.
  - 2D force-directed communication graph.
  - Individual contribution radar/bar charts.
  - Strengths & Improvement recommendations.
- **Validation Suite (`test_pipeline.py`)**: 9/9 benchmark tests passing across all collaboration profiles.

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

### 3. Start Frontend Dev Server (React/Vite)

```bash
cd frontend
npm install
npm run dev
```

_(Runs on `http://localhost:5173` or `https://localhost:5173`)_

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
# In a new terminal window:
cloudflared tunnel --url http://localhost:3001
```

_(Copy the generated HTTPS trycloudflare.com URL and share it with participants to join the collaborative workspace)_
