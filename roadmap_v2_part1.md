# CollabLens — Corrected Developer Roadmap (v2)

> Reviewed and corrected from Draft 1. Every change is marked with
> `[CORRECTION]` and reasoning. This is the authoritative build plan.

---

## ARCHITECTURE OVERVIEW (Unchanged — Draft 1 Got This Right)

```
┌─────────────────┐     HTTP + Socket.IO     ┌─────────────────────┐
│   FRONTEND       │ ◄──────────────────────► │   BACKEND (Node.js)  │
│   React (5173)   │                           │   Express (3001)     │
└─────────────────┘                           └─────────┬───────────┘
                                                        │ REST
                                              ┌─────────▼───────────┐
                                              │   ML SERVICE (5000)  │
                                              │   Python Flask       │
                                              └─────────────────────┘
```

> `[CORRECTION]` Ports fixed to match Context Document: Frontend=5173, Backend=3001, ML=5000.
> Draft 1 had Backend=5000 and ML=8000 which contradicts Section 7 of Context Doc.

---

## TECH STACK — Corrected

### Frontend

| Technology | Purpose | Why |
|---|---|---|
| **React 18 + Vite** | UI + build | Fast HMR, industry standard |
| **Vanilla CSS / CSS Modules** | Styling | `[CORRECTION]` Tailwind removed — conflicts with Excalidraw/Monaco built-in styles, clutters JSX. CSS Modules give scoped styles without build complexity. |
| **Socket.IO Client** | Real-time | Auto-reconnect, matches backend |
| **Excalidraw** (pin version) | Whiteboard | `[CORRECTION]` Pin exact version — breaking changes between minors |
| **Monaco Editor** | Code editor | VS Code engine, React wrapper available |
| **Recharts** | Report charts | Simple React integration |
| **react-force-graph** | Network viz | Force-directed graph for communication network |
| **React Router v6** | Navigation | Standard |
| **Zustand** | State management | Lighter than Redux, sufficient for this scope |

### Backend (Node.js)

| Technology | Purpose | Notes |
|---|---|---|
| **Express + Socket.IO** | Server + real-time | Battle-tested, rooms built-in |
| **Mongoose** | MongoDB ODM | Schema validation |
| **jsonwebtoken + bcrypt** | Auth | `[CORRECTION]` Auth is Phase 2, not optional Phase 7. JWT needed from day one. |
| **dotenv, cors** | Config, CORS | `[CORRECTION]` CORS must specify exact origins, not `*` |

### ML Service (Python)

| Technology | Purpose | Notes |
|---|---|---|
| **Flask + flask-cors** | API | Lightweight, one endpoint |
| **sentence-transformers** | Embeddings | `all-MiniLM-L6-v2` (~80MB) |
| **transformers** | Zero-shot + sentiment | `[CORRECTION]` Use `valhalla/distilbart-mnli-12-3` (~500MB), NOT `facebook/bart-large-mnli` (1.6GB). Draft 1 picked the wrong model — 3x heavier, 3x slower on CPU. Context Doc Section 18 specifies distilbart. |
| **scikit-learn** | DBSCAN | Standard |
| **NetworkX** | Graph analysis | Standard |
| **numpy, scipy, TextBlob** | Math, entropy, fallback sentiment | Standard |

### Database

**MongoDB Atlas** (free tier) — Document store fits nested report JSON. But:

> `[CORRECTION]` Use **separate collections** (sessions, messages, whiteboardEvents, editorEvents, reports)
> as specified in Context Doc Section 15. Draft 1 embedded everything inside one Session document.
> This would hit MongoDB's 16MB BSON limit on heavy sessions and prevent per-message indexing.

---

## FOLDER STRUCTURE — Corrected

```
collab-lens/
├── contracts.md              ← [ADDED] Data contracts between all 3 services
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/            (Home, Lobby, Workspace, Report, History)
│   │   ├── hooks/            (useSocket, useVoice, useAuth)
│   │   ├── store/            (Zustand)
│   │   ├── styles/           [ADDED] CSS Modules
│   │   └── utils/
│   ├── package.json
│   └── vite.config.js
│
├── backend/
│   ├── src/
│   │   ├── routes/
│   │   ├── models/           (Mongoose schemas — separate per collection)
│   │   ├── middleware/       [ADDED] auth middleware (JWT verification)
│   │   ├── sockets/
│   │   └── services/
│   ├── package.json
│   └── server.js
│
├── ml-service/
│   ├── app.py
│   ├── modules/
│   │   ├── embeddings.py
│   │   ├── classifier.py
│   │   ├── sentiment.py
│   │   ├── clustering.py
│   │   ├── network.py
│   │   ├── stuck_detection.py
│   │   ├── exploration.py
│   │   └── report_builder.py [ADDED] summary/insight generation
│   ├── requirements.txt
│   └── models/
│
├── seed/                     [ADDED] Test data for ML pipeline
│   ├── balanced_team.json
│   ├── one_dominant.json
│   ├── stuck_then_recovered.json
│   └── highly_exploratory.json
│
└── README.md
```

