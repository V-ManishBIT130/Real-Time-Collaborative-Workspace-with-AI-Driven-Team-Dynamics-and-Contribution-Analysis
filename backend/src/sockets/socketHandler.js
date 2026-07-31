const jwt = require('jsonwebtoken');
const Session = require('../models/Session');
const Message = require('../models/Message');

// ============================================================
// IN-MEMORY STORE (Hybrid: in-memory for speed + MongoDB for persistence)
// ============================================================
const rooms = new Map();

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
// Socket.IO Handler — JWT-authenticated connections
// ============================================================
module.exports = function initializeSocket(io) {

  // ─────────────────────────────────────────────
  // JWT Auth Middleware for Socket.IO
  // ─────────────────────────────────────────────
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('Authentication error: No token provided'));
    }
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = {
        id: decoded.id,
        name: decoded.name,
        email: decoded.email
      };
      next();
    } catch (err) {
      return next(new Error('Authentication error: Invalid token'));
    }
  });

  // ─────────────────────────────────────────────
  // Connection handler
  // ─────────────────────────────────────────────
  io.on('connection', (socket) => {
    console.log(`⚡ Client connected: ${socket.id} (${socket.user.name})`);

    // -----------------------------------------------------------
    // CREATE ROOM
    // -----------------------------------------------------------
    socket.on('create_room', async ({ timerDuration = 15, maxParticipants = 5 }, callback) => {
      try {
        const roomCode = generateRoomCode();
        const participant = {
          id: socket.user.id,     // MongoDB _id
          socketId: socket.id,    // current socket connection
          name: socket.user.name,
          joinedAt: new Date().toISOString(),
          color: getColor(0),
          isHost: true
        };

        const room = {
          roomCode,
          hostId: socket.user.id,
          hostName: socket.user.name,
          status: 'waiting',
          participants: [participant],
          messages: [],
          settings: {
            timerDuration: Math.min(Math.max(timerDuration, 1), 60),
            maxParticipants: Math.min(Math.max(maxParticipants, 2), 8)
          },
          timerInterval: null,
          timerRemaining: null,
          sessionDbId: null,  // will hold MongoDB Session._id
          createdAt: new Date().toISOString()
        };

        // Save to MongoDB
        const dbSession = await Session.create({
          roomCode,
          hostUserId: socket.user.id,
          participants: [{
            userId: socket.user.id,
            name: socket.user.name,
            joinedAt: new Date(),
            color: getColor(0),
            isHost: true
          }],
          settings: {
            timerDuration: room.settings.timerDuration,
            maxParticipants: room.settings.maxParticipants
          },
          status: 'waiting'
        });

        room.sessionDbId = dbSession._id;
        rooms.set(roomCode, room);
        socket.join(roomCode);
        socket.roomCode = roomCode;

        console.log(`🏠 Room ${roomCode} created by ${socket.user.name}`);

        callback?.({
          success: true,
          roomCode,
          participant: {
            id: participant.id,
            name: participant.name,
            joinedAt: participant.joinedAt,
            color: participant.color,
            isHost: participant.isHost
          }
        });
      } catch (err) {
        console.error('Create room error:', err.message);
        callback?.({ error: 'Failed to create room. Please try again.' });
      }
    });

    // -----------------------------------------------------------
    // JOIN ROOM
    // -----------------------------------------------------------
    socket.on('join_room', async ({ roomCode }, callback) => {
      try {
        const code = roomCode?.toUpperCase();
        const room = rooms.get(code);

        if (!room) return callback?.({ error: 'Room not found' });
        if (room.status !== 'waiting') return callback?.({ error: 'Session already in progress' });
        if (room.participants.length >= room.settings.maxParticipants) {
          return callback?.({ error: 'Room is full' });
        }
        // Check if same user already in the room
        if (room.participants.some(p => p.id === socket.user.id)) {
          return callback?.({ error: 'You are already in this room' });
        }

        const participant = {
          id: socket.user.id,
          socketId: socket.id,
          name: socket.user.name,
          joinedAt: new Date().toISOString(),
          color: getColor(room.participants.length),
          isHost: false
        };

        room.participants.push(participant);
        socket.join(code);
        socket.roomCode = code;

        // Update MongoDB session
        await Session.findByIdAndUpdate(room.sessionDbId, {
          $push: {
            participants: {
              userId: socket.user.id,
              name: socket.user.name,
              joinedAt: new Date(),
              color: participant.color,
              isHost: false
            }
          }
        });

        // Build safe participant list (no socketId leaking)
        const safeParticipants = room.participants.map(p => ({
          id: p.id, name: p.name, joinedAt: p.joinedAt, color: p.color, isHost: p.isHost
        }));

        // Notify everyone in the room
        io.to(code).emit('participant_joined', {
          participant: {
            id: participant.id, name: participant.name,
            joinedAt: participant.joinedAt, color: participant.color, isHost: participant.isHost
          },
          participants: safeParticipants,
          participantCount: room.participants.length
        });

        console.log(`👤 ${socket.user.name} joined room ${code} (${room.participants.length}/${room.settings.maxParticipants})`);

        callback?.({
          success: true,
          roomCode: code,
          participant: {
            id: participant.id, name: participant.name,
            joinedAt: participant.joinedAt, color: participant.color, isHost: participant.isHost
          },
          room: {
            roomCode: code,
            hostName: room.hostName,
            status: room.status,
            participants: safeParticipants,
            settings: room.settings,
            messages: room.messages
          }
        });
      } catch (err) {
        console.error('Join room error:', err.message);
        callback?.({ error: 'Failed to join room. Please try again.' });
      }
    });

    // -----------------------------------------------------------
    // START SESSION (Host only)
    // -----------------------------------------------------------
    socket.on('start_session', async (_, callback) => {
      try {
        const room = rooms.get(socket.roomCode);
        if (!room) return callback?.({ error: 'Room not found' });
        if (room.hostId !== socket.user.id) return callback?.({ error: 'Only the host can start' });
        if (room.status !== 'waiting') return callback?.({ error: 'Session already started' });
        if (room.participants.length < 2) return callback?.({ error: 'Need at least 2 participants' });

        room.status = 'active';
        room.startedAt = new Date().toISOString();
        room.timerRemaining = room.settings.timerDuration * 60; // seconds

        // Update MongoDB
        await Session.findByIdAndUpdate(room.sessionDbId, {
          status: 'active',
          startedAt: new Date()
        });

        // Server-driven timer — ticks every second
        room.timerInterval = setInterval(async () => {
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

            // Update MongoDB
            await Session.findByIdAndUpdate(room.sessionDbId, {
              status: 'completed',
              endedAt: new Date()
            });

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
      } catch (err) {
        console.error('Start session error:', err.message);
        callback?.({ error: 'Failed to start session.' });
      }
    });

    // -----------------------------------------------------------
    // SEND MESSAGE
    // -----------------------------------------------------------
    socket.on('send_message', async ({ text, source }, callback) => {
      try {
        const room = rooms.get(socket.roomCode);
        if (!room) return callback?.({ error: 'Room not found' });
        if (room.status !== 'active') return callback?.({ error: 'Session not active' });
        if (!text || text.trim().length === 0) return;

        const participant = room.participants.find(p => p.id === socket.user.id);
        if (!participant) return callback?.({ error: 'Not a participant' });

        const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
        const sequenceNumber = room.messages.length + 1;

        const message = {
          id: messageId,
          userId: socket.user.id,
          userName: participant.name,
          userColor: participant.color,
          text: text.trim(),
          timestamp: new Date().toISOString(),
          sequenceNumber,
          source: source || 'text'
        };

        room.messages.push(message);
        io.to(room.roomCode).emit('new_message', message);

        // Persist to MongoDB (non-blocking)
        Message.create({
          sessionId: room.sessionDbId,
          roomCode: room.roomCode,
          userId: socket.user.id,
          userName: participant.name,
          userColor: participant.color,
          text: text.trim(),
          timestamp: new Date(),
          sequenceNumber,
          source: source || 'text'
        }).catch(err => console.error('Message persist error:', err.message));

        callback?.({ success: true, messageId });
      } catch (err) {
        console.error('Send message error:', err.message);
        callback?.({ error: 'Failed to send message.' });
      }
    });

    // -----------------------------------------------------------
    // END SESSION EARLY (Host only)
    // -----------------------------------------------------------
    socket.on('end_session', async (_, callback) => {
      try {
        const room = rooms.get(socket.roomCode);
        if (!room) return callback?.({ error: 'Room not found' });
        if (room.hostId !== socket.user.id) return callback?.({ error: 'Only the host can end' });

        if (room.timerInterval) clearInterval(room.timerInterval);
        room.status = 'completed';
        room.endedAt = new Date().toISOString();

        // Update MongoDB
        await Session.findByIdAndUpdate(room.sessionDbId, {
          status: 'completed',
          endedAt: new Date()
        });

        io.to(room.roomCode).emit('session_ended', {
          reason: 'host',
          messageCount: room.messages.length,
          duration: room.settings.timerDuration
        });

        console.log(`🛑 Room ${room.roomCode} ended early by host. ${room.messages.length} messages.`);
        callback?.({ success: true });
      } catch (err) {
        console.error('End session error:', err.message);
        callback?.({ error: 'Failed to end session.' });
      }
    });

    // -----------------------------------------------------------
    // LEAVE ROOM
    // -----------------------------------------------------------
    socket.on('leave_room', async (_, callback) => {
      try {
        const room = rooms.get(socket.roomCode);
        if (room) {
          console.log(`🚪 ${socket.user.name} left room ${socket.roomCode}`);
          
          room.participants = room.participants.filter(p => p.id !== socket.user.id && p.socketId !== socket.id);

          const safeParticipants = room.participants.map(p => ({
            id: p.id, name: p.name, joinedAt: p.joinedAt, color: p.color, isHost: p.isHost
          }));

          io.to(socket.roomCode).emit('participant_left', {
            userId: socket.user.id,
            userName: socket.user.name,
            participants: safeParticipants,
            participantCount: room.participants.length
          });

          socket.leave(socket.roomCode);
          socket.roomCode = null;
        }
        callback?.({ success: true });
      } catch (err) {
        console.error('Leave room error:', err.message);
        callback?.({ error: 'Failed to leave room.' });
      }
    });

    // -----------------------------------------------------------
    // DISCONNECT
    // -----------------------------------------------------------
    socket.on('disconnect', async () => {
      console.log(`💨 Client disconnected: ${socket.id} (${socket.user?.name || 'unknown'})`);

      const room = rooms.get(socket.roomCode);
      if (!room) return;

      // Remove participant by user ID or socket ID
      room.participants = room.participants.filter(p => p.id !== socket.user?.id && p.socketId !== socket.id);

      const safeParticipants = room.participants.map(p => ({
        id: p.id, name: p.name, joinedAt: p.joinedAt, color: p.color, isHost: p.isHost
      }));

      io.to(room.roomCode).emit('participant_left', {
        userId: socket.user?.id,
        userName: socket.user?.name,
        participants: safeParticipants,
        participantCount: room.participants.length
      });

      // If host disconnects during waiting, close room after 2 minutes
      if (room.hostId === socket.user?.id && room.status === 'waiting') {
        console.log(`⚠️ Host left room ${room.roomCode} — closing in 2 min if no one takes over`);
        setTimeout(async () => {
          const current = rooms.get(room.roomCode);
          if (current && current.status === 'waiting') {
            io.to(room.roomCode).emit('room_closed', { reason: 'Host disconnected' });

            // Update MongoDB
            await Session.findByIdAndUpdate(current.sessionDbId, { status: 'cancelled' })
              .catch(err => console.error('Cancel session error:', err.message));

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

  // ─────────────────────────────────────────────
  // Zombie room cleanup — every 5 minutes
  // ─────────────────────────────────────────────
  setInterval(async () => {
    const now = Date.now();
    for (const [code, room] of rooms) {
      const ageMinutes = (now - new Date(room.createdAt).getTime()) / 60000;
      if (room.status === 'waiting' && ageMinutes > 30) {
        io.to(code).emit('room_closed', { reason: 'Room expired' });
        await Session.findByIdAndUpdate(room.sessionDbId, { status: 'cancelled' })
          .catch(err => console.error('Cleanup error:', err.message));
        rooms.delete(code);
        console.log(`🗑️ Zombie room ${code} cleaned up (${Math.round(ageMinutes)} min old)`);
      }
    }
  }, 300000);

  return io;
};
