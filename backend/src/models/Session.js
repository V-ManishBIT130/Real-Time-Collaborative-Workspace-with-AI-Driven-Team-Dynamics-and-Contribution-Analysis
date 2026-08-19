const mongoose = require('mongoose');

const participantSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  joinedAt: { type: Date, default: Date.now },
  color: { type: String, required: true },
  isHost: { type: Boolean, default: false }
}, { _id: false });

const sessionSchema = new mongoose.Schema({
  roomCode: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    index: true
  },
  topic: {
    type: String,
    default: '',
    maxlength: 200,
    trim: true
  },
  hostUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  participants: [participantSchema],
  settings: {
    timerDuration: { type: Number, required: true, min: 1, max: 60 },
    maxParticipants: { type: Number, default: 5, min: 2, max: 8 }
  },
  status: {
    type: String,
    enum: ['waiting', 'active', 'completed', 'cancelled', 'analysis_pending'],
    default: 'waiting'
  },
  startedAt: Date,
  endedAt: Date,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Session', sessionSchema);
