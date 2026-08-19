import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { apiFetch } from '../utils/api';
import '../styles/Report.css';

interface ReportData {
  sessionId: string;
  topic?: string;
  generatedAt: string;
  summary: {
    overallScore: number;
    scoreLabel: string;
    insights: {
      strengths: string[];
      improvements: string[];
      keyMoments?: { type: string; time: number; description: string; userName?: string }[];
    };
    collectiveIntelligenceIndicators: {
      contributionEquity: number;
      communicationDensity: number;
      explorationScore: number;
      stuckRecoveryRate: number;
      avgContributionQuality: number;
    };
  };
  contributions: {
    byMember: {
      userId: string;
      name: string;
      messageCount: number;
      newIdeas: number;
      buildingOnOthers: number;
      agreements: number;
      disagreements: number;
      questions: number;
      coordination: number;
      offTopic: number;
      qualityScore: number;
      avgSentiment: number;
      sentimentLabel: string;
      voiceMessages: number;
      textMessages: number;
    }[];
    equity: number;
    equityLabel: string;
    totalMessages: number;
  };
  ideaClusters: {
    clusters: {
      clusterId: number;
      messageCount: number;
      percentage: number;
      representativeText: string;
      originatorName: string;
    }[];
    n_clusters: number;
  };
  explorationScore: {
    score: number;
    label: string;
    interpretation: string;
  };
  communicationNetwork: {
    density: number;
    reciprocity: number;
    pattern: string;
    nodes: {
      userId: string;
      name: string;
      degreeCentrality: number;
      betweennessCentrality: number;
      messageCount: number;
      position: [number, number];
    }[];
    edges: {
      from: string;
      to: string;
      weight: number;
      fromName: string;
      toName: string;
    }[];
    hubMember?: { name: string; betweennessCentrality: number };
    isolatedMembers?: string[];
  };
  stuckPeriods: {
    startTime: number;
    endTime: number;
    duration: number;
    stuckScore: number;
    recovery?: { userName: string; text: string };
  }[];
  timeline: {
    windowIndex: number;
    startTime: number;
    endTime: number;
    phase: string;
    messageCount: number;
    sentiment: number;
  }[];
  meta?: {
    analysisTimeSeconds: number;
    messageCount: number;
    participantCount: number;
    device: string;
  };
}

