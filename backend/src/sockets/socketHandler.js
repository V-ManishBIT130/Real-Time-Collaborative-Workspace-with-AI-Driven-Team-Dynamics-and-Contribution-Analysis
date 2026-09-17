const jwt = require('jsonwebtoken');
const Session = require('../models/Session');
const Message = require('../models/Message');
const WhiteboardEvent = require('../models/WhiteboardEvent');
const EditorEvent = require('../models/EditorEvent');
const { analyzeSession } = require('../services/analysisService');

// ============================================================
// IN-MEMORY STORE (Hybrid: in-memory for speed + MongoDB for persistence)
// ============================================================
const rooms = new Map();

// Track which userId is currently connected (for duplicate tab prevention)
const activeUserSockets = new Map(); // userId -> socketId

// Track disconnect grace period timeouts
const disconnectTimers = new Map(); // `${roomCode}:${userId}` -> timeoutId

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
// Helper: Build safe participant list (no socketId leaking)
// ============================================================
function getSafeParticipants(room) {
  return room.participants.map(p => ({
    id: p.id, name: p.name, joinedAt: p.joinedAt,
    color: p.color, isHost: p.isHost
  }));
}

// ============================================================
// Helper: Find room by userId (for duplicate tab check)
// ============================================================
function findRoomByUserId(userId) {
  for (const [code, room] of rooms) {
    // Skip completed/ended rooms — users should be able to start new sessions
    if (room.status === 'completed') continue;
    if (room.participants.some(p => p.id === userId)) {
      return { code, room };
    }
  }
  return null;
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
    // CHECK: Is this a reconnection within grace period?
    // -----------------------------------------------------------
    // Look for any room where this user has a pending disconnect timer
    for (const [key, timeoutId] of disconnectTimers) {
      const [roomCode, userId] = key.split(':');
      if (userId === socket.user.id) {
        const room = rooms.get(roomCode);
        if (room) {
          // Cancel the disconnect timer — user is back!
          clearTimeout(timeoutId);
          disconnectTimers.delete(key);

          // Update the participant's socketId to the new connection
          const participant = room.participants.find(p => p.id === socket.user.id);
          if (participant) {
            participant.socketId = socket.id;
            socket.join(roomCode);
            socket.roomCode = roomCode;
            activeUserSockets.set(socket.user.id, socket.id);

            console.log(`🔄 ${socket.user.name} reconnected to room ${roomCode} (grace period)`);

            // Send them the current state so they're up to date
            socket.emit('reconnected', {
              roomCode,
              participants: getSafeParticipants(room),
              messages: room.messages,
              settings: room.settings,
              status: room.status,
              timerRemaining: room.timerRemaining,
              timerTotal: room.settings.timerDuration * 60,
              whiteboardElements: room.whiteboardElements || [],
              codeContent: room.codeContent || '',
              codeLanguage: room.codeLanguage || 'javascript',
              problemText: room.problemText || ''
            });
            return; // Don't process further — they're already reconnected
          }
        }
      }
    }

    // Register active socket for this user
    activeUserSockets.set(socket.user.id, socket.id);

    // -----------------------------------------------------------
    // CREATE ROOM
    // -----------------------------------------------------------
    socket.on('create_room', async ({ timerDuration = 15, maxParticipants = 5, problemText = '', topic = '' }, callback) => {
      try {
        // Duplicate tab prevention
        const existing = findRoomByUserId(socket.user.id);
        if (existing) {
          return callback?.({ error: 'You already have an active session in another tab. Close it first.' });
        }

        const roomCode = generateRoomCode();
        const participant = {
          id: socket.user.id,
          socketId: socket.id,
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
          pastParticipants: [],   // Tracks users who were in the room but left
          pendingKnocks: [],      // Tracks users waiting for host admission
          messages: [],
          settings: {
            timerDuration: Math.min(Math.max(timerDuration, 1), 60),
            maxParticipants: Math.min(Math.max(maxParticipants, 2), 8)
          },
          timerInterval: null,
          timerRemaining: null,
          sessionDbId: null,
          createdAt: new Date().toISOString(),
          // Workspace tool state (for sync)
          whiteboardElements: [],
          codeContent: '',
          codeLanguage: 'markdown',
          problemText: problemText,
          topic: (topic || '').slice(0, 200),
          // Throttle counters for persistence
          whiteboardPersistCounter: 0
        };

        // Save to MongoDB
        const dbSession = await Session.create({
          roomCode,
          topic: room.topic,
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
    // JOIN ROOM (with rejoin support)
    // -----------------------------------------------------------
    socket.on('join_room', async ({ roomCode }, callback) => {
      try {
        const code = roomCode?.toUpperCase();
        const room = rooms.get(code);

        if (!room) return callback?.({ error: 'Room not found' });

        // Duplicate tab prevention
        const existing = findRoomByUserId(socket.user.id);
        if (existing && existing.code !== code) {
          return callback?.({ error: 'You already have an active session in another tab. Close it first.' });
        }

        // Check if user is already an active participant in this room
        const alreadyIn = room.participants.find(p => p.id === socket.user.id);
        if (alreadyIn) {
          // Update their socketId (reconnection scenario)
          alreadyIn.socketId = socket.id;
          socket.join(code);
          socket.roomCode = code;

          // Send full state sync
          return callback?.({
            success: true,
            roomCode: code,
            participant: {
              id: alreadyIn.id, name: alreadyIn.name,
              joinedAt: alreadyIn.joinedAt, color: alreadyIn.color, isHost: alreadyIn.isHost
            },
            room: {
              roomCode: code,
              hostName: room.hostName,
              status: room.status,
              participants: getSafeParticipants(room),
              settings: room.settings,
              messages: room.messages,
              whiteboardElements: room.whiteboardElements || [],
              codeContent: room.codeContent || '',
              codeLanguage: room.codeLanguage || 'markdown',
              problemText: room.problemText || '',
              topic: room.topic || '',
              timerRemaining: room.timerRemaining,
              timerTotal: room.settings.timerDuration * 60
            }
          });
        }

        // ── WAITING STATUS: Direct join ──
        if (room.status === 'waiting') {
          if (room.participants.length >= room.settings.maxParticipants) {
            return callback?.({ error: 'Room is full' });
          }

          // Check if this was a past participant — restore their color
          const pastEntry = room.pastParticipants.find(p => p.id === socket.user.id);
          const colorIndex = pastEntry ? COLORS.indexOf(pastEntry.color) : room.participants.length + room.pastParticipants.length;

          const participant = {
            id: socket.user.id,
            socketId: socket.id,
            name: socket.user.name,
            joinedAt: new Date().toISOString(),
            color: pastEntry?.color || getColor(colorIndex),
            isHost: false
          };

          room.participants.push(participant);
          // Remove from pastParticipants if rejoining
          room.pastParticipants = room.pastParticipants.filter(p => p.id !== socket.user.id);

          socket.join(code);
          socket.roomCode = code;

          // Update MongoDB
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

          const safeParticipants = getSafeParticipants(room);

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
              messages: room.messages,
              topic: room.topic || ''
            }
          });
          return;
        }

        // ── ACTIVE STATUS: Knock-to-rejoin system ──
        if (room.status === 'active') {
          // Check if this user was a past participant
          const wasPastParticipant = room.pastParticipants.some(p => p.id === socket.user.id);

          if (!wasPastParticipant) {
            return callback?.({ error: 'Session is in progress. Only previous participants can request to rejoin.' });
          }

          if (room.participants.length >= room.settings.maxParticipants) {
            return callback?.({ error: 'Room is full. Cannot rejoin at this time.' });
          }

          // Already has a pending knock?
          if (room.pendingKnocks.some(k => k.userId === socket.user.id)) {
            return callback?.({ error: 'Your rejoin request is already pending. Please wait for the host.' });
          }

          // Store the pending knock with the socket reference
          const pastEntry = room.pastParticipants.find(p => p.id === socket.user.id);
          room.pendingKnocks.push({
            userId: socket.user.id,
            userName: socket.user.name,
            userColor: pastEntry?.color || '#888',
            socketId: socket.id,
            requestedAt: new Date().toISOString()
          });

          // Keep track of this socket's pending room
          socket.pendingRoomCode = code;

          // Notify the host
          const hostParticipant = room.participants.find(p => p.isHost);
          if (hostParticipant) {
            const hostSockets = await io.in(code).fetchSockets();
            const hostSocket = hostSockets.find(s => s.user?.id === hostParticipant.id);
            if (hostSocket) {
              hostSocket.emit('knock_request', {
                userId: socket.user.id,
                userName: socket.user.name,
                userColor: pastEntry?.color || '#888'
              });
            }
          }

          console.log(`🚪 ${socket.user.name} is knocking to rejoin room ${code}`);

          callback?.({
            pending: true,
            message: 'Waiting for host to admit you...'
          });
          return;
        }

        // Session is completed or cancelled
        return callback?.({ error: 'This session has already ended.' });

      } catch (err) {
        console.error('Join room error:', err.message);
        callback?.({ error: 'Failed to join room. Please try again.' });
      }
    });

    // -----------------------------------------------------------
    // ADMIT PARTICIPANT (Host accepts knock request)
    // -----------------------------------------------------------
    socket.on('admit_participant', async ({ userId }, callback) => {
      try {
        const room = rooms.get(socket.roomCode);
        if (!room) return callback?.({ error: 'Room not found' });
        if (room.hostId !== socket.user.id && !room.participants.find(p => p.id === socket.user.id && p.isHost)) {
          return callback?.({ error: 'Only the host can admit participants' });
        }

        const knock = room.pendingKnocks.find(k => k.userId === userId);
        if (!knock) return callback?.({ error: 'No pending request from this user' });

        // Remove from pending knocks
        room.pendingKnocks = room.pendingKnocks.filter(k => k.userId !== userId);

        // Restore from past participants
        const pastEntry = room.pastParticipants.find(p => p.id === userId);

        const participant = {
          id: userId,
          socketId: knock.socketId,
          name: knock.userName,
          joinedAt: new Date().toISOString(),
          color: pastEntry?.color || knock.userColor,
          isHost: false
        };

        room.participants.push(participant);
        room.pastParticipants = room.pastParticipants.filter(p => p.id !== userId);

        // Join the socket to the room
        const allSockets = await io.fetchSockets();
        const knockerSocket = allSockets.find(s => s.id === knock.socketId);
        if (knockerSocket) {
          knockerSocket.join(room.roomCode);
          knockerSocket.roomCode = room.roomCode;
          knockerSocket.pendingRoomCode = null;

          // Send full state sync to the admitted participant
          knockerSocket.emit('knock_accepted', {
            roomCode: room.roomCode,
            participant: {
              id: participant.id, name: participant.name,
              joinedAt: participant.joinedAt, color: participant.color, isHost: participant.isHost
            },
            room: {
              roomCode: room.roomCode,
              hostName: room.hostName,
              status: room.status,
              participants: getSafeParticipants(room),
              settings: room.settings,
              messages: room.messages,
              whiteboardElements: room.whiteboardElements || [],
              codeContent: room.codeContent || '',
              codeLanguage: room.codeLanguage || 'javascript',
              problemText: room.problemText || '',
              timerRemaining: room.timerRemaining,
              timerTotal: room.settings.timerDuration * 60
            }
          });
        }

        // Notify all participants
        io.to(room.roomCode).emit('participant_joined', {
          participant: {
            id: participant.id, name: participant.name,
            joinedAt: participant.joinedAt, color: participant.color, isHost: participant.isHost
          },
          participants: getSafeParticipants(room),
          participantCount: room.participants.length
        });

        console.log(`✅ ${knock.userName} admitted to room ${room.roomCode} by host`);
        callback?.({ success: true });
      } catch (err) {
        console.error('Admit participant error:', err.message);
        callback?.({ error: 'Failed to admit participant.' });
      }
    });

    // -----------------------------------------------------------
    // DENY PARTICIPANT (Host rejects knock request)
    // -----------------------------------------------------------
    socket.on('deny_participant', async ({ userId }, callback) => {
      try {
        const room = rooms.get(socket.roomCode);
        if (!room) return callback?.({ error: 'Room not found' });
        if (room.hostId !== socket.user.id && !room.participants.find(p => p.id === socket.user.id && p.isHost)) {
          return callback?.({ error: 'Only the host can deny participants' });
        }

        const knock = room.pendingKnocks.find(k => k.userId === userId);
        if (!knock) return callback?.({ error: 'No pending request from this user' });

        room.pendingKnocks = room.pendingKnocks.filter(k => k.userId !== userId);

        // Notify the denied user
        const allSockets = await io.fetchSockets();
        const knockerSocket = allSockets.find(s => s.id === knock.socketId);
        if (knockerSocket) {
          knockerSocket.emit('knock_denied', {
            message: 'The host denied your rejoin request.'
          });
          knockerSocket.pendingRoomCode = null;
        }

        console.log(`❌ ${knock.userName} denied from room ${room.roomCode} by host`);
        callback?.({ success: true });
      } catch (err) {
        console.error('Deny participant error:', err.message);
        callback?.({ error: 'Failed to deny participant.' });
      }
    });

    // -----------------------------------------------------------
    // KICK PARTICIPANT (Host removes someone)
    // -----------------------------------------------------------
    socket.on('kick_participant', async ({ userId }, callback) => {
      try {
        const room = rooms.get(socket.roomCode);
        if (!room) return callback?.({ error: 'Room not found' });
        if (room.hostId !== socket.user.id && !room.participants.find(p => p.id === socket.user.id && p.isHost)) {
          return callback?.({ error: 'Only the host can kick participants' });
        }
        if (userId === socket.user.id) return callback?.({ error: 'You cannot kick yourself' });

        const kicked = room.participants.find(p => p.id === userId);
        if (!kicked) return callback?.({ error: 'Participant not found' });

        // Move to pastParticipants
        room.pastParticipants.push({
          id: kicked.id,
          name: kicked.name,
          color: kicked.color,
          leftAt: new Date().toISOString()
        });

        room.participants = room.participants.filter(p => p.id !== userId);

        io.to(room.roomCode).emit('webrtc_peer_left', { userId: kicked.id });

        // Notify the kicked user
        const allSockets = await io.in(room.roomCode).fetchSockets();
        const kickedSocket = allSockets.find(s => s.user?.id === userId);
        if (kickedSocket) {
          kickedSocket.emit('you_were_kicked', {
            message: 'You were removed from the session by the host.'
          });
          kickedSocket.leave(room.roomCode);
          kickedSocket.roomCode = null;
        }

        // Notify remaining participants
        io.to(room.roomCode).emit('participant_left', {
          userId: kicked.id,
          userName: kicked.name,
          reason: 'kicked',
          participants: getSafeParticipants(room),
          participantCount: room.participants.length
        });

        console.log(`🚫 ${kicked.name} kicked from room ${room.roomCode} by host`);
        callback?.({ success: true });
      } catch (err) {
        console.error('Kick participant error:', err.message);
        callback?.({ error: 'Failed to kick participant.' });
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

            // Calculate actual session duration in minutes
            const startMs = new Date(room.startedAt).getTime();
            const endMs = new Date(room.endedAt).getTime();
            const actualDuration = Math.round((endMs - startMs) / 60000);

            // Update MongoDB
            await Session.findByIdAndUpdate(room.sessionDbId, {
              status: 'completed',
              endedAt: new Date()
            });

            io.to(room.roomCode).emit('session_ended', {
              reason: 'timer',
              messageCount: room.messages.length,
              duration: room.settings.timerDuration,
              actualDuration
            });
            console.log(`⏱️ Room ${room.roomCode} session ended (timer). ${room.messages.length} messages. Actual duration: ${actualDuration}m`);

            // Schedule cleanup of completed room after 5 minutes
            setTimeout(() => {
              if (rooms.has(room.roomCode) && rooms.get(room.roomCode).status === 'completed') {
                rooms.delete(room.roomCode);
                console.log(`🗑️ Completed room ${room.roomCode} cleaned up (post-timer).`);
              }
            }, 5 * 60 * 1000);

            // ── Trigger ML Analysis (async — doesn't block) ──
            analyzeSession(io, room).catch(err => {
              console.error(`❌ ML analysis trigger failed for room ${room.roomCode}:`, err.message);
            });
          }
        }, 1000);

        io.to(room.roomCode).emit('session_started', {
          startedAt: room.startedAt,
          timerDuration: room.settings.timerDuration,
          timerRemaining: room.timerRemaining,
          problemText: room.problemText || '',
          topic: room.topic || ''
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
    // WHITEBOARD UPDATE (Real-time sync)
    // -----------------------------------------------------------
    socket.on('whiteboard_update', ({ elements }, callback) => {
      try {
        const room = rooms.get(socket.roomCode);
        if (!room) return;
        if (room.status !== 'active') return;

        const participant = room.participants.find(p => p.id === socket.user.id);
        if (!participant) return;

        // Store latest state in memory for late-join sync
        room.whiteboardElements = elements;

        // Broadcast to all other participants in the room
        socket.to(room.roomCode).emit('whiteboard_update', {
          elements,
          userId: socket.user.id
        });

        // Throttled persistence — persist every 5th update
        room.whiteboardPersistCounter = (room.whiteboardPersistCounter || 0) + 1;
        if (room.whiteboardPersistCounter % 5 === 0) {
          WhiteboardEvent.create({
            sessionId: room.sessionDbId,
            roomCode: room.roomCode,
            userId: socket.user.id,
            userName: participant.name,
            eventType: 'update',
            elementCount: elements?.length || 0,
            timestamp: new Date()
          }).catch(err => console.error('Whiteboard persist error:', err.message));
        }

        callback?.({ success: true });
      } catch (err) {
        console.error('Whiteboard update error:', err.message);
      }
    });

    // -----------------------------------------------------------
    // CODE UPDATE (Real-time sync)
    // -----------------------------------------------------------
    socket.on('code_update', ({ content, language }, callback) => {
      try {
        const room = rooms.get(socket.roomCode);
        if (!room) return;
        if (room.status !== 'active') return;

        const participant = room.participants.find(p => p.id === socket.user.id);
        if (!participant) return;

        // Store latest state in memory for late-join sync
        room.codeContent = content;
        if (language) room.codeLanguage = language;

        // Broadcast to all other participants
        socket.to(room.roomCode).emit('code_update', {
          content,
          language: room.codeLanguage,
          userId: socket.user.id
        });

        callback?.({ success: true });
      } catch (err) {
        console.error('Code update error:', err.message);
      }
    });

    // -----------------------------------------------------------
    // CODE LANGUAGE CHANGE (Sync language selector)
    // -----------------------------------------------------------
    socket.on('code_language_change', ({ language }, callback) => {
      try {
        const room = rooms.get(socket.roomCode);
        if (!room) return;

        room.codeLanguage = language;

        // Broadcast to all participants (including sender for confirmation)
        io.to(room.roomCode).emit('code_language_changed', {
          language,
          changedBy: socket.user.name
        });

        callback?.({ success: true });
      } catch (err) {
        console.error('Code language change error:', err.message);
      }
    });

    // -----------------------------------------------------------
    // WEBRTC SIGNALING — Peer-to-peer video/audio relay
    // The server only relays signaling data (SDP offers/answers
    // and ICE candidates). No media streams touch the server.
    // TURN credentials are supplied by the authenticated REST endpoint; this
    // server only relays signalling, never media.
    // -----------------------------------------------------------

    // Participant announces they joined the video call
    socket.on('webrtc_join', ({ roomCode: rc } = {}) => {
      try {
        const room = rooms.get(socket.roomCode || rc) || findRoomByUserId(socket.user.id)?.room;
        if (!room) return;

        // Notify all other participants that a new peer joined the call
        socket.to(room.roomCode).emit('webrtc_peer_joined', {
          userId: socket.user.id,
          userName: socket.user.name,
          userColor: room.participants.find(p => p.id === socket.user.id)?.color || '#6366f1'
        });

        console.log(`📹 ${socket.user.name} joined video call in room ${room.roomCode}`);
      } catch (err) {
        console.error('WebRTC join error:', err.message);
      }
    });

    // Relay SDP offer from caller to callee
    socket.on('webrtc_offer', ({ to, offer, roomCode: rc }) => {
      try {
        const room = rooms.get(socket.roomCode || rc) || findRoomByUserId(socket.user.id)?.room;
        if (!room) return;

        const target = room.participants.find(p => p.id === to);
        if (!target?.socketId) {
          console.warn(`WebRTC offer dropped: target ${to} is not connected in room ${room.roomCode}`);
          return;
        }

        io.to(target.socketId).emit('webrtc_offer', {
          from: socket.user.id,
          fromName: socket.user.name,
          offer
        });
      } catch (err) {
        console.error('WebRTC offer relay error:', err.message);
      }
    });

    // Relay SDP answer from callee back to caller
    socket.on('webrtc_answer', ({ to, answer, roomCode: rc }) => {
      try {
        const room = rooms.get(socket.roomCode || rc) || findRoomByUserId(socket.user.id)?.room;
        if (!room) return;

        const target = room.participants.find(p => p.id === to);
        if (!target?.socketId) {
          console.warn(`WebRTC answer dropped: target ${to} is not connected in room ${room.roomCode}`);
          return;
        }

        io.to(target.socketId).emit('webrtc_answer', {
          from: socket.user.id,
          answer
        });
      } catch (err) {
        console.error('WebRTC answer relay error:', err.message);
      }
    });

    // Relay ICE candidate for NAT traversal
    socket.on('webrtc_ice_candidate', ({ to, candidate, roomCode: rc }) => {
      try {
        const room = rooms.get(socket.roomCode || rc) || findRoomByUserId(socket.user.id)?.room;
        if (!room) return;

        const target = room.participants.find(p => p.id === to);
        if (!target?.socketId) {
          console.warn(`WebRTC ICE candidate dropped: target ${to} is not connected in room ${room.roomCode}`);
          return;
        }

        io.to(target.socketId).emit('webrtc_ice_candidate', {
          from: socket.user.id,
          candidate
        });
      } catch (err) {
        console.error('WebRTC ICE candidate relay error:', err.message);
      }
    });

    // Handle renegotiation requests between peers
    socket.on('webrtc_renegotiate_request', ({ to, iceRestart = false, roomCode: rc }) => {
      try {
        const room = rooms.get(socket.roomCode || rc) || findRoomByUserId(socket.user.id)?.room;
        if (!room) return;

        const target = room.participants.find(p => p.id === to);
        if (!target?.socketId) {
          console.warn(`WebRTC renegotiation request dropped: target ${to} is not connected in room ${room.roomCode}`);
          return;
        }

        io.to(target.socketId).emit('webrtc_renegotiate_request', {
          from: socket.user.id,
          fromName: socket.user.name,
          iceRestart: Boolean(iceRestart)
        });
      } catch (err) {
        console.error('WebRTC renegotiation request error:', err.message);
      }
    });

    // Participant toggles their camera on/off
    socket.on('webrtc_camera_toggle', ({ isCameraOn, roomCode: rc }) => {
      try {
        const room = rooms.get(socket.roomCode || rc) || findRoomByUserId(socket.user.id)?.room;
        if (!room) return;

        socket.to(room.roomCode).emit('webrtc_camera_toggle', {
          userId: socket.user.id,
          isCameraOn: Boolean(isCameraOn)
        });

        console.log(`📹 ${socket.user.name} camera ${isCameraOn ? 'ON' : 'OFF'} in room ${room.roomCode}`);
      } catch (err) {
        console.error('WebRTC camera toggle error:', err.message);
      }
    });

    // Participant toggles their mic on/off
    socket.on('webrtc_mic_toggle', ({ isMicOn, roomCode: rc }) => {
      try {
        const room = rooms.get(socket.roomCode || rc) || findRoomByUserId(socket.user.id)?.room;
        if (!room) return;

        socket.to(room.roomCode).emit('webrtc_mic_toggle', {
          userId: socket.user.id,
          isMicOn: Boolean(isMicOn)
        });

        console.log(`🎙️ ${socket.user.name} mic ${isMicOn ? 'ON' : 'OFF'} in room ${room.roomCode}`);
      } catch (err) {
        console.error('WebRTC mic toggle error:', err.message);
      }
    });

    // Participant leaves the video call (but stays in room)
    socket.on('webrtc_leave', ({ roomCode: rc }) => {
      try {
        const room = rooms.get(socket.roomCode || rc) || findRoomByUserId(socket.user.id)?.room;
        if (!room) return;

        socket.to(room.roomCode).emit('webrtc_peer_left', {
          userId: socket.user.id
        });

        console.log(`📹 ${socket.user.name} left video call in room ${room.roomCode}`);
      } catch (err) {
        console.error('WebRTC leave error:', err.message);
      }
    });

    // -----------------------------------------------------------
    // END SESSION EARLY (Host only)
    // -----------------------------------------------------------
    socket.on('end_session', async (_, callback) => {
      try {
        const room = rooms.get(socket.roomCode);
        if (!room) return callback?.({ error: 'Room not found' });
        // Allow current host (could have been transferred)
        const hostParticipant = room.participants.find(p => p.isHost);
        if (!hostParticipant || hostParticipant.id !== socket.user.id) {
          return callback?.({ error: 'Only the host can end the session' });
        }

        if (room.timerInterval) clearInterval(room.timerInterval);
        room.status = 'completed';
        room.endedAt = new Date().toISOString();

        // Calculate actual session duration in minutes
        const startMs = new Date(room.startedAt).getTime();
        const endMs = new Date(room.endedAt).getTime();
        const actualDuration = Math.round((endMs - startMs) / 60000);

        // Save final code snapshot to MongoDB
        if (room.codeContent) {
          EditorEvent.create({
            sessionId: room.sessionDbId,
            roomCode: room.roomCode,
            userId: socket.user.id,
            userName: socket.user.name,
            language: room.codeLanguage || 'javascript',
            lineCount: (room.codeContent.match(/\n/g) || []).length + 1,
            content: room.codeContent,
            timestamp: new Date()
          }).catch(err => console.error('Final code persist error:', err.message));
        }

        // Update MongoDB
        await Session.findByIdAndUpdate(room.sessionDbId, {
          status: 'completed',
          endedAt: new Date()
        });

        io.to(room.roomCode).emit('session_ended', {
          reason: 'host',
          messageCount: room.messages.length,
          duration: room.settings.timerDuration,
          actualDuration
        });

        console.log(`🛑 Room ${room.roomCode} ended early by host. ${room.messages.length} messages. Actual duration: ${actualDuration}m`);

        // Schedule cleanup of completed room after 5 minutes
        setTimeout(() => {
          if (rooms.has(room.roomCode) && rooms.get(room.roomCode).status === 'completed') {
            rooms.delete(room.roomCode);
            console.log(`🗑️ Completed room ${room.roomCode} cleaned up (post-host-end).`);
          }
        }, 5 * 60 * 1000);

        // ── Trigger ML Analysis (async — doesn't block) ──
        analyzeSession(io, room).catch(err => {
          console.error(`❌ ML analysis trigger failed for room ${room.roomCode}:`, err.message);
        });
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

          // This is an intentional leave, so peers can release media now.
          socket.to(room.roomCode).emit('webrtc_peer_left', {
            userId: socket.user.id
          });

          const leaving = room.participants.find(p => p.id === socket.user.id);

          // Move to pastParticipants (for rejoin tracking)
          if (leaving) {
            room.pastParticipants.push({
              id: leaving.id,
              name: leaving.name,
              color: leaving.color,
              leftAt: new Date().toISOString()
            });
          }

          room.participants = room.participants.filter(p => p.id !== socket.user.id && p.socketId !== socket.id);

          const safeParticipants = getSafeParticipants(room);

          io.to(socket.roomCode).emit('participant_left', {
            userId: socket.user.id,
            userName: socket.user.name,
            reason: 'left',
            participants: safeParticipants,
            participantCount: room.participants.length
          });

          socket.leave(socket.roomCode);

          // Host transfer if host left during active session
          if (leaving?.isHost && room.status === 'active' && room.participants.length > 0) {
            performHostTransfer(io, room);
          }

          // Clean up if room is empty
          if (room.participants.length === 0 && room.status !== 'active') {
            if (room.timerInterval) clearInterval(room.timerInterval);
            rooms.delete(socket.roomCode);
            console.log(`🗑️ Room ${socket.roomCode} deleted (empty)`);
          }

          socket.roomCode = null;
          activeUserSockets.delete(socket.user.id);
        }
        callback?.({ success: true });
      } catch (err) {
        console.error('Leave room error:', err.message);
        callback?.({ error: 'Failed to leave room.' });
      }
    });

    // -----------------------------------------------------------
    // DISCONNECT (with 15-second grace period)
    // -----------------------------------------------------------
    socket.on('disconnect', async (reason) => {
      console.log(`💨 Client disconnected: ${socket.id} (${socket.user?.name || 'unknown'}; ${reason})`);

      const room = rooms.get(socket.roomCode);
      if (!room) {
        activeUserSockets.delete(socket.user?.id);
        return;
      }

      const participant = room.participants.find(p => p.id === socket.user?.id);
      if (!participant) {
        activeUserSockets.delete(socket.user?.id);
        return;
      }

      // ── ACTIVE SESSION: 15-second grace period for reconnection ──
      if (room.status === 'active') {
        const timerKey = `${room.roomCode}:${socket.user.id}`;
        console.log(`⏳ ${socket.user.name} disconnected from active room ${room.roomCode} — 15s grace period`);

        const timeoutId = setTimeout(async () => {
          disconnectTimers.delete(timerKey);

          // Grace period expired — remove participant
          const currentRoom = rooms.get(room.roomCode);
          if (!currentRoom) return;

          const stillThere = currentRoom.participants.find(p => p.id === socket.user.id);
          if (!stillThere) return;

          // Move to pastParticipants
          currentRoom.pastParticipants.push({
            id: stillThere.id,
            name: stillThere.name,
            color: stillThere.color,
            leftAt: new Date().toISOString()
          });

          currentRoom.participants = currentRoom.participants.filter(p => p.id !== socket.user.id);

          // Only announce a media departure after the reconnection grace
          // period expires. Closing a WebRTC peer connection immediately on a
          // transient Socket.IO/tunnel reconnect caused one-way media.
          io.to(currentRoom.roomCode).emit('webrtc_peer_left', {
            userId: socket.user.id
          });

          io.to(currentRoom.roomCode).emit('participant_left', {
            userId: socket.user.id,
            userName: socket.user.name,
            reason: 'disconnected',
            participants: getSafeParticipants(currentRoom),
            participantCount: currentRoom.participants.length
          });

          // Host transfer if host disconnected
          if (stillThere.isHost && currentRoom.participants.length > 0) {
            performHostTransfer(io, currentRoom);
          }

          // Clean up if empty
          if (currentRoom.participants.length === 0) {
            if (currentRoom.timerInterval) clearInterval(currentRoom.timerInterval);
            // Don't delete room immediately — timer might still be running
            // Just let it complete or zombie cleanup will handle it
          }

          activeUserSockets.delete(socket.user.id);
          console.log(`💤 Grace period expired for ${socket.user.name} in room ${currentRoom.roomCode}`);
        }, 15000);

        disconnectTimers.set(timerKey, timeoutId);
        return; // Don't remove participant yet
      }

      // ── WAITING STATUS: Immediate removal ──
      room.participants = room.participants.filter(p => p.id !== socket.user?.id && p.socketId !== socket.id);

      const safeParticipants = getSafeParticipants(room);

      io.to(room.roomCode).emit('participant_left', {
        userId: socket.user?.id,
        userName: socket.user?.name,
        reason: 'disconnected',
        participants: safeParticipants,
        participantCount: room.participants.length
      });

      // If host disconnects during waiting, close room after 2 minutes
      if (participant.isHost && room.status === 'waiting') {
        console.log(`⚠️ Host left room ${room.roomCode} — closing in 2 min if no one takes over`);
        setTimeout(async () => {
          const current = rooms.get(room.roomCode);
          if (current && current.status === 'waiting') {
            io.to(room.roomCode).emit('room_closed', { reason: 'Host disconnected' });
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

      activeUserSockets.delete(socket.user?.id);
    });
  });

  // ─────────────────────────────────────────────
  // HOST TRANSFER LOGIC
  // ─────────────────────────────────────────────
  function performHostTransfer(io, room) {
    if (room.participants.length === 0) return;

    // Pick the longest-tenured participant (earliest joinedAt)
    const sorted = [...room.participants].sort((a, b) =>
      new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime()
    );
    const newHost = sorted[0];

    // Update host flags
    room.participants.forEach(p => { p.isHost = false; });
    newHost.isHost = true;
    room.hostId = newHost.id;
    room.hostName = newHost.name;

    io.to(room.roomCode).emit('host_transferred', {
      newHostId: newHost.id,
      newHostName: newHost.name,
      participants: getSafeParticipants(room)
    });

    console.log(`👑 Host transferred to ${newHost.name} in room ${room.roomCode}`);
  }

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
