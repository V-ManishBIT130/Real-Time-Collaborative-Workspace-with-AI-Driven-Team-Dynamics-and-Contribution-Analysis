# CollabLens — Completion & Progress Guide

> **Current Status:** ✅ Phase 1 (JWT Auth & Persistence), Phase 2 (Real-Time Core & Lifecycle), Phase 3 (Workspace Tools), Phase 4 (Voice STT), Phase 5 (WebRTC Video/Audio & HTTPS), and Phase 6 (ML Pipeline & Report UI) Implemented.
> **Current Focus:** 🎯 ML Pipeline Accuracy Tuning, Metric Calibration & Evaluation against Seed Datasets.

---

## 🎯 Completed Features

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

### 3. Phase 3 — Collaborative Workspace Tools (Completed ✅)
- **Collaborative Excalidraw Whiteboard (`WhiteboardPanel.tsx`)**:
  - Real-time drawing synchronization via debounced Socket.IO events.
  - Persistence to MongoDB (`WhiteboardEvent` collection).
  - Read-only mode on session end & state sync for late joiners / rejoiners.
  - Memoized with `React.memo` to prevent re-renders during speech or video streaming.
- **Collaborative Monaco Code Editor (`CodeEditorPanel.tsx`)**:
  - Real-time code synchronization (VS Dark theme, JetBrains Mono typography).
  - Multi-language support (JavaScript, Python, TypeScript, C++, Java, HTML, CSS) with synchronized language selection across participants.
  - Persistence to MongoDB (`EditorEvent` collection).
  - Memoized with `React.memo` to isolate editor state.
- **Participant Rejoin System (Google Meet Style)**:
  - Knock-to-admit flow: Participant who left an active session can request to rejoin. Host receives an admission toast bar with Accept / Deny controls.
  - Full state sync on rejoin (messages, whiteboard elements, code content, timer state).
- **Edge Case Hardening**:
  - **Host Transfer**: Auto-promotes longest-tenured participant if host disconnects.
  - **Reconnection Grace Period**: 15-second grace window on brief WiFi/socket drops with transparent reconnection.
  - **Host Kick Ability**: Host can kick disruptive participants with real-time room notification.
  - **Tab Closure Warning**: `beforeunload` guard prevents accidental browser tab closing.

### 4. Phase 4 — Voice Speech-to-Text (`useVoiceRecognition.ts`) (Completed ✅)
- Browser-native Web Speech API (`webkitSpeechRecognition`) in Chrome.
- Real-time interim speech transcripts with auto-send on speech finalization.
- Voice badge indicator (`🎙`) on transcribed messages.
- Automatic error recovery and mic permission handling.

### 5. Phase 5 — WebRTC Peer-to-Peer Video & Audio (`useWebRTC.ts`, `VideoOverlay.tsx`) (Completed ✅)
- **Peer-to-Peer Mesh**: Real-time video/audio streaming between up to 5 participants.
- **Socket.IO Signaling Relay**: Backend `socketHandler.js` relays SDP offers/answers and ICE candidates without media touching the server.
- **Floating Glassmorphism Video UI**:
  - Draggable video tiles with mirrored self-view and avatar fallback when camera is off.
  - Safe docking on the top-right to keep Excalidraw and Code Editor tools 100% accessible.
  - Floating call control bar docked in the header with camera/mic toggles and leave call button.
  - **Mic-Sharing Coordination**: Automatically coordinates microphone access between WebRTC call audio and Web Speech API transcription.
  - **Production Future-Proofing**: TURN server configuration documented and commented for future cloud deployment.

### 6. Phase 6 — HTTPS Development & Local Network Connectivity (Completed ✅)
- **Local HTTPS Certificates**: Dedicated RSA-2048 development SSL certificates with Subject Alternative Names (SANs) for `localhost`, `127.0.0.1`, `0.0.0.0`, and active Wi-Fi LAN IP in `frontend/.cert/cert.pem`.
- **Vite Proxying**: Vite configured to proxy `/api` (REST) and `/socket.io` (WSS) to `http://localhost:3001`, eliminating mixed-content errors and firewall obstacles across devices on the same Wi-Fi / Hotspot.
- **Responsive Layout Safeguards**: Chat sidebar and buttons isolated with explicit z-indexing (`z-index: 15`), ensuring they are never covered or blocked on smaller laptop screens.

### 7. Phase 7 — ML Intelligence Engine & Post-Session Report (Foundation Completed ✅)
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

---

## 🚀 Next Focus: ML Pipeline Improvisation & Accuracy Tuning

| Focus Area | Goal | Key Actions |
|---|---|---|
| **1. Seed Dataset Calibration** | Benchmark against all 4 scenarios | Run `test_pipeline.py` against `balanced_team`, `one_dominant`, `stuck_then_recovered`, and `highly_exploratory` to ensure metrics match expected behavioral profiles. |
| **2. Stuck Detection Tuning** | Reduce false positives & improve recovery detection | Fine-tune the 4-signal weights (`similarity_spike: 0.35`, `sentiment_drop: 0.25`, `no_new_clusters: 0.25`, `question_ratio: 0.15`) and 60s window threshold. |
| **3. Contribution Equity Refinement** | Balance multi-modal contributions | Weigh chat messages, speech transcripts, code edits, and whiteboard strokes appropriately in the Gini calculation. |
| **4. Zero-Shot Prompt & Classification Polish** | Better category separation | Refine candidate labels and confidence thresholds in `classifier.py` for collaboration-specific phrases. |
| **5. Insights & Summary Generation** | Context-rich qualitative feedback | Enhance rule-based heuristics in `summary.py` to provide tailored recommendations based on detected bottlenecks. |

---

## 🛠️ How to Run Locally (HTTPS & Multi-Device Enabled)

1. **Backend Server**:
   ```bash
   cd backend
   npm run dev
   ```
   *(Listens on `http://localhost:3001` and binds to `0.0.0.0`)*

2. **Frontend Dev Server**:
   ```bash
   cd frontend
   npm run dev
   ```
   *(Listens on `https://localhost:5173` and `https://<YOUR_WIFI_IP>:5173` with auto-proxy to backend)*

3. **Python ML Service**:
   ```bash
   cd ml-service
   python app.py
   ```
   *(Listens on `http://localhost:5001`)*

4. **MongoDB**:
   Running locally on `mongodb://localhost:27017/collab-lens`.

