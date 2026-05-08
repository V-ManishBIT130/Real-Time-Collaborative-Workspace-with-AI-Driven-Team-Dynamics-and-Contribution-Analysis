import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSocketEmit } from '../hooks/useSocket';
import { useAppStore } from '../store/useAppStore';
import '../styles/Home.css';

export default function Home() {
  const navigate = useNavigate();
  const emit = useSocketEmit();

  const [mode, setMode] = useState<'select' | 'create' | 'join'>('select');
  const [userName, setUserNameInput] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [timerDuration, setTimerDuration] = useState(15);
  const [maxParticipants, setMaxParticipants] = useState(5);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { setUserName, setRoom, setParticipants } = useAppStore();

  const handleCreate = () => {
    if (!userName.trim()) return setError('Please enter your name');
    setError('');
    setLoading(true);

    emit('create_room', { userName: userName.trim(), timerDuration, maxParticipants },
      (res: { success?: boolean; roomCode?: string; participant?: any; error?: string }) => {
        setLoading(false);
        if (res.error) return setError(res.error);
        if (res.success && res.roomCode && res.participant) {
          setUserName(userName.trim());
          setRoom({
            roomCode: res.roomCode,
            hostName: userName.trim(),
            settings: { timerDuration, maxParticipants },
            myParticipant: res.participant,
          });
          setParticipants([res.participant]);
          navigate(`/lobby/${res.roomCode}`);
        }
      }
    );
  };

  const handleJoin = () => {
    if (!userName.trim()) return setError('Please enter your name');
    if (!roomCode.trim()) return setError('Please enter a room code');
    setError('');
    setLoading(true);

    emit('join_room', { roomCode: roomCode.trim(), userName: userName.trim() },
      (res: { success?: boolean; room?: any; participant?: any; error?: string }) => {
        setLoading(false);
        if (res.error) return setError(res.error);
        if (res.success && res.room) {
          setUserName(userName.trim());
          setRoom({
            roomCode: res.room.roomCode,
            hostName: res.room.hostName,
            settings: res.room.settings,
            myParticipant: res.participant,
          });
          setParticipants(res.room.participants);
          navigate(`/lobby/${res.room.roomCode}`);
        }
      }
    );
  };

  return (
    <div className="home-page">
      {/* Animated background particles */}
      <div className="bg-particles">
        {Array.from({ length: 20 }).map((_, i) => (
          <div key={i} className="particle" style={{
            left: `${Math.random() * 100}%`,
            animationDelay: `${Math.random() * 8}s`,
            animationDuration: `${6 + Math.random() * 8}s`,
          }} />
        ))}
      </div>

      <div className="home-container">
        {/* Header */}
        <div className="home-header">
          <div className="logo-icon">
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
              <circle cx="20" cy="12" r="4" fill="#6366f1" />
              <circle cx="10" cy="28" r="4" fill="#f43f5e" />
              <circle cx="30" cy="28" r="4" fill="#10b981" />
              <line x1="20" y1="16" x2="10" y2="24" stroke="#6366f1" strokeWidth="2" opacity="0.5" />
              <line x1="20" y1="16" x2="30" y2="24" stroke="#10b981" strokeWidth="2" opacity="0.5" />
              <line x1="14" y1="28" x2="26" y2="28" stroke="#f43f5e" strokeWidth="2" opacity="0.5" />
            </svg>
          </div>
          <h1 className="logo-text">Collab<span>Lens</span></h1>
          <p className="tagline">Real-time collaborative workspace with AI-driven team dynamics</p>
        </div>

        {/* Mode Selection */}
        {mode === 'select' && (
          <div className="mode-select">
            <button className="mode-btn create-btn" onClick={() => setMode('create')}>
              <div className="mode-btn-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="16" />
                  <line x1="8" y1="12" x2="16" y2="12" />
                </svg>
              </div>
              <span>Create Room</span>
              <small>Start a new collaboration session</small>
            </button>
            <button className="mode-btn join-btn" onClick={() => setMode('join')}>
              <div className="mode-btn-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                  <polyline points="10 17 15 12 10 7" />
                  <line x1="15" y1="12" x2="3" y2="12" />
                </svg>
              </div>
              <span>Join Room</span>
              <small>Enter an existing room code</small>
            </button>
          </div>
        )}

        {/* Create Room Form */}
        {mode === 'create' && (
          <div className="form-card">
            <button className="back-btn" onClick={() => { setMode('select'); setError(''); }}>
              ← Back
            </button>
            <h2>Create a Room</h2>
            
            <div className="form-group">
              <label htmlFor="create-name">Your Name</label>
              <input
                id="create-name"
                type="text"
                placeholder="Enter your name"
                value={userName}
                onChange={(e) => setUserNameInput(e.target.value)}
                maxLength={30}
                autoFocus
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="timer-duration">Timer (min)</label>
                <select id="timer-duration" value={timerDuration} onChange={(e) => setTimerDuration(Number(e.target.value))}>
                  <option value={1}>1 min</option>
                  <option value={5}>5 min</option>
                  <option value={10}>10 min</option>
                  <option value={15}>15 min</option>
                  <option value={20}>20 min</option>
                  <option value={30}>30 min</option>
                  <option value={45}>45 min</option>
                  <option value={60}>60 min</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="max-participants">Max People</label>
                <select id="max-participants" value={maxParticipants} onChange={(e) => setMaxParticipants(Number(e.target.value))}>
                  {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                    <option key={n} value={n}>{n} people</option>
                  ))}
                </select>
              </div>
            </div>

            {error && <p className="error-msg">{error}</p>}

            <button
              className="primary-btn"
              onClick={handleCreate}
              disabled={loading}
            >
              {loading ? 'Creating...' : 'Create Room'}
            </button>
          </div>
        )}

        {/* Join Room Form */}
        {mode === 'join' && (
          <div className="form-card">
            <button className="back-btn" onClick={() => { setMode('select'); setError(''); }}>
              ← Back
            </button>
            <h2>Join a Room</h2>

            <div className="form-group">
              <label htmlFor="join-name">Your Name</label>
              <input
                id="join-name"
                type="text"
                placeholder="Enter your name"
                value={userName}
                onChange={(e) => setUserNameInput(e.target.value)}
                maxLength={30}
                autoFocus
              />
            </div>

            <div className="form-group">
              <label htmlFor="room-code-input">Room Code</label>
              <input
                id="room-code-input"
                type="text"
                placeholder="e.g. ABC123"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                maxLength={6}
                className="room-code-input"
              />
            </div>

            {error && <p className="error-msg">{error}</p>}

            <button
              className="primary-btn"
              onClick={handleJoin}
              disabled={loading}
            >
              {loading ? 'Joining...' : 'Join Room'}
            </button>
          </div>
        )}

        <p className="demo-note">
          🔧 Demo Mode — JWT authentication will be added in Phase 1
        </p>
      </div>
    </div>
  );
}
