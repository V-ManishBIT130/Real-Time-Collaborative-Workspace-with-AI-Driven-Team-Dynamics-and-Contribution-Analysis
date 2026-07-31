const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Session',
    required: true,
    index: true
  },
  roomCode: {
    type: String,
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  userName: {
    type: String,
    required: true
  },
  userColor: {
    type: String,
    default: '#6366f1'
  },
  text: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  sequenceNumber: {
    type: Number,
    required: true
  },
  source: {
    type: String,
    enum: ['text', 'voice'],
    default: 'text'
  }
});

// Compound index for efficient queries: get all messages for a session in order
messageSchema.index({ sessionId: 1, timestamp: 1 });

module.exports = mongoose.model('Message', messageSchema);
