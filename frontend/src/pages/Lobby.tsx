import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSocketEvent, useSocketEmit } from '../hooks/useSocket';
import { useAppStore } from '../store/useAppStore';
import '../styles/Lobby.css';

export default function Lobby() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  const emit = useSocketEmit();
  const store = useAppStore();

  useEffect(() => {
    if (!store.roomCode || store.roomCode !== roomCode) navigate('/');
  }, [store.roomCode, roomCode, navigate]);

  useSocketEvent<{ participants: any[] }>('participant_joined', (d) => store.setParticipants(d.participants));
  useSocketEvent<{ participants: any[] }>('participant_left', (d) => store.setParticipants(d.participants));
  useSocketEvent<{ timerRemaining: number; timerDuration: number; problemText?: string; topic?: string }>('session_started', (d) => {
    store.setRoomStatus('active');
    store.setTimer(d.timerRemaining, d.timerDuration * 60);
    if (d.problemText) store.setProblemText(d.problemText);
    if (d.topic) store.setSessionTopic(d.topic);
    navigate(`/workspace/${roomCode}`);
  });
  useSocketEvent<{ reason: string }>('room_closed', () => { alert('Room closed.'); store.reset(); navigate('/'); });
  useSocketEvent<{ newHostId: string; newHostName: string; participants: any[] }>('host_transferred', (d) => {
    store.updateHost(d.newHostId, d.newHostName);
    store.setParticipants(d.participants);
  });

  const isHost = store.myParticipant?.isHost === true;
  const canStart = isHost && store.participants.length >= 2;

  const handleStart = () => {
    emit('start_session', null, (r: any) => { if (r.error) alert(r.error); });
  };

  const copyCode = () => { if (roomCode) navigator.clipboard.writeText(roomCode); };

  if (!store.roomCode) return null;

  return (
    <div className="lobby-page">
      <div className="lobby-container">
        <div className="lobby-header">
          <div className="logo-small"><span>CollabLens</span></div>
          <button className="leave-btn" onClick={() => {
            emit('leave_room', null, () => {
              store.reset();
              navigate('/');
            });
          }}>Leave</button>
        </div>

        <div className="room-code-section">
          <p className="room-code-label">Room Code</p>
          <div className="room-code-display" onClick={copyCode} title="Click to copy">
            {roomCode?.split('').map((c, i) => <span key={i} className="code-char" style={{ animationDelay: `${i * 0.05}s` }}>{c}</span>)}
          </div>
          <p className="room-code-hint">Share this code with your team</p>
        </div>

        {store.sessionTopic && (
          <div className="topic-banner" style={{
            background: 'rgba(99, 102, 241, 0.1)',
            border: '1px solid rgba(99, 102, 241, 0.25)',
            borderRadius: '10px',
            padding: '10px 16px',
            margin: '0 0 16px 0',
            textAlign: 'center',
            color: 'rgba(0, 0, 0, 1)',
            fontSize: '0.95rem'
          }}>
            <span style={{ color: '#818cf8', fontWeight: 600, marginRight: '6px' }}>🎯 Topic:</span>
            {store.sessionTopic}
          </div>
        )}

        <div className="session-info">
          <div className="info-chip">⏱ {store.settings.timerDuration} min</div>
          <div className="info-chip">👥 {store.participants.length}/{store.settings.maxParticipants}</div>
          <div className="info-chip">Host: {store.hostName}</div>
        </div>

        <div className="participants-section">
          <h3>Participants ({store.participants.length})</h3>
          <div className="participants-grid">
            {store.participants.map((p, i) => (
              <div key={p.id} className={`participant-card ${p.id === store.myParticipant?.id ? 'is-me' : ''}`} style={{ animationDelay: `${i * 0.1}s` }}>
                <div className="participant-avatar" style={{ background: p.color }}>{p.name.charAt(0).toUpperCase()}</div>
                <div className="participant-info">
                  <span className="participant-name">{p.name}{p.id === store.myParticipant?.id && <span className="you-badge">You</span>}</span>
                  {p.isHost && <span className="host-badge">Host</span>}
                </div>
              </div>
            ))}
            {Array.from({ length: store.settings.maxParticipants - store.participants.length }).map((_, i) => (
              <div key={`e-${i}`} className="participant-card empty">
                <div className="participant-avatar empty-avatar">?</div>
                <span className="participant-name empty-name">Waiting...</span>
              </div>
            ))}
          </div>
        </div>

        <div className="lobby-actions">
          {isHost ? (
            <button className="start-btn" onClick={handleStart} disabled={!canStart}>
              {canStart ? `Start Session (${store.participants.length} participants)` : `Need at least 2 participants`}
            </button>
          ) : (
            <div className="waiting-indicator"><div className="pulse-dot" /><span>Waiting for {store.hostName} to start...</span></div>
          )}
        </div>
      </div>
    </div>
  );
}
