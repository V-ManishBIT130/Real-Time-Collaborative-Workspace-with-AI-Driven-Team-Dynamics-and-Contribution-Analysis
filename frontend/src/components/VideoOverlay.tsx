import { useState, useRef, useEffect, useCallback } from 'react';
import '../styles/VideoOverlay.css';

interface RemoteStream {
  peerId: string;
  peerName: string;
  stream: MediaStream;
}

interface VideoOverlayProps {
  localStream: MediaStream | null;
  remoteStreams: RemoteStream[];
  isCameraOn: boolean;
  isMicOn: boolean;
  isConnected: boolean;
  userName: string;
  userColor: string;
  onToggleCamera: () => void;
  onToggleMic: () => void;
  onLeaveCall: () => void;
  participants: Array<{ id: string; name: string; color: string }>;
}

// ─── Efficient draggable position hook ───
function useDraggable(initialX: number, initialY: number) {
  const [pos, setPos] = useState({ x: initialX, y: initialY });
  const posRef = useRef(pos);
  posRef.current = pos;

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    // Only drag on left click and ignore if clicked on a button or control
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;

    const startX = e.clientX - posRef.current.x;
    const startY = e.clientY - posRef.current.y;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const newX = Math.max(10, Math.min(window.innerWidth - 190, moveEvent.clientX - startX));
      const newY = Math.max(60, Math.min(window.innerHeight - 150, moveEvent.clientY - startY));
      setPos({ x: newX, y: newY });
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, []);

  return { pos, onMouseDown };
}

// ─── Single video tile ───
function VideoTile({
  stream,
  name,
  color,
  isMuted,
  isCameraOff,
  isLocal,
  initialX,
  initialY,
}: {
  stream: MediaStream | null;
  name: string;
  color: string;
  isMuted?: boolean;
  isCameraOff?: boolean;
  isLocal?: boolean;
  initialX: number;
  initialY: number;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { pos, onMouseDown } = useDraggable(initialX, initialY);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div
      className={`video-tile ${isLocal ? 'video-tile-local' : ''}`}
      style={{ left: pos.x, top: pos.y }}
      onMouseDown={onMouseDown}
    >
      {stream && !isCameraOff ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className="video-element"
        />
      ) : (
        <div className="video-avatar" style={{ background: color }}>
          <span className="video-avatar-letter">{name.charAt(0).toUpperCase()}</span>
        </div>
      )}

      {/* Name tag */}
      <div className="video-name-tag">
        {isMuted && (
          <svg className="mic-off-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
            <line x1="1" y1="1" x2="23" y2="23" />
            <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
            <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .48-.05.96-.13 1.42" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        )}
        <span>{isLocal ? 'You' : name}</span>
      </div>

      {/* Drag handle indicator */}
      <div className="video-drag-hint">⋮⋮</div>
    </div>
  );
}

// ─── Main overlay component ───
export default function VideoOverlay({
  localStream,
  remoteStreams,
  isCameraOn,
  isMicOn,
  isConnected,
  userName,
  userColor,
  onToggleCamera,
  onToggleMic,
  onLeaveCall,
  participants,
}: VideoOverlayProps) {
  if (!isConnected) return null;

  const defaultRightX = Math.max(10, window.innerWidth - 195);

  return (
    <div className="video-overlay-container">
      {/* Local video (self-view) — docked at top right */}
      <VideoTile
        stream={localStream}
        name={userName}
        color={userColor}
        isMuted={!isMicOn}
        isCameraOff={!isCameraOn}
        isLocal
        initialX={defaultRightX}
        initialY={65}
      />

      {/* Remote videos — stacked neatly below local video on the right */}
      {remoteStreams.map((rs, index) => {
        const participant = participants.find(p => p.id === rs.peerId);
        return (
          <VideoTile
            key={rs.peerId}
            stream={rs.stream}
            name={rs.peerName}
            color={participant?.color || '#6366f1'}
            isLocal={false}
            initialX={defaultRightX}
            initialY={65 + (index + 1) * 145}
          />
        );
      })}

      {/* Floating control bar — docked on the top-right above/beside tiles */}
      <div className="video-controls-bar">
        <button
          className={`video-ctrl-btn ${isCameraOn ? '' : 'off'}`}
          onClick={onToggleCamera}
          title={isCameraOn ? 'Turn off camera' : 'Turn on camera'}
        >
          {isCameraOn ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M23 7l-7 5 7 5V7z" />
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
            </svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          )}
        </button>

        <button
          className={`video-ctrl-btn ${isMicOn ? '' : 'off'}`}
          onClick={onToggleMic}
          title={isMicOn ? 'Mute microphone' : 'Unmute microphone'}
        >
          {isMicOn ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
              <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .48-.05.96-.13 1.42" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          )}
        </button>

        <button
          className="video-ctrl-btn end-call"
          onClick={onLeaveCall}
          title="Leave video call"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
            <line x1="23" y1="1" x2="1" y2="23" />
          </svg>
        </button>
      </div>
    </div>
  );
}

