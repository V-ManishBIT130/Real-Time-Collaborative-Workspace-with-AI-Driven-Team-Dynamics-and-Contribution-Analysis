import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSocketEvent, useSocketEmit } from '../hooks/useSocket';
import { useAppStore } from '../store/useAppStore';
import '../styles/Workspace.css';

export default function Workspace() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  const emit = useSocketEmit();
  const store = useAppStore();

  const [text, setText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!store.roomCode || store.roomCode !== roomCode) navigate('/');
  }, [store.roomCode, roomCode, navigate]);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [store.messages]);

  // Socket events
  useSocketEvent('new_message', (msg: any) => store.addMessage(msg));
  useSocketEvent<{ remaining: number; total: number }>('timer_tick', (d) => store.setTimer(d.remaining, d.total));
  useSocketEvent<{ participants: any[] }>('participant_joined', (d) => store.setParticipants(d.participants));
  useSocketEvent<{ participants: any[] }>('participant_left', (d) => store.setParticipants(d.participants));
  useSocketEvent('session_ended', (d: any) => {
    store.setRoomStatus('completed');
  });

  const handleSend = () => {
    if (!text.trim()) return;
    emit('send_message', { text: text.trim() });
    setText('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleEnd = () => {
    if (confirm('End the session for everyone?')) {
      emit('end_session', null, (r: any) => { if (r.error) alert(r.error); });
    }
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const timerPercent = store.timerTotal > 0 ? (store.timerRemaining / store.timerTotal) * 100 : 100;
  const isHost = store.myParticipant?.isHost === true;
  const isCompleted = store.roomStatus === 'completed';

  if (!store.roomCode) return null;

  return (
    <div className="workspace-page">
      {/* Top Bar */}
      <header className="workspace-header">
        <div className="header-left">
          <span className="ws-logo">CollabLens</span>
          <span className="ws-room-code">{roomCode}</span>
        </div>
        <div className="header-center">
          <div className={`timer-display ${store.timerRemaining <= 30 ? 'timer-danger' : store.timerRemaining <= 60 ? 'timer-warning' : ''}`}>
            <div className="timer-bar" style={{ width: `${timerPercent}%` }} />
            <span className="timer-text">
              {isCompleted ? '✅ Session Ended' : formatTime(store.timerRemaining)}
            </span>
          </div>
        </div>
        <div className="header-right">
          <div className="participant-avatars">
            {store.participants.map((p) => (
              <div key={p.id} className="mini-avatar" style={{ background: p.color }} title={p.name}>
                {p.name.charAt(0).toUpperCase()}
              </div>
            ))}
          </div>
          {isHost && !isCompleted && (
            <button className="end-btn" onClick={handleEnd}>End Session</button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="workspace-main">
        {/* Chat Panel */}
        <aside className="chat-panel">
          <div className="chat-header">
            <h3>💬 Team Chat</h3>
            <span className="msg-count">{store.messages.length} messages</span>
          </div>

          <div className="messages-container">
            {store.messages.length === 0 && (
              <div className="empty-chat">
                <p>No messages yet.</p>
                <small>Start collaborating with your team!</small>
              </div>
            )}
            {store.messages.map((msg) => {
              const isMe = msg.userId === store.myParticipant?.id;
              return (
                <div key={msg.id} className={`message ${isMe ? 'message-mine' : ''}`}>
                  {!isMe && (
                    <div className="message-avatar" style={{ background: msg.userColor }}>
                      {msg.userName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="message-content">
                    {!isMe && <span className="message-author" style={{ color: msg.userColor }}>{msg.userName}</span>}
                    <p className="message-text">{msg.text}</p>
                    <span className="message-time">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {!isCompleted ? (
            <div className="chat-input-area">
              <input
                ref={inputRef}
                type="text"
                placeholder="Type a message..."
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                maxLength={500}
                autoFocus
              />
              <button className="send-btn" onClick={handleSend} disabled={!text.trim()}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
          ) : (
            <div className="chat-ended">Session has ended. Messages are read-only.</div>
          )}
        </aside>

        {/* Main Area Placeholder */}
        <section className="main-area">
          <div className="placeholder-content">
            <div className="placeholder-icon">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.3">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M3 9h18" /><path d="M9 21V9" />
              </svg>
            </div>
            <h2>Workspace Area</h2>
            <p>Whiteboard & Code Editor will be added in Phase 3</p>
            <div className="phase-badges">
              <span className="badge active">Phase 2: Real-time Chat ✅</span>
              <span className="badge upcoming">Phase 3: Whiteboard</span>
              <span className="badge upcoming">Phase 3: Code Editor</span>
            </div>
          </div>

          {isCompleted && (
            <div className="session-summary">
              <h3>📊 Session Summary</h3>
              <div className="summary-stats">
                <div className="stat"><span className="stat-value">{store.messages.length}</span><span className="stat-label">Messages</span></div>
                <div className="stat"><span className="stat-value">{store.participants.length}</span><span className="stat-label">Participants</span></div>
                <div className="stat"><span className="stat-value">{store.settings.timerDuration}m</span><span className="stat-label">Duration</span></div>
              </div>
              <button className="primary-btn" onClick={() => { store.reset(); navigate('/'); }}>Back to Home</button>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
