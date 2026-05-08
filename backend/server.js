const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// Middleware — allow any origin for WiFi demo across devices
app.use(cors());
app.use(express.json());

// Socket.IO setup — allow any origin so friend's laptop can connect
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// ============================================================
// IN-MEMORY STORE (Demo Only — MongoDB will replace this later)
// ============================================================
const rooms = new Map();
// rooms.get(roomCode) => {
//   roomCode, hostId, hostName, status, participants[], messages[],
//   settings: { timerDuration, maxParticipants },
//   timerInterval, timerRemaining, createdAt
// }

// ============================================================
// Helper: Generate a 6-character room code
// ============================================================
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 to avoid confusion
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return rooms.has(code) ? generateRoomCode() : code;
}

// ============================================================
// Helper: Assign a distinct color to each participant
// ============================================================
const COLORS = [
  '#6366f1', // indigo
  '#f43f5e', // rose
  '#10b981', // emerald
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#ec4899', // pink
  '#84cc16', // lime
];

function getColor(index) {
  return COLORS[index % COLORS.length];
}

// ============================================================
// REST API — Health check + Room info
// ============================================================
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), rooms: rooms.size });
});

app.get('/api/rooms/:roomCode', (req, res) => {
  const room = rooms.get(req.params.roomCode.toUpperCase());
  if (!room) return res.status(404).json({ error: 'Room not found' });
  res.json({
    roomCode: room.roomCode,
    hostName: room.hostName,
    status: room.status,
    participantCount: room.participants.length,
    maxParticipants: room.settings.maxParticipants,
    timerDuration: room.settings.timerDuration
  });
});

