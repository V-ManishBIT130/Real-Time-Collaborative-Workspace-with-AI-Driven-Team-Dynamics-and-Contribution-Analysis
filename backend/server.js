const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();

const authRoutes = require('./src/routes/auth');
const authMiddleware = require('./src/middlewares/auth');
const initializeSocket = require('./src/sockets/socketHandler');
const Report = require('./src/models/Report');
const Session = require('./src/models/Session');
const { checkMLHealth, retryAnalysis } = require('./src/services/analysisService');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3001;
const configuredOrigins = (process.env.CORS_ORIGINS || process.env.FRONTEND_URL || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);
const allowAllOrigins = configuredOrigins.includes('*');
const isQuickTunnelOrigin = (origin) => /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/i.test(origin || '');

// Same-origin production traffic does not need CORS. This allow-list exists for
// local Vite development or deliberately split frontend/backend deployments.
const corsOptions = {
  origin(origin, callback) {
    if (!origin || isQuickTunnelOrigin(origin) || allowAllOrigins || configuredOrigins.length === 0 || configuredOrigins.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error(`Origin ${origin} is not allowed`));
  },
  methods: ['GET', 'POST'],
  credentials: true
};

// ============================================================
// Middleware
// ============================================================
app.set('trust proxy', 1);
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' })); // Larger limit for report data

// ============================================================
// REST API Routes
// ============================================================
app.get('/api/health', async (req, res) => {
  const mlHealth = await checkMLHealth();
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    mlService: mlHealth
  });
});

// Auth routes (public)
app.use('/api/auth', authRoutes);

// Return short-lived TURN credentials to authenticated clients. The shared
// secret stays on the server; browsers never receive a reusable relay password.
app.get('/api/webrtc/ice-servers', authMiddleware, (req, res) => {
  const turnUrls = (process.env.TURN_URLS || '')
    .split(',')
    .map(url => url.trim())
    .filter(Boolean);

  const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:global.stun.twilio.com:3478' },
    { urls: 'stun:stun.services.mozilla.com' },
  ];

  if (turnUrls.length > 0 && process.env.TURN_SHARED_SECRET) {
    const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60;
    const username = `${expiresAt}:${req.user.id}`;
    const credential = crypto
      .createHmac('sha1', process.env.TURN_SHARED_SECRET)
      .update(username)
      .digest('base64');
    iceServers.push({ urls: turnUrls, username, credential });
  } else if (turnUrls.length > 0 && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
    iceServers.push({
      urls: turnUrls,
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_CREDENTIAL
    });
  } else {
    // Default open relay fallback for testing environments
    iceServers.push({
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp',
      ],
      username: 'openrelay',
      credential: 'openrelay',
    });
  }

  res.json({ iceServers });
});

// Protected route — room info
app.get('/api/rooms/:roomCode', authMiddleware, async (req, res) => {
  try {
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
// Report & Analysis Endpoints
// ============================================================

// GET /api/sessions/:sessionId/report — Fetch analysis report
app.get('/api/sessions/:sessionId/report', authMiddleware, async (req, res) => {
  try {
    const report = await Report.findOne({ sessionId: req.params.sessionId });
    if (!report) {
      // Check if session exists and is pending analysis
      const session = await Session.findById(req.params.sessionId);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }
      if (session.status === 'analysis_pending') {
        return res.status(202).json({
          status: 'analysis_pending',
          message: 'Analysis is pending. You can retry.',
          canRetry: true
        });
      }
      if (session.status === 'active') {
        return res.status(202).json({
          status: 'in_progress',
          message: 'Session is still active.'
        });
      }
      return res.status(404).json({ error: 'Report not yet generated' });
    }
    res.json(report);
  } catch (err) {
    console.error('Fetch report error:', err.message);
    res.status(500).json({ error: 'Failed to fetch report' });
  }
});

// POST /api/sessions/:sessionId/retry-analysis — Retry failed analysis
app.post('/api/sessions/:sessionId/retry-analysis', authMiddleware, async (req, res) => {
  try {
    const result = await retryAnalysis(req.params.sessionId, io);
    res.json(result);
  } catch (err) {
    console.error('Retry analysis error:', err.message);
    res.status(400).json({ error: err.message });
  }
});

// GET /api/ml/health — Check ML service health
app.get('/api/ml/health', async (req, res) => {
  const health = await checkMLHealth();
  res.json(health);
});

// ============================================================
// Static Frontend Serving (Built Assets)
// ============================================================
const path = require('path');
const fs = require('fs');
const frontendDist = path.join(__dirname, '../frontend/dist');

if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  // SPA Fallback: for any non-API GET request, serve index.html
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/socket.io')) {
      return res.sendFile(path.join(frontendDist, 'index.html'));
    }
    next();
  });
}

// ============================================================
// Socket.IO Setup
// ============================================================
const io = new Server(server, {
  cors: corsOptions
});

initializeSocket(io);

// ============================================================
// MongoDB Connection + Server Start
// ============================================================
function getLocalIP() {
  const os = require('os');
  const interfaces = os.networkInterfaces();
  const candidates = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        // Skip common virtual/host-only adapter subnets like 192.168.56.x (VirtualBox)
        if (!iface.address.startsWith('192.168.56.')) {
          candidates.unshift(iface.address);
        } else {
          candidates.push(iface.address);
        }
      }
    }
  }
  return candidates[0] || 'localhost';
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
