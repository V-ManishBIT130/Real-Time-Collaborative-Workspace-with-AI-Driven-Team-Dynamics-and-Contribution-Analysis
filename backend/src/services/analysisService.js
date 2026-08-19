/**
 * CollabLens — Analysis Service
 *
 * Handles communication between Node.js backend and Python ML service.
 * Features:
 *   - 3-retry mechanism with exponential backoff
 *   - 120-second timeout per attempt
 *   - Socket.IO progress notifications to clients
 *   - Saves report to MongoDB on success
 *   - Sets session to 'analysis_pending' on failure
 *   - Emits 'analysis_error' with retry option on failure
 */

const Report = require('../models/Report');
const Session = require('../models/Session');
const Message = require('../models/Message');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:5000';
const MAX_RETRIES = 3;
const TIMEOUT_MS = 120000; // 2 minutes


/**
 * Check if the ML service is healthy and models are loaded.
 * @returns {Promise<object>} Health status
 */
async function checkMLHealth() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(`${ML_SERVICE_URL}/health`, {
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return { healthy: false, error: `HTTP ${response.status}` };
    }

    const data = await response.json();
    return {
      healthy: data.status === 'ok' && data.models_loaded === true,
      ...data
    };
  } catch (err) {
    return {
      healthy: false,
      error: err.message
    };
  }
}


/**
 * Trigger ML analysis for a completed session.
 *
 * Called when a session ends (timer expiry or host end).
 * Fetches messages from MongoDB, sends to ML service, saves report.
 *
 * @param {object} io - Socket.IO server instance
 * @param {object} room - In-memory room object
 */
