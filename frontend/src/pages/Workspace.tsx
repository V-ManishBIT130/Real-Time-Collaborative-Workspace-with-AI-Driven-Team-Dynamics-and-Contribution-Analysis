import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSocketEvent, useSocketEmit } from '../hooks/useSocket';
import { useAppStore } from '../store/useAppStore';
import { useAuthStore } from '../store/useAuthStore';
import WhiteboardPanel from '../components/WhiteboardPanel';
import CodeEditorPanel from '../components/CodeEditorPanel';
import ToastContainer from '../components/ToastContainer';
import type { ToastNotification } from '../types/toast';
import '../styles/Workspace.css';

export default function Workspace() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  const emit = useSocketEmit();
  const store = useAppStore();
  const { user } = useAuthStore();

  const [text, setText] = useState('');
  const [toasts, setToasts] = useState<ToastNotification[]>([]);
  const [isProblemExpanded, setIsProblemExpanded] = useState(true);
  const [whiteboardElements, setWhiteboardElements] = useState<any[]>([]);
  const [codeContent, setCodeContent] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!store.roomCode || store.roomCode !== roomCode) navigate('/');
  }, [store.roomCode, roomCode, navigate]);

  // beforeunload — warn before closing tab during active session
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (store.roomStatus === 'active') {
        e.preventDefault();
        e.returnValue = 'You are in an active session. Are you sure you want to leave?';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [store.roomStatus]);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [store.messages]);

  // ─────────────────────────────────────
  // Toast helper (Google Meet style)
  // ─────────────────────────────────────
  const addToast = (toast: Omit<ToastNotification, 'id'>) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    setToasts((prev) => [...prev, { ...toast, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // ─────────────────────────────────────
  // Socket Events
  // ─────────────────────────────────────
  useSocketEvent('new_message', (msg: any) => store.addMessage(msg));
  useSocketEvent<{ remaining: number; total: number }>('timer_tick', (d) => store.setTimer(d.remaining, d.total));

  useSocketEvent<{ participant: any; participants: any[] }>('participant_joined', (d) => {
    store.setParticipants(d.participants);
    if (d.participant && d.participant.id !== user?._id) {
      addToast({
        userName: d.participant.name,
        userColor: d.participant.color,
        type: 'join',
        message: 'joined the session'
      });
    }
  });

  useSocketEvent<{ userId: string; userName: string; reason?: string; participants: any[] }>('participant_left', (d) => {
    store.setParticipants(d.participants);
    if (d.userId && d.userId !== user?._id && d.userName) {
      const reason = d.reason === 'kicked' ? 'was removed from the session' :
                     d.reason === 'disconnected' ? 'lost connection' :
                     'left the session';
      addToast({
        userName: d.userName,
        type: 'leave',
        message: reason
      });
    }
  });

  useSocketEvent('session_ended', () => {
    store.setRoomStatus('completed');
  });

  // Knock request — host sees admission toast
  useSocketEvent<{ userId: string; userName: string; userColor: string }>('knock_request', (d) => {
    store.addPendingKnock(d);
    addToast({
      userName: d.userName,
      userColor: d.userColor,
      type: 'knock' as any,
      message: 'wants to rejoin'
    });
  });

  // Host transfer
  useSocketEvent<{ newHostId: string; newHostName: string; participants: any[] }>('host_transferred', (d) => {
    store.updateHost(d.newHostId, d.newHostName);
    store.setParticipants(d.participants);
    if (d.newHostId === user?._id) {
      addToast({
        userName: 'You',
        type: 'join',
        message: 'are now the host'
      });
    } else {
      addToast({
        userName: d.newHostName,
        type: 'join',
        message: 'is now the host'
      });
    }
  });

  // Kicked
  useSocketEvent<{ message: string }>('you_were_kicked', (d) => {
    alert(d.message);
    store.reset();
    navigate('/');
  });

  // Reconnection — restore full state
  useSocketEvent<any>('reconnected', (d) => {
    store.setParticipants(d.participants);
    store.setMessages(d.messages || []);
    store.setTimer(d.timerRemaining || 0, d.timerTotal || 0);
    store.setRoomStatus(d.status || 'active');
    store.setProblemText(d.problemText || '');
    store.setCodeLanguage(d.codeLanguage || 'javascript');
    if (d.whiteboardElements) setWhiteboardElements(d.whiteboardElements);
    if (d.codeContent) setCodeContent(d.codeContent);
  });

  // Problem text from session start
  useSocketEvent<{ problemText?: string }>('session_started', (d) => {
    if (d.problemText) store.setProblemText(d.problemText);
  });

  // ─────────────────────────────────────
  // Handlers
  // ─────────────────────────────────────
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

  const handleLeave = () => {
    if (confirm('Leave the session? You can request to rejoin later.')) {
      emit('leave_room', null, () => {
        store.reset();
        navigate('/');
      });
    }
  };

  const handleAdmit = (userId: string) => {
    emit('admit_participant', { userId }, (r: any) => {
      if (r?.error) alert(r.error);
    });
    store.removePendingKnock(userId);
  };

  const handleDeny = (userId: string) => {
    emit('deny_participant', { userId }, (r: any) => {
      if (r?.error) alert(r.error);
    });
    store.removePendingKnock(userId);
  };

  const handleKick = (userId: string, userName: string) => {
    if (confirm(`Remove ${userName} from the session?`)) {
      emit('kick_participant', { userId }, (r: any) => {
        if (r?.error) alert(r.error);
      });
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
      {/* Google Meet style Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Pending Knock Admission Bar (Host only) */}
      {isHost && store.pendingKnocks.length > 0 && (
        <div className="knock-bar">
          {store.pendingKnocks.map((knock) => (
            <div key={knock.userId} className="knock-item">
              <div className="knock-avatar" style={{ background: knock.userColor }}>
                {knock.userName.charAt(0).toUpperCase()}
              </div>
              <span className="knock-name">{knock.userName}</span>
              <span className="knock-label">wants to rejoin</span>
              <button className="knock-accept" onClick={() => handleAdmit(knock.userId)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Accept
              </button>
              <button className="knock-deny" onClick={() => handleDeny(knock.userId)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
                Deny
              </button>
            </div>
          ))}
        </div>
      )}

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
              <div
                key={p.id}
                className={`mini-avatar ${isHost && p.id !== user?._id ? 'kickable' : ''}`}
                style={{ background: p.color }}
                title={`${p.name}${p.isHost ? ' (Host)' : ''}`}
                onClick={() => {
                  if (isHost && p.id !== user?._id && !isCompleted) handleKick(p.id, p.name);
                }}
              >
                {p.name.charAt(0).toUpperCase()}
                {p.isHost && <span className="host-crown">👑</span>}
              </div>
            ))}
          </div>
          {isHost && !isCompleted && (
            <button className="end-btn" onClick={handleEnd}>End Session</button>
          )}
          {!isHost && !isCompleted && (
            <button className="leave-btn" onClick={handleLeave}>Leave</button>
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
              const isMe = msg.userId === user?._id;
              return (
                <div key={msg.id} className={`message ${isMe ? 'message-mine' : ''}`}>
                  {!isMe && (
                    <div className="message-avatar" style={{ background: msg.userColor }}>
                      {msg.userName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="message-content">
                    {!isMe && <span className="message-author" style={{ color: msg.userColor }}>{msg.userName}</span>}
                    <p className="message-text">
                      {msg.source === 'voice' && <span className="voice-badge">🎙</span>}
                      {msg.text}
                    </p>
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

        {/* Main Workspace Area */}
        <section className="main-area">
          {/* Problem Display Banner */}
          {store.problemText && (
            <div className={`problem-banner ${isProblemExpanded ? 'expanded' : 'collapsed'}`}>
              <button className="problem-toggle" onClick={() => setIsProblemExpanded(!isProblemExpanded)}>
                <span className="problem-icon">📋</span>
                <span className="problem-title">Problem Statement</span>
                <svg
                  className={`chevron ${isProblemExpanded ? 'up' : 'down'}`}
                  width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {isProblemExpanded && (
                <div className="problem-body">
                  <p>{store.problemText}</p>
                </div>
              )}
            </div>
          )}

          {/* Tab Bar */}
          <div className="workspace-tabs">
            <button
              className={`workspace-tab ${store.activeTab === 'whiteboard' ? 'active' : ''}`}
              onClick={() => store.setActiveTab('whiteboard')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M3 9h18" /><path d="M9 21V9" />
              </svg>
              Whiteboard
            </button>
            <button
              className={`workspace-tab ${store.activeTab === 'code' ? 'active' : ''}`}
              onClick={() => store.setActiveTab('code')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
              </svg>
              Code Editor
            </button>
          </div>

          {/* Tab Content */}
          <div className="workspace-tab-content">
            <div className="tab-panel" style={{ display: store.activeTab === 'whiteboard' ? 'flex' : 'none' }}>
              <WhiteboardPanel
                isReadOnly={isCompleted}
                initialElements={whiteboardElements}
              />
            </div>
            <div className="tab-panel" style={{ display: store.activeTab === 'code' ? 'flex' : 'none' }}>
              <CodeEditorPanel
                isReadOnly={isCompleted}
                initialContent={codeContent}
                initialLanguage={store.codeLanguage}
              />
            </div>
          </div>

          {/* Session Summary (shown when completed) */}
          {isCompleted && (
            <div className="session-summary">
              <h3>📊 Session Complete</h3>
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
