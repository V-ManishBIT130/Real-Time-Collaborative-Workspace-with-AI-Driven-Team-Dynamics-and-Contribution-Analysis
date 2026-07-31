const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();

const authRoutes = require('./src/routes/auth');
const authMiddleware = require('./src/middlewares/auth');
const initializeSocket = require('./src/sockets/socketHandler');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3001;

// ============================================================
// Middleware
// ============================================================
app.use(cors());
app.use(express.json());

// ============================================================
// REST API Routes
// ============================================================
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// Auth routes (public)
app.use('/api/auth', authRoutes);

// Protected route example — room info
app.get('/api/rooms/:roomCode', authMiddleware, async (req, res) => {
  try {
    const Session = require('./src/models/Session');
    const session = await Session.findOne({
      roomCode: req.params.roomCode.toUpperCase()
    });
    if (!session) return res.status(404).json({ error: 'Room not found' });
    res.json({
      roomCode: session.roomCode,
      hostUserId: session.hostUserId,
      status: session.status,
      participantCount: session.participants.length,
      maxParticipants: session.settings.maxParticipants,
      timerDuration: session.settings.timerDuration
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ============================================================
// Socket.IO Setup
// ============================================================
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

initializeSocket(io);

// ============================================================
// MongoDB Connection + Server Start
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

async function startServer() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ MongoDB connected');

    server.listen(PORT, '0.0.0.0', () => {
      const ip = getLocalIP();
      console.log(`\n🚀 CollabLens Backend (JWT Auth Enabled)`);
      console.log(`   Local:     http://localhost:${PORT}`);
      console.log(`   Network:   http://${ip}:${PORT}`);
      console.log(`   Health:    http://localhost:${PORT}/api/health`);
      console.log(`   Auth:      http://localhost:${PORT}/api/auth/*\n`);
    });
  } catch (err) {
    console.error('❌ Failed to start server:', err.message);
    process.exit(1);
  }
}

startServer();