export default function Report() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { token } = useAuthStore();

  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (!sessionId) return;

    const fetchReport = async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await apiFetch(`/api/sessions/${sessionId}/report`);

        if (res.status === 202) {
          setError('Analysis is still running or pending. Please retry in a few moments.');
          setLoading(false);
          return;
        }

        if (!res.ok) {
          throw new Error(`Report fetch failed: HTTP ${res.status}`);
        }

        const data = await res.json();
        setReport(data);
      } catch (err: any) {
        setError(err.message || 'Failed to load intelligence report');
      } finally {
        setLoading(false);
      }
    };

    fetchReport();
  }, [sessionId, token]);

  const handleRetry = async () => {
    if (!sessionId) return;
    try {
      setRetrying(true);
      setError('Triggered re-analysis. Waiting for completion...');
      await apiFetch(`/api/sessions/${sessionId}/retry-analysis`, {
        method: 'POST'
      });
      setTimeout(() => {
        window.location.reload();
      }, 4000);
    } catch (e: any) {
      setError(`Retry failed: ${e.message}`);
      setRetrying(false);
    }
  };

  if (loading) {
    return (
      <div className="report-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="pulse-dot" style={{ width: 16, height: 16, background: '#6366f1', margin: '0 auto 16px' }} />
          <h2 style={{ color: '#818cf8', margin: '0 0 8px' }}>Generating Intelligence Report...</h2>
          <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Analyzing semantic clusters, team dynamics, and contribution equity</p>
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="report-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="card" style={{ maxWidth: 500, textAlign: 'center', margin: 'auto' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>⚠️</div>
          <h2 style={{ color: '#f87171', margin: '0 0 12px' }}>Report Not Available</h2>
          <p style={{ color: '#cbd5e1', fontSize: '0.9rem', marginBottom: '1.5rem' }}>{error}</p>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <button className="btn-secondary" onClick={handleRetry} disabled={retrying}>
              {retrying ? 'Retrying...' : '🔄 Retry Analysis'}
            </button>
            <button className="btn-primary" onClick={() => navigate('/')}>
              Back to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  const scorePct = Math.round((report.summary?.overallScore || 0) * 100);
  const indicators = report.summary?.collectiveIntelligenceIndicators || {
    contributionEquity: report.contributions?.equity || 0,
    communicationDensity: report.communicationNetwork?.density || 0,
    explorationScore: report.explorationScore?.score || 0,
    stuckRecoveryRate: 1.0,
    avgContributionQuality: 0.8
  };

  // Color categories
  const catColors: Record<string, string> = {
    newIdeas: '#10b981',
    buildingOnOthers: '#3b82f6',
    questions: '#f59e0b',
    agreements: '#8b5cf6',
    disagreements: '#ec4899',
    coordination: '#64748b'
  };

  return (
    <div className="report-page">
      <div className="report-container">
        {/* Header */}
        <header className="report-header">
          <div className="report-header-left">
            <div className="report-brand">
              <span>CollabLens AI</span>
              <span>•</span>
              <span>Team Intelligence Report</span>
            </div>
            <h1 className="report-title">Collaboration Dynamics & Impact Analysis</h1>
            {report.topic && (
              <div className="report-topic-pill">
                <span>🎯 Goal / Topic:</span>
                <strong>{report.topic}</strong>
              </div>
            )}
          </div>
          <div className="report-header-right">
            <button className="btn-secondary" onClick={() => window.print()}>
              🖨️ Print / Export
            </button>
            <button className="btn-primary" onClick={() => navigate('/')}>
              ← Return to Dashboard
            </button>
          </div>
        </header>

        {/* Metadata Chips */}
        <div className="meta-chips">
          <div className="meta-chip">
            📅 <strong>{new Date(report.generatedAt).toLocaleDateString()}</strong>
          </div>
          <div className="meta-chip">
            👥 <strong>{report.meta?.participantCount || report.contributions?.byMember?.length || 0} Members</strong>
          </div>
          <div className="meta-chip">
            💬 <strong>{report.contributions?.totalMessages || report.meta?.messageCount || 0} Messages</strong>
          </div>
          <div className="meta-chip">
            ⚡ Computed on <strong>{report.meta?.device?.toUpperCase() || 'GPU'}</strong> in <strong>{report.meta?.analysisTimeSeconds || 0}s</strong>
          </div>
        </div>

        {/* Main Grid */}
        <div className="report-grid">
          {/* 1. Score Hero Card */}
          <div className="card score-hero-card">
            <div className="score-circle-container">
              <div className="score-ring" style={{ ['--score-deg' as any]: `${scorePct * 3.6}deg` }}>
                <div className="score-ring-inner">
                  <span className="score-number">{scorePct}</span>
                  <span className="score-max">out of 100</span>
                </div>
              </div>
              <div className="score-label">{report.summary?.scoreLabel || 'High Collective Intelligence'}</div>
            </div>

            <div className="indicators-grid">
              <div className="indicator-box">
                <span className="indicator-title">Contribution Equity</span>
                <span className="indicator-value">{Math.round((indicators.contributionEquity || 0) * 100)}%</span>
                <div className="indicator-bar">
                  <div className="indicator-fill" style={{ width: `${Math.round((indicators.contributionEquity || 0) * 100)}%` }} />
                </div>
              </div>

              <div className="indicator-box">
                <span className="indicator-title">Idea Exploration</span>
                <span className="indicator-value">{Math.round((indicators.explorationScore || 0) * 100)}%</span>
                <div className="indicator-bar">
                  <div className="indicator-fill" style={{ width: `${Math.round((indicators.explorationScore || 0) * 100)}%` }} />
                </div>
              </div>

              <div className="indicator-box">
                <span className="indicator-title">Network Density</span>
                <span className="indicator-value">{Math.round((indicators.communicationDensity || 0) * 100)}%</span>
                <div className="indicator-bar">
                  <div className="indicator-fill" style={{ width: `${Math.round((indicators.communicationDensity || 0) * 100)}%` }} />
                </div>
              </div>

              <div className="indicator-box">
                <span className="indicator-title">Stuck Recovery</span>
                <span className="indicator-value">{Math.round((indicators.stuckRecoveryRate || 1.0) * 100)}%</span>
                <div className="indicator-bar">
                  <div className="indicator-fill" style={{ width: `${Math.round((indicators.stuckRecoveryRate || 1.0) * 100)}%` }} />
                </div>
              </div>
            </div>
          </div>

          {/* 2. Member Contributions Breakdown */}
          <div className="card contributions-card">
            <h3 className="card-title">👥 Member Impact & Cognition</h3>
            <div className="member-list">
              {report.contributions?.byMember?.map((m) => {
                const total = m.messageCount || 1;
                return (
                  <div key={m.userId} className="member-row">
                    <div className="member-header">
                      <div className="member-info">
                        <div className="member-avatar">{m.name.charAt(0).toUpperCase()}</div>
                        <div>
                          <div className="member-name">{m.name}</div>
                          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                            Quality Score: <strong style={{ color: '#10b981' }}>{Math.round(m.qualityScore * 100)}%</strong>
                          </div>
                        </div>
                      </div>
                      <div className="member-badges">
                        {m.voiceMessages > 0 && (
                          <span className="badge badge-voice">🎙 {m.voiceMessages} voice</span>
                        )}
                        <span className="badge badge-text">💬 {m.textMessages || m.messageCount} text</span>
                      </div>
                    </div>

                    <div className="member-stats">
                      <span>💡 <strong>{m.newIdeas}</strong> ideas</span>
                      <span>🔄 <strong>{m.buildingOnOthers}</strong> builds</span>
                      <span>❓ <strong>{m.questions}</strong> questions</span>
                      <span>🤝 <strong>{m.agreements}</strong> agrees</span>
                    </div>

                    {/* Breakdown bar */}
                    <div className="member-category-bars" title="Breakdown: Green=Ideas, Blue=Builds, Amber=Questions">
                      <div className="cat-seg" style={{ width: `${(m.newIdeas / total) * 100}%`, background: catColors.newIdeas }} />
                      <div className="cat-seg" style={{ width: `${(m.buildingOnOthers / total) * 100}%`, background: catColors.buildingOnOthers }} />
                      <div className="cat-seg" style={{ width: `${(m.questions / total) * 100}%`, background: catColors.questions }} />
                      <div className="cat-seg" style={{ width: `${(m.agreements / total) * 100}%`, background: catColors.agreements }} />
                      <div className="cat-seg" style={{ width: `${(m.coordination / total) * 100}%`, background: catColors.coordination }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 3. Communication Network */}
          <div className="card network-card">
            <h3 className="card-title">🕸️ Interaction Network</h3>
            <div className="network-svg-container">
              {/* Dynamic SVG graph of participants & edges */}
              <svg width="100%" height="100%" viewBox="-1.2 -1.2 2.4 2.4" style={{ overflow: 'visible' }}>
                {/* Edges */}
                {report.communicationNetwork?.edges?.map((edge, i) => {
                  const fromNode = report.communicationNetwork.nodes.find((n) => n.userId === edge.from);
                  const toNode = report.communicationNetwork.nodes.find((n) => n.userId === edge.to);
                  if (!fromNode || !toNode) return null;
                  return (
                    <line
                      key={i}
                      x1={fromNode.position?.[0] || 0}
                      y1={fromNode.position?.[1] || 0}
                      x2={toNode.position?.[0] || 0}
                      y2={toNode.position?.[1] || 0}
                      stroke="rgba(99, 102, 241, 0.4)"
                      strokeWidth={Math.min(edge.weight * 0.04, 0.15) || 0.03}
                    />
                  );
                })}

                {/* Nodes */}
                {report.communicationNetwork?.nodes?.map((node) => (
                  <g key={node.userId} transform={`translate(${node.position?.[0] || 0}, ${node.position?.[1] || 0})`}>
                    <circle r="0.18" fill="#4f46e5" stroke="#818cf8" strokeWidth="0.03" />
                    <text
                      textAnchor="middle"
                      dy="0.06"
                      fill="#ffffff"
                      fontSize="0.12"
                      fontWeight="bold"
                      fontFamily="sans-serif"
                    >
                      {node.name.slice(0, 3).toUpperCase()}
                    </text>
                  </g>
                ))}
              </svg>
            </div>

            <div className="network-meta">
              <div className="network-meta-item">
                <span>Network Pattern</span>
                <strong>{report.communicationNetwork?.pattern || 'Distributed Network'}</strong>
              </div>
              {report.communicationNetwork?.hubMember && (
                <div className="network-meta-item">
                  <span>Central Communication Hub</span>
                  <strong style={{ color: '#818cf8' }}>{report.communicationNetwork.hubMember.name}</strong>
                </div>
              )}
              <div className="network-meta-item">
                <span>Density</span>
                <strong>{Math.round((report.communicationNetwork?.density || 0) * 100)}%</strong>
              </div>
            </div>
          </div>

          {/* 4. Idea Clusters & Exploration */}
          <div className="card clusters-card">
            <h3 className="card-title">💡 Semantic Idea Clusters</h3>
            <div style={{ marginBottom: '1rem', fontSize: '0.85rem', color: '#94a3b8' }}>
              Exploration: <strong style={{ color: '#10b981' }}>{report.explorationScore?.label}</strong> ({report.explorationScore?.interpretation})
            </div>

            {report.ideaClusters?.clusters?.map((c) => (
              <div key={c.clusterId} className="cluster-item">
                <div className="cluster-header">
                  <span className="cluster-tag">Topic #{c.clusterId + 1} ({c.percentage}%)</span>
                  <span className="cluster-originator">First raised by {c.originatorName}</span>
                </div>
                <p className="cluster-quote">"{c.representativeText}"</p>
              </div>
            ))}
          </div>

          {/* 5. Timeline & Stuck Periods */}
          <div className="card timeline-card">
            <h3 className="card-title">⏱️ Session Phases & Momentum</h3>
            <div className="timeline-track">
              {report.timeline?.map((t, idx) => (
                <div key={idx} className="timeline-phase-item">
                  <span className={`phase-badge phase-${t.phase}`}>{t.phase}</span>
                  <div style={{ flex: 1, fontSize: '0.82rem', color: '#cbd5e1' }}>
                    Window {idx + 1} ({Math.round(t.startTime)}s - {Math.round(t.endTime)}s) • {t.messageCount} messages
                  </div>
                </div>
              ))}
            </div>

            {report.stuckPeriods?.length > 0 ? (
              <div className="stuck-alert-box">
                <div className="stuck-alert-title">
                  <span>⚠️ Stuck Period Detected ({report.stuckPeriods.length})</span>
                </div>
                {report.stuckPeriods.map((s, idx) => (
                  <p key={idx} className="stuck-alert-desc">
                    Duration: {Math.round(s.duration)}s • Recovered by <strong>{s.recovery?.userName || 'Team Consensus'}</strong>
                  </p>
                ))}
              </div>
            ) : (
              <div style={{ marginTop: '1rem', fontSize: '0.85rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>✅ Continuous forward momentum — zero prolonged stagnation</span>
              </div>
            )}
          </div>

          {/* 6. AI Insights & Coaching */}
          <div className="card insights-card">
            <h3 className="card-title">🧠 AI Dynamics Coaching & Insights</h3>
            <div className="insights-columns">
              <div className="insight-col">
                <h4 style={{ color: '#10b981' }}>✅ Key Strengths</h4>
                <div className="insight-list">
                  {report.summary?.insights?.strengths?.map((s, i) => (
                    <div key={i} className="insight-item insight-strength">
                      {s}
                    </div>
                  ))}
                </div>
              </div>

              <div className="insight-col">
                <h4 style={{ color: '#f59e0b' }}>⚠️ Opportunities for Growth</h4>
                <div className="insight-list">
                  {report.summary?.insights?.improvements?.map((imp, i) => (
                    <div key={i} className="insight-item insight-improvement">
                      {imp}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
