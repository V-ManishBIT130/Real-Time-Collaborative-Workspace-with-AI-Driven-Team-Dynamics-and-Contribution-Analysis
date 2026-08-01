const mongoose = require('mongoose');

const whiteboardEventSchema = new mongoose.Schema({
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
  eventType: {
    type: String,
    enum: ['draw', 'update', 'clear'],
    default: 'update'
  },
  elementCount: {
    type: Number,
    default: 0
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

// Compound index for temporal analysis queries
whiteboardEventSchema.index({ sessionId: 1, timestamp: 1 });

module.exports = mongoose.model('WhiteboardEvent', whiteboardEventSchema);