async function analyzeSession(io, room) {
  const sessionId = room.sessionDbId;
  const roomCode = room.roomCode;

  console.log(`\n🔬 Starting analysis for session ${sessionId} (room ${roomCode})`);

  // ── Notify clients that analysis has started ───────────────
  io.to(roomCode).emit('analysis_started', {
    message: 'Analyzing your session...',
    sessionId: sessionId?.toString()
  });

  // ── Gather session data ────────────────────────────────────
  let messages;
  try {
    // Fetch messages from MongoDB (persisted, authoritative source)
    messages = await Message.find({ sessionId })
      .sort({ timestamp: 1 })
      .lean();

    // If MongoDB messages are empty, fall back to in-memory
    if (!messages || messages.length === 0) {
      console.log('  ⚠️ No messages in MongoDB, using in-memory messages');
      messages = room.messages.map(m => ({
        userId: m.userId,
        userName: m.userName,
        text: m.text,
        timestamp: m.timestamp,
        source: m.source || 'text',
        sequenceNumber: m.sequenceNumber
      }));
    }
  } catch (err) {
    console.error('  ❌ Failed to fetch messages:', err.message);
    // Fall back to in-memory messages
    messages = room.messages.map(m => ({
      userId: m.userId,
      userName: m.userName,
      text: m.text,
      timestamp: m.timestamp,
      source: m.source || 'text',
      sequenceNumber: m.sequenceNumber
    }));
  }

  // Guard: need at least 3 messages
  if (messages.length < 3) {
    console.log(`  ⚠️ Only ${messages.length} messages — skipping analysis`);
    io.to(roomCode).emit('analysis_skipped', {
      message: 'Not enough messages for analysis (minimum 3 required).',
      messageCount: messages.length,
      sessionId: sessionId?.toString()
    });
    return;
  }

  // Build participants list
  const participants = room.participants.map(p => ({
    userId: p.id,
    name: p.name
  }));

  // Also include past participants (they contributed messages)
  const pastIds = new Set(participants.map(p => p.userId));
  if (room.pastParticipants) {
    for (const pp of room.pastParticipants) {
      if (!pastIds.has(pp.id)) {
        participants.push({ userId: pp.id, name: pp.name });
        pastIds.add(pp.id);
      }
    }
  }

  // Build request payload
  const payload = {
    sessionId: sessionId?.toString(),
    messages: messages.map(m => ({
      userId: (m.userId || '').toString(),
      userName: m.userName,
      text: m.text,
      timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : m.timestamp,
      source: m.source || 'text',
      sequenceNumber: m.sequenceNumber
    })),
    participants,
    duration: room.settings?.timerDuration,
    topic: room.topic || ''
  };

  console.log(`  📊 Sending ${messages.length} messages from ${participants.length} participants to ML service (Topic: "${room.topic || 'General Discussion'}")`);

  // ── Retry loop ─────────────────────────────────────────────
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Progress notification
      io.to(roomCode).emit('analysis_progress', {
        message: attempt === 1
          ? 'Analyzing your session...'
          : `Retrying analysis (attempt ${attempt}/${MAX_RETRIES})...`,
        attempt,
        maxRetries: MAX_RETRIES
      });

      // Call ML service
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const response = await fetch(`${ML_SERVICE_URL}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`ML service returned HTTP ${response.status}: ${errorBody}`);
      }

      const report = await response.json();

      // ── Check for ML-level errors ──────────────────────────
      if (report.error) {
        throw new Error(`ML analysis error: ${report.error}`);
      }

      // ── Save report to MongoDB ─────────────────────────────
      const savedReport = await Report.create({
        sessionId,
        topic: room.topic || '',
        generatedAt: new Date(),
        ...report
      });

      // Update session status
      await Session.findByIdAndUpdate(sessionId, {
        status: 'completed'
      });

      console.log(`  ✅ Analysis complete! Report saved (${report.meta?.analysisTimeSeconds}s on ${report.meta?.device})`);
      console.log(`     Overall Score: ${report.summary?.overallScore}`);
      console.log(`     Clusters: ${report.ideaClusters?.n_clusters} | Stuck: ${report.stuckPeriods?.length}`);

      // ── Notify clients ─────────────────────────────────────
      io.to(roomCode).emit('report_ready', {
        sessionId: sessionId?.toString(),
        overallScore: report.summary?.overallScore,
        analysisTime: report.meta?.analysisTimeSeconds
      });

      return; // Success — exit retry loop

    } catch (err) {
      console.error(`  ❌ Analysis attempt ${attempt}/${MAX_RETRIES} failed:`, err.message);

      if (attempt === MAX_RETRIES) {
        // All retries exhausted — save as pending
        console.error('  💀 All retries exhausted. Saving as analysis_pending.');

        try {
          await Session.findByIdAndUpdate(sessionId, {
            status: 'analysis_pending'
          });
        } catch (dbErr) {
          console.error('  ❌ Failed to update session status:', dbErr.message);
        }

        io.to(roomCode).emit('analysis_error', {
          message: 'Analysis failed after multiple attempts. You can retry from session history.',
          sessionId: sessionId?.toString(),
          error: err.message,
          canRetry: true
        });

      } else {
        // Wait before retrying (exponential backoff: 2s, 4s)
        const backoffMs = 2000 * attempt;
        console.log(`  ⏳ Retrying in ${backoffMs / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }
    }
  }
}


/**
 * Retry analysis for a session that previously failed.
 *
 * @param {string} sessionId - MongoDB session ID
 * @param {object} io - Socket.IO server instance
 * @returns {Promise<object>} Result
 */
async function retryAnalysis(sessionId, io) {
  const session = await Session.findById(sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  if (session.status !== 'analysis_pending' && session.status !== 'completed') {
    throw new Error(`Cannot retry analysis for session with status: ${session.status}`);
  }

  // Check if report already exists
  const existing = await Report.findOne({ sessionId });
  if (existing) {
    return { alreadyExists: true, reportId: existing._id };
  }

  // Fetch messages
  const messages = await Message.find({ sessionId }).sort({ timestamp: 1 }).lean();
  if (messages.length < 3) {
    throw new Error(`Not enough messages for analysis (${messages.length} < 3)`);
  }

  // Build a minimal room-like object for analyzeSession
  const room = {
    sessionDbId: sessionId,
    roomCode: session.roomCode,
    participants: session.participants.map(p => ({
      id: p.userId.toString(),
      name: p.name
    })),
    pastParticipants: [],
    messages: messages.map(m => ({
      userId: m.userId.toString(),
      userName: m.userName,
      text: m.text,
      timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : m.timestamp,
      source: m.source || 'text',
      sequenceNumber: m.sequenceNumber
    })),
    settings: session.settings
  };

  // Run analysis (non-blocking)
  analyzeSession(io, room);

  return { retrying: true, sessionId: sessionId.toString() };
}


module.exports = {
  checkMLHealth,
  analyzeSession,
  retryAnalysis
};
