const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  sessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Session',
    required: true,
    unique: true,
    index: true
  },
  generatedAt: {
    type: Date,
    default: Date.now
  },
  topic: {
    type: String,
    default: ''
  },

  // ── Enriched Messages ──────────────────────────────────────
  messages: [{
    userId: String,
    userName: String,
    text: String,
    timestamp: String,
    sequenceNumber: Number,
    source: { type: String, enum: ['text', 'voice'], default: 'text' },
    sentimentScore: Number,
    sentimentLabel: String,
    messageType: String,
    messageTypeConfidence: Number,
    clusterLabel: Number
  }],

  // ── Contribution Analysis ──────────────────────────────────
  contributions: {
    byMember: [{
      userId: String,
      name: String,
      messageCount: Number,
      newIdeas: Number,
      buildingOnOthers: Number,
      agreements: Number,
      disagreements: Number,
      questions: Number,
      coordination: Number,
      offTopic: Number,
      qualityScore: Number,
      avgSentiment: Number,
      sentimentLabel: String,
      voiceMessages: Number,
      textMessages: Number
    }],
    equity: Number,
    equityLabel: String,
    totalMessages: Number
  },

  // ── Idea Clusters ──────────────────────────────────────────
  ideaClusters: {
    clusters: [{
      clusterId: Number,
      messageCount: Number,
      percentage: Number,
      representativeText: String,
      originatorUserId: String,
      originatorName: String,
      firstMentionTime: String,
      messageIndices: [Number],
      contributorCounts: mongoose.Schema.Types.Mixed
    }],
    n_clusters: Number,
    noise_count: Number
  },

  // ── Exploration Score ──────────────────────────────────────
  explorationScore: {
    score: Number,
    label: String,
    n_clusters: Number,
    distribution: mongoose.Schema.Types.Mixed,
    interpretation: String
  },

  // ── Communication Network ──────────────────────────────────
  communicationNetwork: {
    density: Number,
    reciprocity: Number,
    pattern: String,
    nodes: [{
      userId: String,
      name: String,
      degreeCentrality: Number,
      betweennessCentrality: Number,
      messageCount: Number,
      isIsolated: Boolean,
      position: [Number]
    }],
    edges: [{
      from: String,
      to: String,
      weight: Number,
      fromName: String,
      toName: String
    }],
    isolatedMembers: [String],
    strongestLink: {
      from: String,
      to: String,
      weight: Number
    },
    hubMember: {
      userId: String,
      name: String,
      betweennessCentrality: Number
    },
    nodePositions: mongoose.Schema.Types.Mixed
  },

  // ── Stuck Periods ──────────────────────────────────────────
  stuckPeriods: [{
    startTime: Number,
    endTime: Number,
    duration: Number,
    stuckScore: Number,
    signals: {
      semanticSimilarity: Number,
      sentimentDrop: Number,
      noNewClusters: Number,
      messageGap: Number
    },
    avgSentiment: Number,
    messageCount: Number,
    recovery: {
      userId: String,
      userName: String,
      text: String,
      type: String,
      timestamp: String,
      timeAfterStuck: Number
    }
  }],

  // ── Timeline ───────────────────────────────────────────────
  timeline: [{
    windowIndex: Number,
    startTime: Number,
    endTime: Number,
    phase: String,
    messageCount: Number,
    sentiment: Number,
    newClusters: Number,
    clusterIds: [Number],
    activeParticipants: Number,
    activeUserIds: [String],
    classificationBreakdown: mongoose.Schema.Types.Mixed
  }],

  // ── Summary & Insights ─────────────────────────────────────
  summary: {
    overallScore: Number,
    scoreLabel: String,
    insights: {
      strengths: [String],
      improvements: [String],
      keyMoments: [{
        type: String,
        time: Number,
        description: String,
        userId: String,
        userName: String
      }]
    },
    collectiveIntelligenceIndicators: {
      contributionEquity: Number,
      communicationDensity: Number,
      explorationScore: Number,
      stuckRecoveryRate: Number,
      avgContributionQuality: Number
    }
  },

  // ── Analysis Metadata ──────────────────────────────────────
  meta: {
    analysisTimeSeconds: Number,
    messageCount: Number,
    participantCount: Number,
    device: String
  }
});

module.exports = mongoose.model('Report', reportSchema);
