const mongoose = require('mongoose');

const editorEventSchema = new mongoose.Schema({
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
  language: {
    type: String,
    default: 'javascript'
  },
  lineCount: {
    type: Number,
    default: 0
  },
  content: {
    type: String,
    default: ''
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

// Compound index for temporal analysis queries
editorEventSchema.index({ sessionId: 1, timestamp: 1 });

module.exports = mongoose.model('EditorEvent', editorEventSchema);
