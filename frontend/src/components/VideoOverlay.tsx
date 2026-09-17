import { useRef, useEffect, useState, useCallback } from 'react';
import '../styles/VideoOverlay.css';

export interface RemoteStream {
  peerId: string;
  peerName: string;
  stream: MediaStream;
}

interface VideoOverlayProps {
  localStream: MediaStream | null;
  remoteStreams: RemoteStream[];
  remoteCameraStates: Record<string, boolean>;
  remoteMicStates?: Record<string, boolean>;
  isCameraOn: boolean;
  isMicOn: boolean;
  isConnected: boolean;
  userName: string;
  userColor: string;
  onToggleCamera: () => void;
  onToggleMic: () => void;
  onLeaveCall?: () => void;
  participants: Array<{ id: string; name: string; color: string }>;
}

// ─── Continuous Audio Player for Remote Peers ───
function RemoteAudio({ stream, peerName }: { stream: MediaStream; peerName: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const el = audioRef.current;
    if (el && stream) {
      if (el.srcObject !== stream) {
        el.srcObject = stream;
      }
      el.play().catch((err) => {
        if (err.name !== 'AbortError') {
          console.debug(`[WebRTC] Audio playback note for ${peerName}:`, err.message);
        }
      });
    }
  }, [stream, peerName]);

  return (
    <audio
      ref={audioRef}
      autoPlay
      playsInline
      style={{ position: 'fixed', opacity: 0, pointerEvents: 'none', width: '1px', height: '1px' }}
    />
  );
}

// ─── Lightweight Draggable Hook with Viewport Bounds ───
function useDraggable(initialX: number, initialY: number, positionKey: string) {
  const [pos, setPos] = useState({ x: initialX, y: initialY });
  const posRef = useRef(pos);
  const prevKeyRef = useRef(positionKey);
  posRef.current = pos;

  // Reset position when the layout key changes (e.g. a new tile inserted above/below)
  useEffect(() => {
    if (prevKeyRef.current !== positionKey) {
      prevKeyRef.current = positionKey;
      // Only reset if user hasn't dragged (position is still at previous initial)
      setPos({ x: initialX, y: initialY });
    }
  }, [positionKey, initialX, initialY]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;

    const startX = e.clientX - posRef.current.x;
    const startY = e.clientY - posRef.current.y;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const newX = Math.max(10, Math.min(window.innerWidth - 195, moveEvent.clientX - startX));
      const newY = Math.max(60, Math.min(window.innerHeight - 155, moveEvent.clientY - startY));
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

// ─── Video Tile (Displays live camera feed or avatar fallback) ───
function VideoTile({
  stream,
  name,
  color,
  hasCamera,
  isMuted,
  isLocal,
  initialX,
  initialY,
  positionKey,
}: {
  stream: MediaStream | null;
  name: string;
  color: string;
  hasCamera: boolean;
  isMuted?: boolean;
  isLocal?: boolean;
  initialX: number;
  initialY: number;
  positionKey: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { pos, onMouseDown } = useDraggable(initialX, initialY, positionKey);

  useEffect(() => {
    const el = videoRef.current;
    if (el && stream && hasCamera) {
      if (el.srcObject !== stream) {
        el.srcObject = stream;
      }
      el.play().catch((err) => {
        if (err.name !== 'AbortError') {
          console.debug(`[WebRTC] Video playback note for ${name}:`, err.message);
        }
      });
    }
  }, [stream, hasCamera, name]);

  const initial = name ? name.charAt(0).toUpperCase() : '?';

  return (
    <div
      className={`video-tile ${isLocal ? 'video-tile-local' : ''} ${!isMuted ? 'speaking' : ''}`}
      style={{ left: pos.x, top: pos.y }}
      onMouseDown={onMouseDown}
    >
      {hasCamera && stream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`video-element ${isLocal ? 'video-mirror' : ''}`}
          onLoadedMetadata={() => {
            videoRef.current?.play().catch(() => {});
          }}
        />
      ) : (
        <div className="video-avatar" style={{ background: `radial-gradient(circle at center, ${color}33 0%, #151528 100%)` }}>
          <div className="video-avatar-circle" style={{ background: color }}>
            {initial}
          </div>
        </div>
      )}

      {/* Name and audio status badge */}
      <div className="video-name-tag">
        <span className={`mic-indicator ${isMuted ? 'muted' : 'active'}`}>
          {isMuted ? (
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
              <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .48-.05.96-.13 1.42" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          ) : (
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          )}
        </span>
        <span className="video-name-text">{isLocal ? 'You' : name}</span>
      </div>

      {/* Drag handle hint */}
      <div className="video-drag-hint">⋮⋮</div>
    </div>
  );
}

// ─── Main Video Overlay Component ───
export default function VideoOverlay({
  localStream,
  remoteStreams,
  remoteCameraStates,
  remoteMicStates = {},
  isCameraOn,
  isMicOn,
  userName,
  userColor,
  participants,
}: VideoOverlayProps) {
  const defaultRightX = Math.max(10, window.innerWidth - 195);

  // Identify remote peers with active media or camera
  const remotePeersToShow = participants.filter((p) => {
    const isCamera = remoteCameraStates[p.id] === true;
    const isMic = remoteMicStates[p.id] === true;
    const hasStream = remoteStreams.some((rs) => rs.peerId === p.id);
    return isCamera || isMic || hasStream;
  });

  const shouldRenderOverlay = isCameraOn || isMicOn || remotePeersToShow.length > 0;

  return (
    <>
      {/* ── Background Audio for ALL Remote Streams ── */}
      <div className="remote-audio-container">
        {remoteStreams.map((rs) => (
          <RemoteAudio key={`audio_${rs.peerId}`} stream={rs.stream} peerName={rs.peerName} />
        ))}
      </div>

      {/* ── Video Overlay Tiles (Google Meet / Teams Floating Grid) ── */}
      {shouldRenderOverlay && (
        <div className="video-overlay-container">
          {/* Local self tile — shown when local camera or mic is active */}
          {(isCameraOn || isMicOn) && (
            <VideoTile
              stream={localStream}
              name={userName}
              color={userColor}
              hasCamera={isCameraOn}
              isMuted={!isMicOn}
              isLocal
              initialX={defaultRightX}
              initialY={65}
              positionKey={`local_${remotePeersToShow.length}`}
            />
          )}

          {/* Remote tiles — stacked below local with 150px spacing */}
          {remotePeersToShow.map((p, index) => {
            const remoteEntry = remoteStreams.find((rs) => rs.peerId === p.id);
            const hasCamera = remoteCameraStates[p.id] === true;
            const isMuted = remoteMicStates[p.id] === false;
            const slotIndex = (isCameraOn || isMicOn) ? index + 1 : index;
            const yOffset = slotIndex * 150;

            return (
              <VideoTile
                key={p.id}
                stream={remoteEntry?.stream || null}
                name={p.name}
                color={p.color || '#6366f1'}
                hasCamera={hasCamera}
                isMuted={isMuted}
                isLocal={false}
                initialX={defaultRightX}
                initialY={65 + yOffset}
                positionKey={`${p.id}_slot${slotIndex}_of${remotePeersToShow.length}`}
              />
            );
          })}
        </div>
      )}
    </>
  );
}
