import { useState, useEffect, useRef, useCallback } from 'react';
import { useSocketEvent, useSocketEmit } from './useSocket';

// ─────────────────────────────────────────────────────────────
// useWebRTC — WebRTC peer-to-peer video/audio hook
//
// Uses mesh topology: each participant connects to every other.
// Signaling is done via the existing Socket.IO connection.
// Audio/video streams go directly between browsers (P2P).
//
// STUN only for now (works on localhost / LAN / most NATs).
// TODO: Add TURN server for production cross-network support.
// ─────────────────────────────────────────────────────────────

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    // TODO (Production): Add TURN server for reliable cross-network connectivity
    // { urls: 'turn:your-turn-server.com:3478', username: '...', credential: '...' },
  ],
};

interface RemoteStream {
  peerId: string;
  peerName: string;
  stream: MediaStream;
}

interface UseWebRTCOptions {
  roomCode: string | undefined;
  userId: string | undefined;
  userName: string | undefined;
  participants: Array<{ id: string; name: string; color: string }>;
  isActive: boolean;
}

export function useWebRTC({ roomCode, userId, userName: _userName, participants, isActive }: UseWebRTCOptions) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<RemoteStream[]>([]);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isMicOn, setIsMicOn] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  const emit = useSocketEmit();
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const isMountedRef = useRef(true);
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());

  // ── Start local media (camera + mic) ──
  const startMedia = useCallback(async () => {
    // navigator.mediaDevices is only available in secure contexts (HTTPS or localhost).
    // When accessing via HTTP from another device (e.g. http://192.168.x.x:5173),
    // Chrome blocks all media APIs. This is a browser security policy.
    if (!navigator.mediaDevices?.getUserMedia) {
      console.warn(
        '[WebRTC] navigator.mediaDevices is unavailable. ' +
        'Media APIs require a secure context (HTTPS or localhost). ' +
        'Current origin: ' + window.location.origin
      );
      return null;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 320 },
          height: { ideal: 240 },
          frameRate: { ideal: 15, max: 24 },
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      if (!isMountedRef.current) {
        stream.getTracks().forEach(t => t.stop());
        return null;
      }

      localStreamRef.current = stream;
      setLocalStream(stream);
      setIsCameraOn(true);
      setIsMicOn(true);
      setIsConnected(true);
      return stream;
    } catch (err: any) {
      console.warn('[WebRTC] getUserMedia failed:', err.message);
      // Try audio only
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        if (!isMountedRef.current) {
          audioStream.getTracks().forEach(t => t.stop());
          return null;
        }
        localStreamRef.current = audioStream;
        setLocalStream(audioStream);
        setIsCameraOn(false);
        setIsMicOn(true);
        setIsConnected(true);
        return audioStream;
      } catch (audioErr: any) {
        console.warn('[WebRTC] Audio-only also failed:', audioErr.message);
        return null;
      }
    }
  }, []);

  // ── Create peer connection for a specific remote participant ──
  const createPeerConnection = useCallback((peerId: string, peerName: string) => {
    if (peerConnectionsRef.current.has(peerId)) {
      return peerConnectionsRef.current.get(peerId)!;
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);

    // Add local tracks to the connection
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    // Handle incoming remote tracks
    pc.ontrack = (event) => {
      if (!isMountedRef.current) return;
      const [remoteStream] = event.streams;
      if (remoteStream) {
        setRemoteStreams(prev => {
          const filtered = prev.filter(rs => rs.peerId !== peerId);
          return [...filtered, { peerId, peerName, stream: remoteStream }];
        });
      }
    };

    // Send ICE candidates to remote peer via signaling
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        emit('webrtc_ice_candidate', {
          to: peerId,
          candidate: event.candidate.toJSON(),
        });
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
        console.warn(`[WebRTC] ICE connection ${pc.iceConnectionState} with ${peerName}`);
      }
    };

    peerConnectionsRef.current.set(peerId, pc);
    return pc;
  }, [emit]);

  // ── Process any queued ICE candidates ──
  const flushPendingCandidates = useCallback((peerId: string) => {
    const pc = peerConnectionsRef.current.get(peerId);
    const pending = pendingCandidatesRef.current.get(peerId);
    if (pc && pending && pending.length > 0) {
      pending.forEach(candidate => {
        pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
      });
      pendingCandidatesRef.current.delete(peerId);
    }
  }, []);

  // ── Initiate connection to a specific peer (caller side) ──
  const connectToPeer = useCallback(async (peerId: string, peerName: string) => {
    const pc = createPeerConnection(peerId, peerName);

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      emit('webrtc_offer', {
        to: peerId,
        offer: pc.localDescription?.toJSON(),
      });
    } catch (err: any) {
      console.warn('[WebRTC] Failed to create offer:', err.message);
    }
  }, [createPeerConnection, emit]);

  // ── Handle incoming offer (callee side) ──
  useSocketEvent<{ from: string; fromName: string; offer: RTCSessionDescriptionInit }>(
    'webrtc_offer',
    async (data) => {
      if (!isMountedRef.current || !localStreamRef.current) return;

      const pc = createPeerConnection(data.from, data.fromName);

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        flushPendingCandidates(data.from);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        emit('webrtc_answer', {
          to: data.from,
          answer: pc.localDescription?.toJSON(),
        });
      } catch (err: any) {
        console.warn('[WebRTC] Failed to handle offer:', err.message);
      }
    }
  );

  // ── Handle incoming answer ──
  useSocketEvent<{ from: string; answer: RTCSessionDescriptionInit }>(
    'webrtc_answer',
    async (data) => {
      const pc = peerConnectionsRef.current.get(data.from);
      if (!pc) return;

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        flushPendingCandidates(data.from);
      } catch (err: any) {
        console.warn('[WebRTC] Failed to set answer:', err.message);
      }
    }
  );

  // ── Handle incoming ICE candidate ──
  useSocketEvent<{ from: string; candidate: RTCIceCandidateInit }>(
    'webrtc_ice_candidate',
    async (data) => {
      const pc = peerConnectionsRef.current.get(data.from);
      if (pc && pc.remoteDescription) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (err: any) {
          // Ignore duplicate candidate errors
        }
      } else {
        // Queue candidate — remote description not set yet
        const pending = pendingCandidatesRef.current.get(data.from) || [];
        pending.push(data.candidate);
        pendingCandidatesRef.current.set(data.from, pending);
      }
    }
  );

  // ── Handle peer disconnect ──
  useSocketEvent<{ userId: string }>('webrtc_peer_left', (data) => {
    const pc = peerConnectionsRef.current.get(data.userId);
    if (pc) {
      pc.close();
      peerConnectionsRef.current.delete(data.userId);
    }
    setRemoteStreams(prev => prev.filter(rs => rs.peerId !== data.userId));
  });

  // ── Handle new peer joining the call ──
  useSocketEvent<{ userId: string; userName: string }>('webrtc_peer_joined', (data) => {
    if (!isMountedRef.current || !localStreamRef.current) return;
    if (data.userId === userId) return; // Ignore self

    // The new joiner already sent us offers, but if we haven't
    // connected to them yet, initiate from our side too
    if (!peerConnectionsRef.current.has(data.userId)) {
      connectToPeer(data.userId, data.userName);
    }
  });

  // ── Join call: start media and connect to all existing participants ──
  const joinCall = useCallback(async () => {
    const stream = await startMedia();
    if (!stream || !userId) return;

    // Notify server we joined the call
    emit('webrtc_join', { roomCode });

    // Connect to all existing participants (we are the caller)
    participants
      .filter(p => p.id !== userId)
      .forEach(p => {
        connectToPeer(p.id, p.name);
      });
  }, [startMedia, userId, roomCode, participants, emit, connectToPeer]);

  // ── Leave call: close all connections and stop media ──
  const leaveCall = useCallback(() => {
    // Close all peer connections
    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();

    // Stop local media tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }

    setLocalStream(null);
    setRemoteStreams([]);
    setIsCameraOn(false);
    setIsMicOn(false);
    setIsConnected(false);

    emit('webrtc_leave', { roomCode });
  }, [roomCode, emit]);

  // ── Toggle camera ──
  const toggleCamera = useCallback(() => {
    if (!localStreamRef.current) return;
    const videoTracks = localStreamRef.current.getVideoTracks();
    videoTracks.forEach(track => {
      track.enabled = !track.enabled;
    });
    setIsCameraOn(prev => !prev);
  }, []);

  // ── Toggle mic (for WebRTC audio — separate from voice transcription) ──
  const toggleMic = useCallback(() => {
    if (!localStreamRef.current) return;
    const audioTracks = localStreamRef.current.getAudioTracks();
    audioTracks.forEach(track => {
      track.enabled = !track.enabled;
    });
    setIsMicOn(prev => !prev);
  }, []);

  // ── Mute/unmute mic programmatically (for voice transcription coordination) ──
  const setMicMuted = useCallback((muted: boolean) => {
    if (!localStreamRef.current) return;
    const audioTracks = localStreamRef.current.getAudioTracks();
    audioTracks.forEach(track => {
      track.enabled = !muted;
    });
    setIsMicOn(!muted);
  }, []);

  // ── Cleanup on unmount or session end ──
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      peerConnectionsRef.current.forEach(pc => pc.close());
      peerConnectionsRef.current.clear();
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
        localStreamRef.current = null;
      }
    };
  }, []);

  // Stop call when session becomes inactive
  useEffect(() => {
    if (!isActive && isConnected) {
      leaveCall();
    }
  }, [isActive, isConnected, leaveCall]);

  return {
    localStream,
    remoteStreams,
    isCameraOn,
    isMicOn,
    isConnected,
    joinCall,
    leaveCall,
    toggleCamera,
    toggleMic,
    setMicMuted,
  };
}