// ============================================================
// SOCKET.IO — Real-time event handling
// ============================================================
io.on('connection', (socket) => {
  console.log(`⚡ Client connected: ${socket.id}`);

  // -----------------------------------------------------------
  // CREATE ROOM
  // -----------------------------------------------------------
  socket.on('create_room', ({ userName, timerDuration = 15, maxParticipants = 5 }, callback) => {
    if (!userName || userName.trim().length === 0) {
      return callback?.({ error: 'Username is required' });
    }

    const roomCode = generateRoomCode();
    const participant = {
      id: socket.id,
      name: userName.trim(),
      joinedAt: new Date().toISOString(),
      color: getColor(0),
      isHost: true
    };

    const room = {
      roomCode,
      hostId: socket.id,
      hostName: userName.trim(),
      status: 'waiting',
      participants: [participant],
      messages: [],
      settings: {
        timerDuration: Math.min(Math.max(timerDuration, 1), 60), // clamp 1-60 min
        maxParticipants: Math.min(Math.max(maxParticipants, 2), 8) // clamp 2-8
      },
      timerInterval: null,
      timerRemaining: null,
      createdAt: new Date().toISOString()
    };

    rooms.set(roomCode, room);
    socket.join(roomCode);
    socket.roomCode = roomCode;
    socket.userName = userName.trim();

    console.log(`🏠 Room ${roomCode} created by ${userName}`);
    callback?.({ success: true, roomCode, participant });
  });

  // -----------------------------------------------------------
  // JOIN ROOM
  // -----------------------------------------------------------
  socket.on('join_room', ({ roomCode, userName }, callback) => {
    if (!userName || userName.trim().length === 0) {
      return callback?.({ error: 'Username is required' });
    }

    const code = roomCode?.toUpperCase();
    const room = rooms.get(code);

    if (!room) return callback?.({ error: 'Room not found' });
    if (room.status !== 'waiting') return callback?.({ error: 'Session already in progress' });
    if (room.participants.length >= room.settings.maxParticipants) {
      return callback?.({ error: 'Room is full' });
    }
    if (room.participants.some(p => p.name.toLowerCase() === userName.trim().toLowerCase())) {
      return callback?.({ error: 'Username already taken in this room' });
    }

    const participant = {
      id: socket.id,
      name: userName.trim(),
      joinedAt: new Date().toISOString(),
      color: getColor(room.participants.length),
      isHost: false
    };

    room.participants.push(participant);
    socket.join(code);
    socket.roomCode = code;
    socket.userName = userName.trim();

    // Notify everyone in the room
    io.to(code).emit('participant_joined', {
      participant,
      participants: room.participants,
      participantCount: room.participants.length
    });

    console.log(`👤 ${userName} joined room ${code} (${room.participants.length}/${room.settings.maxParticipants})`);

    callback?.({
      success: true,
      roomCode: code,
      participant,
      room: {
        roomCode: code,
        hostName: room.hostName,
        status: room.status,
        participants: room.participants,
        settings: room.settings,
        messages: room.messages
      }
    });
  });

  // -----------------------------------------------------------
  // START SESSION (Host only)
  // -----------------------------------------------------------
  socket.on('start_session', (_, callback) => {
    const room = rooms.get(socket.roomCode);
    if (!room) return callback?.({ error: 'Room not found' });
    if (room.hostId !== socket.id) return callback?.({ error: 'Only the host can start' });
    if (room.status !== 'waiting') return callback?.({ error: 'Session already started' });
    if (room.participants.length < 2) return callback?.({ error: 'Need at least 2 participants' });

    room.status = 'active';
    room.startedAt = new Date().toISOString();
    room.timerRemaining = room.settings.timerDuration * 60; // seconds

    // Server-driven timer — ticks every second
    room.timerInterval = setInterval(() => {
      room.timerRemaining--;

      // Broadcast every 5 seconds to reduce traffic (or at key moments)
      if (room.timerRemaining % 5 === 0 || room.timerRemaining <= 10) {
        io.to(room.roomCode).emit('timer_tick', {
          remaining: room.timerRemaining,
          total: room.settings.timerDuration * 60
        });
      }

      // Timer ended
      if (room.timerRemaining <= 0) {
        clearInterval(room.timerInterval);
        room.status = 'completed';
        room.endedAt = new Date().toISOString();
        io.to(room.roomCode).emit('session_ended', {
          reason: 'timer',
          messageCount: room.messages.length,
          duration: room.settings.timerDuration
        });
        console.log(`⏱️ Room ${room.roomCode} session ended (timer). ${room.messages.length} messages.`);
      }
    }, 1000);

    io.to(room.roomCode).emit('session_started', {
      startedAt: room.startedAt,
      timerDuration: room.settings.timerDuration,
      timerRemaining: room.timerRemaining
    });

    console.log(`🚀 Session started in room ${room.roomCode} — ${room.settings.timerDuration} min timer`);
    callback?.({ success: true });
  });

  // -----------------------------------------------------------
  // SEND MESSAGE
  // -----------------------------------------------------------
  socket.on('send_message', ({ text }, callback) => {
    const room = rooms.get(socket.roomCode);
    if (!room) return callback?.({ error: 'Room not found' });
    if (room.status !== 'active') return callback?.({ error: 'Session not active' });
    if (!text || text.trim().length === 0) return;

    const participant = room.participants.find(p => p.id === socket.id);
    if (!participant) return callback?.({ error: 'Not a participant' });

    const message = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      userId: socket.id,
      userName: participant.name,
      userColor: participant.color,
      text: text.trim(),
      timestamp: new Date().toISOString(),
      sequenceNumber: room.messages.length + 1,
      source: 'text'
    };

    room.messages.push(message);
    io.to(room.roomCode).emit('new_message', message);

    callback?.({ success: true, messageId: message.id });
  });

  // -----------------------------------------------------------
  // END SESSION EARLY (Host only)
  // -----------------------------------------------------------
  socket.on('end_session', (_, callback) => {
    const room = rooms.get(socket.roomCode);
    if (!room) return callback?.({ error: 'Room not found' });
    if (room.hostId !== socket.id) return callback?.({ error: 'Only the host can end' });

    if (room.timerInterval) clearInterval(room.timerInterval);
    room.status = 'completed';
    room.endedAt = new Date().toISOString();

    io.to(room.roomCode).emit('session_ended', {
      reason: 'host',
      messageCount: room.messages.length,
      duration: room.settings.timerDuration
    });

    console.log(`🛑 Room ${room.roomCode} ended early by host. ${room.messages.length} messages.`);
    callback?.({ success: true });
  });

  // -----------------------------------------------------------
  // DISCONNECT
  // -----------------------------------------------------------
  socket.on('disconnect', () => {
    console.log(`💨 Client disconnected: ${socket.id} (${socket.userName || 'unknown'})`);

    const room = rooms.get(socket.roomCode);
    if (!room) return;

    // Remove participant
    room.participants = room.participants.filter(p => p.id !== socket.id);

    io.to(room.roomCode).emit('participant_left', {
      userId: socket.id,
      userName: socket.userName,
      participants: room.participants,
      participantCount: room.participants.length
    });

    // If host disconnects during waiting, close room after 2 minutes
    if (room.hostId === socket.id && room.status === 'waiting') {
      console.log(`⚠️ Host left room ${room.roomCode} — closing in 2 min if no one takes over`);
      setTimeout(() => {
        const current = rooms.get(room.roomCode);
        if (current && current.status === 'waiting') {
          io.to(room.roomCode).emit('room_closed', { reason: 'Host disconnected' });
          rooms.delete(room.roomCode);
          console.log(`🗑️ Room ${room.roomCode} deleted (host left)`);
        }
      }, 120000);
    }

    // If no one left, clean up
    if (room.participants.length === 0) {
      if (room.timerInterval) clearInterval(room.timerInterval);
      rooms.delete(room.roomCode);
      console.log(`🗑️ Room ${room.roomCode} deleted (empty)`);
    }
  });
});

// ============================================================
// Helper: Get local network IP
// ============================================================
function getLocalIP() {
  const os = require('os');
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return 'localhost';
}

// ============================================================
// START SERVER — bind to 0.0.0.0 for network access
// ============================================================
server.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIP();
  console.log(`\n🚀 CollabLens Backend (Demo Mode — No JWT)`);
  console.log(`   Local:     http://localhost:${PORT}`);
  console.log(`   Network:   http://${ip}:${PORT}`);
  console.log(`   Health:    http://localhost:${PORT}/api/health\n`);
});
