# Phase 2 Demo Guide — Socket.IO Real-Time Core

> **Status:** ✅ Fully tested — light theme, End Session, multi-tab  
> **JWT auth skipped** for demo — will be added back after the presentation

---

## How to Run

### Terminal 1 — Backend
```bash
cd collab-lens/backend
npm run dev
```
You'll see:
```
🚀 CollabLens Backend (Demo Mode — No JWT)
   Local:     http://localhost:3001
   Network:   http://192.168.x.x:3001    ← your WiFi IP
```

### Terminal 2 — Frontend
```bash
cd collab-lens/frontend
npm run dev
```
You'll see:
```
  ➜  Local:   http://localhost:5173/
  ➜  Network: http://192.168.x.x:5173/   ← share this with friends
```

---

## WiFi Demo (Friend's Laptop)

> ✅ Yes, this works. Both devices just need to be on the **same WiFi network**.

### Setup
1. **Find your IP**: Look at the `Network:` line printed by both servers when they start (e.g. `192.168.1.42`)
2. **Your laptop**: Open `http://localhost:5173/`
3. **Friend's laptop**: Open `http://192.168.x.x:5173/` (replace with YOUR IP from step 1)

### How it works
- The frontend **auto-detects** your IP from the browser URL
- If your friend opens `http://192.168.1.42:5173/`, Socket.IO automatically connects to `http://192.168.1.42:3001`
- No config changes needed — it just works

### Troubleshooting
| Problem | Fix |
|---------|-----|
| Friend can't reach your IP | Make sure **Windows Firewall** allows Node.js through (it usually prompts on first run — click "Allow") |
| Still can't connect | Temporarily disable firewall, or add inbound rules for ports `3001` and `5173` |
| Multiple Network IPs shown | Use the one that matches your WiFi (usually `192.168.x.x` or `10.x.x.x`, NOT `192.168.56.x` which is VirtualBox) |

---

## Demo Script (5 minutes)

### 1. Create Room (your laptop)
- Open `http://localhost:5173/`
- Click **Create Room** → enter your name → pick 5 min timer → Create
- A **6-character room code** appears (e.g. `U5EXUW`)

### 2. Join Room (friend's laptop or second browser tab)
- Open `http://192.168.x.x:5173/` (or `localhost:5173` in another tab)
- Click **Join Room** → enter friend's name → enter the room code → Join
- Both see each other in the **lobby** participant list

### 3. Start Session (host only)
- The host clicks **Start Session** (green button, needs ≥2 people)
- Both users are redirected to the **workspace** with the chat panel

### 4. Real-time Chat
- Type messages from both devices — they appear **instantly** on both screens
- Show the synchronized timer counting down in the header
- Point out: participant avatars in the top-right corner

### 5. End Session
- Host clicks **End Session** (red button, top-right) → confirms
- Both users see **"Session Ended"** with a summary: message count, participant count, duration
- The "Back to Home" button returns to the start

---

## What You're Demonstrating

| Feature | What to say |
|---------|-------------|
| **Socket.IO rooms** | "Each collaboration session is isolated in its own room — events don't leak between rooms" |
| **Real-time messaging** | "Messages use WebSocket bi-directional communication — no polling, instant delivery" |
| **Server-driven timer** | "The timer runs on the server so all users see the exact same countdown — no client drift" |
| **Participant tracking** | "We track who joins, who leaves, and assign distinct colors for identification" |
| **Cross-device** | "Any device on the same network can participate — this scales to the full team" |

---

## What's Coming Next

| Next Phase | What gets added |
|------------|-----------------|
| Phase 1 (JWT Auth) | Proper login/register, token-based identity, session persistence in MongoDB |
| Phase 3 (Tools) | Excalidraw whiteboard + Monaco code editor, synced in real-time |
| Phase 4 (ML) | Sentiment analysis, idea clustering, contribution scoring |
| Phase 6 (Reports) | Network graphs, exploration scores, team dynamics visualization |