> `[CORRECTION]` Added: `contracts.md`, `seed/` directory, `middleware/` for auth,
> `styles/` for CSS Modules, `report_builder.py`. Draft 1 had no test data strategy
> and no auth middleware structure.

---

## PHASE 0 — Foundation (Week 1)

Same as Draft 1 with these corrections:

**Step 1: Install prerequisites** — unchanged.

**Step 2: Initialize frontend**
```bash
cd collab-lens
npm create vite@latest frontend -- --template react
cd frontend

Install React 18 explicitly
npm install react@18.3.1 react-dom@18.3.1

Install your dependencies
npm install socket.io-client react-router-dom zustand recharts react-force-graph @monaco-editor/react

Install Excalidraw pinned version
npm install @excalidraw/excalidraw@0.17.0
```
> `[CORRECTION]` No Tailwind install. No `npx tailwindcss init`.

**Step 3: Initialize backend**
```bash
cd ../backend
npm init -y
npm install express socket.io mongoose dotenv cors jsonwebtoken bcrypt
npm install --save-dev nodemon
```
> `[CORRECTION]` Added `jsonwebtoken` and `bcrypt` — auth is Phase 2, not Phase 7.

**Step 4: Initialize ML service**
```bash
cd ../ml-service
python -m venv venv
venv\Scripts\activate

#for cpu
pip install torch --index-url https://download.pytorch.org/whl/cpu
#or
#for gpu of 8gb vram, rtx 4060 i have
pip install torch --index-url https://download.pytorch.org/whl/cu121
python -c "import torch; print(torch.__version__, torch.cuda.is_available())"


pip install flask flask-cors sentence-transformers transformers scikit-learn networkx numpy scipy textblob
pip freeze > requirements.txt
```
> `[CORRECTION]` CPU-only torch installed FIRST to avoid pulling the 2GB GPU version.

**Step 5: Environment files**
```
# backend/.env
MONGO_URI=mongodb+srv://...
PORT=3001
ML_SERVICE_URL=http://localhost:5000
JWT_SECRET=your-secret-key

# frontend/.env
VITE_BACKEND_URL=http://localhost:3001

# ml-service/.env
PORT=5000
```
> `[CORRECTION]` Ports match Context Doc. JWT_SECRET added. Draft 1 had wrong ports.

**Step 6: Write `contracts.md`** — `[ADDED]`

> Draft 1 mentioned this as a side note. It is a **Phase 0 deliverable**.
> Define exact JSON shapes for every Socket.IO event and API endpoint
> BEFORE writing any application code. This prevents integration nightmares.

**Step 7: Create seed data** — `[ADDED]`

> Create 3-5 synthetic session JSONs with 30-80 messages each.
> You cannot test the ML pipeline without this. Draft 1 had zero test data strategy.

---

## PHASE 1 — Auth + Database (Week 1-2)

> `[CORRECTION]` Draft 1 put Auth at Phase 7 (optional). This is wrong.
> Without auth, every Socket.IO connection has no verified identity.
> userId is a random string — anyone can impersonate anyone.
> Session history requires persistent user identity.
> Retrofitting auth later means rewriting every API endpoint and socket handler.
> **Build it first.**

**User Model (Mongoose):**
```javascript
// models/User.js
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true }, // bcrypt hashed
  createdAt: { type: Date, default: Date.now }
});
```

**Auth Routes:**
```
POST /api/auth/register → { token, user }
POST /api/auth/login    → { token, user }
GET  /api/auth/me       → { user }  (token required)
```

**JWT Middleware:**
```javascript
// middleware/auth.js
const jwt = require('jsonwebtoken');
module.exports = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};
```

**Database Schemas (Separate Collections — Per Context Doc Section 15):**

> `[CORRECTION]` Draft 1 embedded messages inside Session. This causes:
> - 16MB BSON limit hit on heavy sessions
> - Write contention on every message
> - No per-message indexing possible

```javascript
// models/Session.js — NO embedded messages
const sessionSchema = new mongoose.Schema({
  roomCode: { type: String, unique: true },
  hostUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  problemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Problem' },
  participants: [{ userId: ObjectId, name: String, joinedAt: Date, color: String }],
  settings: { timerDuration: Number, maxParticipants: { type: Number, default: 5 } },
  status: { type: String, enum: ['waiting', 'active', 'completed'], default: 'waiting' },
  startedAt: Date,
  endedAt: Date,
  createdAt: { type: Date, default: Date.now }
});

// models/Message.js — SEPARATE collection
const messageSchema = new mongoose.Schema({
  sessionId: { type: ObjectId, ref: 'Session', index: true },
  roomCode: String,
  userId: { type: ObjectId, ref: 'User' },
  userName: String,
  text: String,
  timestamp: { type: Date, default: Date.now },
  sequenceNumber: Number,
  source: { type: String, enum: ['text', 'voice'], default: 'text' }
});
messageSchema.index({ sessionId: 1, timestamp: 1 });

// models/Report.js — SEPARATE collection
const reportSchema = new mongoose.Schema({
  sessionId: { type: ObjectId, ref: 'Session', unique: true },
  generatedAt: Date,
  contributions: Object,
  ideaClusters: [Object],
  explorationScore: Number,
  communicationNetwork: Object,
  stuckPeriods: [Object],
  timeline: [Object],
  overallScore: Number,
  insights: Object
});
```

---

## PHASE 2 — Real-Time Core (Week 2-3)

This phase is largely the same as Draft 1's Phase 1, with corrections:

**Socket.IO Events** — unchanged from Draft 1 but with auth:

```javascript
// Socket.IO connection with JWT auth
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  try {
    socket.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    next(new Error('Authentication error'));
  }
});
```

> `[CORRECTION]` Draft 1 had no socket authentication. Any client could emit
> events as any userId. This is a security hole.

**Message saving — write to separate collection:**
```javascript
socket.on('send_message', async ({ roomCode, text, source }) => {
  const message = await Message.create({
    sessionId: socket.sessionId,
    roomCode,
    userId: socket.user.id,
    userName: socket.user.name,
    text,
    source: source || 'text',
    timestamp: new Date(),
    sequenceNumber: await Message.countDocuments({ sessionId: socket.sessionId }) + 1
  });
  io.to(roomCode).emit('new_message', message);
});
```

**Timer** — server-driven, unchanged. Draft 1 got this right.

**Error handling for disconnections** — `[ADDED]`:

> `[CORRECTION]` Draft 1 had ZERO error handling. Disconnection in a real-time
> app is a certainty, not an edge case.

```javascript
socket.on('disconnect', async () => {
  const session = await Session.findOne({ roomCode: socket.roomCode });
  if (!session) return;
  
  io.to(socket.roomCode).emit('participant_left', {
    userId: socket.user.id,
    userName: socket.user.name
  });
  
  // If host disconnects during 'waiting', close room after 2 min
  if (session.hostUserId.equals(socket.user.id) && session.status === 'waiting') {
    setTimeout(async () => {
      const current = await Session.findOne({ roomCode: socket.roomCode });
      if (current?.status === 'waiting') {
        current.status = 'cancelled';
        await current.save();
        io.to(socket.roomCode).emit('room_closed', { reason: 'Host disconnected' });
      }
    }, 120000);
  }
});
```

**Milestone:** 4 people join a room with authenticated identities, chat in real-time, timer counts down, messages saved to separate MongoDB collection.

---

## PHASE 3 — Workspace Tools (Week 3-4)

Whiteboard (Excalidraw) and Code Editor (Monaco). Same as Draft 1 with corrections:

**Excalidraw:**
```javascript
// Pin the version in package.json!
"@excalidraw/excalidraw": "0.17.0"  // exact version, no ^ or ~
```

> `[CORRECTION]` Excalidraw has breaking changes between minor versions.
> Draft 1 didn't mention version pinning.

**Monaco Editor** — unchanged from Draft 1. Debounce at 300ms. Last-write-wins.

**Workspace layout** — use CSS Grid for the 3-panel layout:
```css
/* styles/Workspace.module.css */
.workspace {
  display: grid;
  grid-template-columns: 320px 1fr;
  grid-template-rows: 48px 1fr;
  height: 100vh;
  gap: 1px;
  background: var(--border-color);
}
.header { grid-column: 1 / -1; }
.chat { grid-row: 2; overflow-y: auto; }
.main { grid-row: 2; /* tabs for whiteboard/editor */ }
```

> `[CORRECTION]` Draft 1 used Tailwind for layout. For a complex multi-panel
> workspace with embedded third-party components, CSS Grid with modules
> gives precise control without class name conflicts.

**Milestone:** Full workspace with chat + whiteboard + code editor, all syncing in real-time.
