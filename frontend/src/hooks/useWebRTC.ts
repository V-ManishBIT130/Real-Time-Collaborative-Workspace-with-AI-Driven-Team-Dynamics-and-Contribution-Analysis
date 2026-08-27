import { useState, useEffect, useRef, useCallback } from 'react';
import { useSocketEvent, useSocketEmit } from './useSocket';
import { apiFetch } from '../utils/api';

// ─────────────────────────────────────────────────────────────
// useWebRTC — WebRTC full-mesh peer-to-peer audio/video engine
//
// Features:
// - W3C Perfect Negotiation (glare-free offer/answer cycle)
// - Dynamic mesh synchronization (deadlock-free connection for 3+ peers)
// - Hardware camera release on camera off (turns off webcam LED)
// - Mute/unmute without redundant SDP renegotiation storms
// - Multi-STUN & TURN fallback configuration
// - Automatic ICE restart and connection recovery
// ─────────────────────────────────────────────────────────────

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:global.stun.twilio.com:3478' },
  { urls: 'stun:stun.services.mozilla.com' },
  {
    urls: [
      'turn:openrelay.metered.ca:80',
      'turn:openrelay.metered.ca:443',
      'turn:openrelay.metered.ca:443?transport=tcp',
      'turns:openrelay.metered.ca:443',
      'turns:openrelay.metered.ca:443?transport=tcp',
    ],
    username: 'openrelay',
    credential: 'openrelay',
  },
];

export interface WebRTCDiagnostic {
  code: 'connection-failed' | 'connection-interrupted' | 'media-permission' | 'media-unavailable';
  message: string;
  peerName?: string;
}

export interface RemoteStream {
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
  onDiagnostic?: (diagnostic: WebRTCDiagnostic) => void;
}

export function useWebRTC({
  roomCode,
  userId,
  userName: _userName,
  participants,
  isActive,
  onDiagnostic,
}: UseWebRTCOptions) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<RemoteStream[]>([]);
  const [remoteCameraStates, setRemoteCameraStates] = useState<Record<string, boolean>>({});
  const [remoteMicStates, setRemoteMicStates] = useState<Record<string, boolean>>({});
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isMicOn, setIsMicOn] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  const emit = useSocketEmit();
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const isMountedRef = useRef(true);
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const makingOfferRef = useRef<Map<string, boolean>>(new Map());
  const pendingOffersRef = useRef<Map<string, { peerName: string; iceRestart: boolean }>>(new Map());
  const iceServersRef = useRef<RTCIceServer[]>(DEFAULT_ICE_SERVERS);
  const iceServersLoadRef = useRef<Promise<void> | null>(null);
  const peerDisconnectTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const diagnosticsRef = useRef(onDiagnostic);
  const reportedDiagnosticsRef = useRef<Set<string>>(new Set());
  const participantsRef = useRef(participants);
  participantsRef.current = participants;

  diagnosticsRef.current = onDiagnostic;

  const reportDiagnostic = useCallback((diagnostic: WebRTCDiagnostic) => {
    const key = `${diagnostic.code}:${diagnostic.peerName || ''}`;
    if (reportedDiagnosticsRef.current.has(key)) return;

    reportedDiagnosticsRef.current.add(key);
    console.warn(`[WebRTC] ${diagnostic.code}: ${diagnostic.message}`, diagnostic.peerName || '');
    diagnosticsRef.current?.(diagnostic);
    window.setTimeout(() => reportedDiagnosticsRef.current.delete(key), 15000);
  }, []);

  // Keep outbound voice bitrate stable to reduce choppy audio on variable links.
  const tuneAudioSender = useCallback(async (pc: RTCPeerConnection, peerId: string) => {
    const sender = pc.getSenders().find((s) => s.track?.kind === 'audio');
    if (!sender) return;

    try {
      const params = sender.getParameters();
      const encodings = params.encodings && params.encodings.length > 0
        ? [...params.encodings]
        : [{} as RTCRtpEncodingParameters];

      encodings[0] = {
        ...encodings[0],
        maxBitrate: 32000,
      };

      await sender.setParameters({
        ...params,
        encodings,
      });
    } catch (err: any) {
      console.debug(`[WebRTC] Audio sender tuning note for ${peerId}:`, err.message);
    }
  }, []);

  const loadIceServers = useCallback(() => {
    if (!iceServersLoadRef.current) {
      iceServersLoadRef.current = (async () => {
        try {
          const response = await apiFetch('/api/webrtc/ice-servers');
          if (!response.ok) throw new Error(`HTTP ${response.status}`);

          const payload = await response.json() as { iceServers?: RTCIceServer[] };
          if (Array.isArray(payload.iceServers) && payload.iceServers.length > 0) {
            iceServersRef.current = payload.iceServers;
            console.info('[WebRTC] ICE configuration loaded successfully.');
          }
        } catch (err) {
          console.warn('[WebRTC] Using default ICE servers fallback.', err);
        }
      })();
    }
    return iceServersLoadRef.current;
  }, []);

  // ── Helper to ensure local stream container exists ──
  const getOrCreateLocalStream = useCallback(() => {
    if (!localStreamRef.current) {
      const ms = new MediaStream();
      localStreamRef.current = ms;
      setLocalStream(ms);
    }
    return localStreamRef.current;
  }, []);

  // ── Flush queued ICE candidates ──
  const flushPendingCandidates = useCallback((peerId: string) => {
    const pc = peerConnectionsRef.current.get(peerId);
    const pending = pendingCandidatesRef.current.get(peerId);
    if (pc && pc.remoteDescription && pending && pending.length > 0) {
      console.log(`[WebRTC] Flushing ${pending.length} pending ICE candidates for peer ${peerId}`);
      pending.forEach((candidate) => {
        pc.addIceCandidate(new RTCIceCandidate(candidate)).catch((err) => {
          console.debug('[WebRTC] addIceCandidate note:', err.message);
        });
      });
      pendingCandidatesRef.current.delete(peerId);
    }
  }, []);

  // ── Drain any queued offer after signaling returns to stable ──
  const drainPendingOffer = useCallback((peerId: string) => {
    const queued = pendingOffersRef.current.get(peerId);
    const pc = peerConnectionsRef.current.get(peerId);
    if (queued && pc && pc.signalingState === 'stable') {
      pendingOffersRef.current.delete(peerId);
      window.setTimeout(() => {
        createOfferAndSend(peerId, queued.peerName, queued.iceRestart);
      }, 50);
    }
  }, []);

  // ── Create or retrieve peer connection with active transceivers ──
  const createPeerConnection = useCallback((peerId: string, peerName: string) => {
    if (peerConnectionsRef.current.has(peerId)) {
      return peerConnectionsRef.current.get(peerId)!;
    }

    console.log(`[WebRTC] Creating RTCPeerConnection for peer ${peerName} (${peerId})`);
    const pc = new RTCPeerConnection({
      iceServers: iceServersRef.current,
      iceCandidatePoolSize: 2,
    });

    const currentStream = localStreamRef.current;
    const localAudioTrack = currentStream?.getAudioTracks()[0];
    const localVideoTrack = currentStream?.getVideoTracks()[0];

    // Initialize audio transceiver with sendrecv
    if (localAudioTrack) {
      pc.addTransceiver(localAudioTrack, { direction: 'sendrecv', streams: [currentStream!] });
    } else {
      pc.addTransceiver('audio', { direction: 'sendrecv' });
    }

    void tuneAudioSender(pc, peerId);

    // Initialize video transceiver with sendrecv
    if (localVideoTrack) {
      pc.addTransceiver(localVideoTrack, { direction: 'sendrecv', streams: [currentStream!] });
    } else {
      pc.addTransceiver('video', { direction: 'sendrecv' });
    }

    // ── Helper: ensure a receiver track is added to the remote streams state ──
    const syncReceiverTrack = (track: MediaStreamTrack, source: string) => {
      if (!isMountedRef.current) return;
      console.info(`[WebRTC] syncReceiverTrack(${track.kind}, id=${track.id.slice(0,8)}) from ${peerName} [${source}] readyState=${track.readyState} muted=${track.muted}`);

      if (track.kind === 'video' && !track.muted && track.readyState === 'live') {
        setRemoteCameraStates((prev) => ({ ...prev, [peerId]: true }));
      }

      setRemoteStreams((prev) => {
        const existing = prev.find((rs) => rs.peerId === peerId);

        if (existing) {
          const stream = existing.stream;
          // Replace any same-kind track if it's a different track object
          const oldTrack = stream.getTracks().find((t) => t.kind === track.kind && t.id !== track.id);
          if (oldTrack) {
            stream.removeTrack(oldTrack);
            console.info(`[WebRTC] Replaced old ${track.kind} track (${oldTrack.id.slice(0,8)}) with new (${track.id.slice(0,8)}) for ${peerName}`);
          }
          if (!stream.getTracks().some((t) => t.id === track.id)) {
            stream.addTrack(track);
            console.info(`[WebRTC] Added ${track.kind} track (${track.id.slice(0,8)}) to existing stream for ${peerName}`);
          }
          // Return a new array reference to trigger React re-render
          return [...prev];
        } else {
          const newStream = new MediaStream([track]);
          console.info(`[WebRTC] Created new remote stream for ${peerName} with ${track.kind} track`);
          return [...prev, { peerId, peerName, stream: newStream }];
        }
      });
    };

    // Handle incoming remote tracks
    pc.ontrack = (event) => {
      if (!isMountedRef.current) return;
      const { track } = event;
      console.info(`[WebRTC] ontrack fired: ${track.kind} track from ${peerName} (id=${track.id.slice(0,8)}, readyState=${track.readyState}, muted=${track.muted})`);

      syncReceiverTrack(track, 'ontrack');

      track.onunmute = () => {
        console.info(`[WebRTC] Remote ${track.kind} track is live from ${peerName} (unmuted)`);
        if (track.kind === 'video') {
          setRemoteCameraStates((prev) => ({ ...prev, [peerId]: true }));
        }
        // Re-sync on unmute to ensure the track is in remoteStreams
        syncReceiverTrack(track, 'onunmute');
      };

      track.onmute = () => {
        console.info(`[WebRTC] Remote ${track.kind} track muted from ${peerName}`);
        if (track.kind === 'video') {
          setRemoteCameraStates((prev) => ({ ...prev, [peerId]: false }));
        }
      };

      track.onended = () => {
        console.info(`[WebRTC] Remote ${track.kind} track ended from ${peerName}`);
        if (track.kind === 'video') {
          setRemoteCameraStates((prev) => ({ ...prev, [peerId]: false }));
        }
      };
    };

    // Relay local ICE candidates to peer
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        emit('webrtc_ice_candidate', {
          to: peerId,
          roomCode,
          candidate: event.candidate.toJSON(),
        });
      }
    };

    pc.onicecandidateerror = (_event) => {
      // Benign candidate lookup warnings (e.g. unreachable port / local interface)
    };

    pc.oniceconnectionstatechange = () => {
      console.info(`[WebRTC] ICE state with ${peerName}: ${pc.iceConnectionState}`);
      if (pc.iceConnectionState === 'failed') {
        reportDiagnostic({
          code: 'connection-failed',
          peerName,
          message: `Reconnecting call with ${peerName}…`,
        });
        // Auto-recover via ICE restart
        if (userId && userId < peerId) {
          createOfferAndSend(peerId, peerName, true);
        } else {
          emit('webrtc_renegotiate_request', { to: peerId, roomCode, iceRestart: true });
        }
      }
    };

    pc.onconnectionstatechange = () => {
      console.info(`[WebRTC] Peer connection state with ${peerName}: ${pc.connectionState}`);
      const existingTimer = peerDisconnectTimersRef.current.get(peerId);

      if (pc.connectionState === 'connected') {
        if (existingTimer) clearTimeout(existingTimer);
        peerDisconnectTimersRef.current.delete(peerId);
        return;
      }

      if (pc.connectionState === 'disconnected' && !existingTimer) {
        const timer = setTimeout(() => {
          peerDisconnectTimersRef.current.delete(peerId);
          if (pc.connectionState !== 'disconnected') return;
          reportDiagnostic({
            code: 'connection-interrupted',
            peerName,
            message: `Connection to ${peerName} is interrupted. Reconnecting call…`,
          });
          if (userId && userId < peerId) {
            createOfferAndSend(peerId, peerName, true);
          } else {
            emit('webrtc_renegotiate_request', { to: peerId, roomCode, iceRestart: true });
          }
        }, 4000);
        peerDisconnectTimersRef.current.set(peerId, timer);
      } else if (pc.connectionState === 'failed') {
        if (userId && userId < peerId) {
          createOfferAndSend(peerId, peerName, true);
        } else {
          emit('webrtc_renegotiate_request', { to: peerId, roomCode, iceRestart: true });
        }
      }
    };

    peerConnectionsRef.current.set(peerId, pc);
    return pc;
  }, [emit, userId, roomCode, reportDiagnostic, tuneAudioSender]);

  // ── Create SDP offer and transmit (W3C Perfect Negotiation Offerer) ──
  const createOfferAndSend = useCallback(async (peerId: string, peerName: string, iceRestart = false) => {
    const pc = createPeerConnection(peerId, peerName);
    if (!pc) return;

    if (makingOfferRef.current.get(peerId) || pc.signalingState !== 'stable') {
      pendingOffersRef.current.set(peerId, { peerName, iceRestart });
      console.info(`[WebRTC] Queued negotiation with ${peerName}; current state is ${pc.signalingState}.`);
      return;
    }

    try {
      makingOfferRef.current.set(peerId, true);

      // Before creating the offer, ensure our current local tracks are on the transceivers
      const currentStream = localStreamRef.current;
      if (currentStream) {
        const localAudio = currentStream.getAudioTracks()[0];
        const localVideo = currentStream.getVideoTracks()[0];
        for (const t of pc.getTransceivers()) {
          if (t.receiver.track.kind === 'audio' && localAudio && (!t.sender.track || t.sender.track.readyState === 'ended')) {
            try {
              await t.sender.replaceTrack(localAudio);
              t.direction = 'sendrecv';
            } catch (_) { /* ignore */ }
          }
          if (t.receiver.track.kind === 'video' && localVideo && (!t.sender.track || t.sender.track.readyState === 'ended')) {
            try {
              await t.sender.replaceTrack(localVideo);
              t.direction = 'sendrecv';
            } catch (_) { /* ignore */ }
          }
        }
      }

      const offer = await pc.createOffer(iceRestart ? { iceRestart: true } : undefined);
      if (pc.signalingState !== 'stable') return;
      await pc.setLocalDescription(offer);

      // Log transceiver directions in the offer for debugging
      pc.getTransceivers().forEach((t, idx) => {
        console.info(`[WebRTC] Offer transceiver[${idx}] for ${peerName}: kind=${t.receiver.track.kind} direction=${t.direction} senderTrack=${t.sender.track?.id?.slice(0,8) || 'null'}`);
      });

      console.info(`[WebRTC] Sending ${iceRestart ? 'ICE-restart ' : ''}offer to ${peerName}`);

      emit('webrtc_offer', {
        to: peerId,
        roomCode,
        offer: pc.localDescription?.toJSON(),
      });
    } catch (err: any) {
      console.warn(`[WebRTC] Failed to create offer for ${peerName}:`, err.message);
    } finally {
      makingOfferRef.current.set(peerId, false);
      drainPendingOffer(peerId);
    }
  }, [createPeerConnection, emit, roomCode, drainPendingOffer]);

  // ── Helper to initiate connection with a peer ──
  const connectToPeer = useCallback((peerId: string, peerName: string, iceRestart = false) => {
    if (!userId || userId === peerId) return;

    if (userId < peerId) {
      createOfferAndSend(peerId, peerName, iceRestart);
    } else {
      emit('webrtc_renegotiate_request', { to: peerId, roomCode, iceRestart });
    }
  }, [userId, roomCode, createOfferAndSend, emit]);

  // ── Helper: Sync all receiver tracks from a peer connection into remoteStreams ──
  // This catches tracks that were set up during initial negotiation but never
  // triggered ontrack (e.g. when direction changed from recvonly to sendrecv).
  const syncAllReceiverTracks = useCallback((peerId: string, peerName: string) => {
    const pc = peerConnectionsRef.current.get(peerId);
    if (!pc) return;

    const transceivers = pc.getTransceivers();
    console.info(`[WebRTC] syncAllReceiverTracks for ${peerName}: ${transceivers.length} transceivers`);

    transceivers.forEach((t, idx) => {
      const recvTrack = t.receiver?.track;
      console.info(`[WebRTC]   Transceiver[${idx}] kind=${recvTrack?.kind || '?'} direction=${t.direction} currentDirection=${t.currentDirection} recvTrack.readyState=${recvTrack?.readyState} recvTrack.muted=${recvTrack?.muted} recvTrack.id=${recvTrack?.id?.slice(0,8) || 'none'}`);

      if (recvTrack && recvTrack.readyState === 'live') {
        // Check if this track is already in remoteStreams
        setRemoteStreams((prev) => {
          const existing = prev.find((rs) => rs.peerId === peerId);
          if (existing) {
            if (!existing.stream.getTracks().some((st) => st.id === recvTrack.id)) {
              // Replace any existing track of the same kind
              const oldTrack = existing.stream.getTracks().find((st) => st.kind === recvTrack.kind);
              if (oldTrack) existing.stream.removeTrack(oldTrack);
              existing.stream.addTrack(recvTrack);
              console.info(`[WebRTC] syncAllReceiverTracks: Added ${recvTrack.kind} track to existing stream for ${peerName}`);
              return [...prev];
            }
            return prev;
          } else {
            const newStream = new MediaStream([recvTrack]);
            console.info(`[WebRTC] syncAllReceiverTracks: Created new stream for ${peerName} with ${recvTrack.kind} track`);
            return [...prev, { peerId, peerName, stream: newStream }];
          }
        });

        // Set up unmute handler if not already set
        if (recvTrack.kind === 'video' && !recvTrack.muted) {
          setRemoteCameraStates((prev) => ({ ...prev, [peerId]: true }));
        }

        // Attach onunmute for late-arriving tracks
        recvTrack.onunmute = () => {
          console.info(`[WebRTC] syncAllReceiverTracks: ${recvTrack.kind} track unmuted from ${peerName}`);
          if (recvTrack.kind === 'video') {
            setRemoteCameraStates((prev) => ({ ...prev, [peerId]: true }));
          }
          // Ensure track is in stream
          setRemoteStreams((prev) => {
            const existing = prev.find((rs) => rs.peerId === peerId);
            if (existing && !existing.stream.getTracks().some((st) => st.id === recvTrack.id)) {
              const oldTrack = existing.stream.getTracks().find((st) => st.kind === recvTrack.kind);
              if (oldTrack) existing.stream.removeTrack(oldTrack);
              existing.stream.addTrack(recvTrack);
              return [...prev];
            }
            return prev;
          });
        };
      }
    });
  }, []);

  // ── Handle incoming SDP offer (W3C Perfect Negotiation Answerer) ──
  useSocketEvent<{ from: string; fromName: string; offer: RTCSessionDescriptionInit }>(
    'webrtc_offer',
    async (data) => {
      if (!isMountedRef.current || !data.offer || data.from === userId) return;

      await loadIceServers();
      const pc = createPeerConnection(data.from, data.fromName);
      const isPolite = (userId || '') > data.from;
      const isMakingOffer = makingOfferRef.current.get(data.from) || false;
      const offerCollision = isMakingOffer || pc.signalingState !== 'stable';

      console.info(`[WebRTC] Received offer from ${data.fromName}. isPolite=${isPolite}, signalingState=${pc.signalingState}, isMakingOffer=${isMakingOffer}, offerCollision=${offerCollision}`);

      if (offerCollision && !isPolite) {
        console.info(`[WebRTC] Offer collision with ${data.fromName}. Impolite peer ignoring offer.`);
        return;
      }

      try {
        if (offerCollision && isPolite) {
          console.info(`[WebRTC] Offer collision with ${data.fromName}. Polite peer rolling back.`);
          await pc.setLocalDescription({ type: 'rollback' } as any);
        }

        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        flushPendingCandidates(data.from);

        if (pc.signalingState === 'have-remote-offer') {
          // Before creating the answer, ensure our local tracks are on the transceivers
          const currentStream = localStreamRef.current;
          if (currentStream) {
            const localAudio = currentStream.getAudioTracks()[0];
            const localVideo = currentStream.getVideoTracks()[0];
            const transceivers = pc.getTransceivers();

            for (const t of transceivers) {
              if (t.receiver.track.kind === 'audio' && localAudio && !t.sender.track) {
                try {
                  await t.sender.replaceTrack(localAudio);
                  t.direction = 'sendrecv';
                  console.info(`[WebRTC] Attached local audio to transceiver for ${data.fromName} before answering`);
                } catch (e: any) {
                  console.warn(`[WebRTC] Failed to attach audio before answer:`, e.message);
                }
              }
              if (t.receiver.track.kind === 'video' && localVideo && !t.sender.track) {
                try {
                  await t.sender.replaceTrack(localVideo);
                  t.direction = 'sendrecv';
                  console.info(`[WebRTC] Attached local video to transceiver for ${data.fromName} before answering`);
                } catch (e: any) {
                  console.warn(`[WebRTC] Failed to attach video before answer:`, e.message);
                }
              }
            }
          }

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          // Log transceiver directions in the answer for debugging
          pc.getTransceivers().forEach((t, idx) => {
            console.info(`[WebRTC] Answer transceiver[${idx}]: kind=${t.receiver.track.kind} direction=${t.direction} currentDirection=${t.currentDirection} senderTrack=${t.sender.track?.id?.slice(0,8) || 'null'} senderEnabled=${t.sender.track?.enabled}`);
          });

          console.info(`[WebRTC] Sending answer to ${data.fromName}`);

          emit('webrtc_answer', {
            to: data.from,
            roomCode,
            answer: pc.localDescription?.toJSON(),
          });

          // After answering, sync receiver tracks — the offer may contain new tracks
          window.setTimeout(() => {
            syncAllReceiverTracks(data.from, data.fromName);
          }, 100);
        }
      } catch (err: any) {
        console.warn(`[WebRTC] Failed to handle offer from ${data.fromName}:`, err.message);
      }
    }
  );

  // ── Handle incoming SDP answer ──
  useSocketEvent<{ from: string; answer: RTCSessionDescriptionInit }>(
    'webrtc_answer',
    async (data) => {
      if (!data.answer) return;
      const pc = peerConnectionsRef.current.get(data.from);
      if (!pc) return;

      if (pc.signalingState !== 'have-local-offer') {
        console.warn(`[WebRTC] Ignoring answer from ${data.from}: signalingState=${pc.signalingState} (expected have-local-offer)`);
        return;
      }

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer));

        // Log transceiver state after accepting answer
        const peerName = participantsRef.current.find(p => p.id === data.from)?.name || data.from;
        pc.getTransceivers().forEach((t, idx) => {
          console.info(`[WebRTC] Post-answer transceiver[${idx}] with ${peerName}: kind=${t.receiver.track.kind} direction=${t.direction} currentDirection=${t.currentDirection} recvTrack.readyState=${t.receiver.track.readyState} recvTrack.muted=${t.receiver.track.muted}`);
        });

        console.info(`[WebRTC] Accepted answer from ${peerName} (${data.from})`);
        flushPendingCandidates(data.from);
        drainPendingOffer(data.from);

        // CRITICAL: After accepting the answer, sync receiver tracks.
        // The answerer may have added media tracks that we didn't know about
        // during the initial ontrack event.
        window.setTimeout(() => {
          syncAllReceiverTracks(data.from, peerName);
        }, 200);
      } catch (err: any) {
        console.warn(`[WebRTC] Failed to set remote answer from ${data.from}:`, err.message);
      }
    }
  );

  // ── Handle incoming ICE candidate ──
  useSocketEvent<{ from: string; candidate: RTCIceCandidateInit }>(
    'webrtc_ice_candidate',
    async (data) => {
      if (!data.candidate) return;
      const pc = peerConnectionsRef.current.get(data.from);
      if (pc && pc.remoteDescription && pc.remoteDescription.type) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (_err: any) {
          // ignore duplicate candidate
        }
      } else {
        const pending = pendingCandidatesRef.current.get(data.from) || [];
        pending.push(data.candidate);
        pendingCandidatesRef.current.set(data.from, pending);
      }
    }
  );

  // ── Handle renegotiate request from a peer ──
  useSocketEvent<{ from: string; fromName: string; iceRestart?: boolean }>(
    'webrtc_renegotiate_request',
    (data) => {
      if (!data.from || data.from === userId) return;
      console.info(`[WebRTC] Received renegotiate request from ${data.fromName || data.from}`);
      createOfferAndSend(data.from, data.fromName || 'Peer', Boolean(data.iceRestart));
    }
  );

  // ── Handle camera state changes from peers ──
  useSocketEvent<{ userId: string; isCameraOn: boolean }>('webrtc_camera_toggle', (data) => {
    setRemoteCameraStates((prev) => ({
      ...prev,
      [data.userId]: Boolean(data.isCameraOn),
    }));
  });

  // ── Handle mic state changes from peers ──
  useSocketEvent<{ userId: string; isMicOn: boolean }>('webrtc_mic_toggle', (data) => {
    setRemoteMicStates((prev) => ({
      ...prev,
      [data.userId]: Boolean(data.isMicOn),
    }));
  });

  // ── Handle peer disconnect / left call ──
  useSocketEvent<{ userId: string }>('webrtc_peer_left', (data) => {
    console.log(`[WebRTC] Peer left call: ${data.userId}`);
    const disconnectTimer = peerDisconnectTimersRef.current.get(data.userId);
    if (disconnectTimer) clearTimeout(disconnectTimer);
    peerDisconnectTimersRef.current.delete(data.userId);
    pendingOffersRef.current.delete(data.userId);
    pendingCandidatesRef.current.delete(data.userId);

    const pc = peerConnectionsRef.current.get(data.userId);
    if (pc) {
      pc.close();
      peerConnectionsRef.current.delete(data.userId);
    }
    setRemoteStreams((prev) => prev.filter((rs) => rs.peerId !== data.userId));
    setRemoteCameraStates((prev) => {
      const copy = { ...prev };
      delete copy[data.userId];
      return copy;
    });
    setRemoteMicStates((prev) => {
      const copy = { ...prev };
      delete copy[data.userId];
      return copy;
    });
  });

  // ── Handle new peer joined ──
  useSocketEvent<{ userId: string; userName: string }>('webrtc_peer_joined', (data) => {
    if (!isMountedRef.current || !data.userId || data.userId === userId) return;
    console.info(`[WebRTC] Peer joined room call: ${data.userName} (${data.userId})`);

    // Announce our current media state to the new joiner
    emit('webrtc_camera_toggle', { isCameraOn, roomCode });
    emit('webrtc_mic_toggle', { isMicOn, roomCode });

    // Connect immediately
    connectToPeer(data.userId, data.userName);
  });

  // ── Helper to renegotiate SDP offer with all peers ──
  // CRITICAL: Respect the offerer/answerer roles. Only the peer with the
  // lower userId should create offers (the "impolite" offerer). The peer
  // with the higher userId must REQUEST the other peer to send a new offer.
  // Violating this causes offer-collision glare and one-way media.
  const renegotiateWithAllPeers = useCallback(() => {
    participantsRef.current
      .filter((p) => p.id !== userId)
      .forEach((p) => {
        if (userId && userId < p.id) {
          // We are the offerer (impolite) — create and send the offer
          console.info(`[WebRTC] Renegotiating as OFFERER with ${p.name} (we=${userId?.slice(-4)} < peer=${p.id.slice(-4)})`);
          createOfferAndSend(p.id, p.name);
        } else {
          // We are the answerer (polite) — ask the other peer to send us an offer
          console.info(`[WebRTC] Requesting renegotiation from ${p.name} (we=${userId?.slice(-4)} > peer=${p.id.slice(-4)})`);
          emit('webrtc_renegotiate_request', { to: p.id, roomCode });
        }
      });
  }, [userId, createOfferAndSend, emit, roomCode]);

  // ── Continuous Mesh Sync Effect (Prevents 3+ peer connection deadlocks) ──
  useEffect(() => {
    if (!isActive || !roomCode || !userId) {
      return;
    }

    let isCancelled = false;

    void (async () => {
      await loadIceServers();
      if (isCancelled || !isMountedRef.current) return;

      setIsConnected(true);
      emit('webrtc_join', { roomCode });

      // Scan participants and connect any missing peer
      participants
        .filter((p) => p.id !== userId)
        .forEach((p) => {
          if (!peerConnectionsRef.current.has(p.id)) {
            connectToPeer(p.id, p.name);
          }
        });
    })();

    return () => {
      isCancelled = true;
    };
  }, [isActive, roomCode, userId, participants, emit, connectToPeer, loadIceServers]);

  // ── Toggle Camera (Hardware release on turn off + SDP update) ──
  const toggleCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      console.warn('[WebRTC] getUserMedia not available (secure context required).');
      reportDiagnostic({
        code: 'media-unavailable',
        message: 'Camera is unavailable. Open the app through the HTTPS sharing link and allow camera access.',
      });
      return;
    }

    const currentStream = getOrCreateLocalStream();
    const existingVideoTrack = currentStream.getVideoTracks()[0];

    if (!isCameraOn) {
      // Turn ON camera
      try {
        console.log('[WebRTC] Requesting webcam access...');
        const media = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 24, max: 30 },
          },
        });
        const newVideoTrack = media.getVideoTracks()[0];
        if (newVideoTrack) {
          console.log('[WebRTC] Webcam access granted. Attaching live video track.');
          currentStream.addTrack(newVideoTrack);
          setLocalStream(new MediaStream(currentStream.getTracks()));

          // Replace track on all transceivers
          const operations: Promise<void>[] = [];
          peerConnectionsRef.current.forEach((pc, peerId) => {
            const transceiver = pc.getTransceivers().find(
              (t) => t.receiver.track.kind === 'video' || t.sender.track?.kind === 'video'
            );
            if (transceiver) {
              transceiver.direction = 'sendrecv';
              operations.push(
                transceiver.sender.replaceTrack(newVideoTrack).then(() => {
                  console.info(`[WebRTC] Video sender updated for ${peerId}`);
                })
              );
            } else {
              pc.addTrack(newVideoTrack, currentStream);
              console.info(`[WebRTC] Video sender added for ${peerId}`);
            }
          });

          await Promise.all(operations);
          renegotiateWithAllPeers();
        }
        setIsCameraOn(true);
        emit('webrtc_camera_toggle', { isCameraOn: true, roomCode });
      } catch (err: any) {
        console.warn('[WebRTC] Camera access failed:', err.message);
        reportDiagnostic({
          code: 'media-permission',
          message: err.name === 'NotAllowedError'
            ? 'Camera permission was denied. Allow it in your browser site settings and try again.'
            : `Camera could not start: ${err.message || 'unknown device error'}`,
        });
      }
    } else {
      // Turn OFF camera — Truly stop hardware track to turn off webcam LED light
      console.log('[WebRTC] Stopping webcam track and releasing hardware camera.');
      if (existingVideoTrack) {
        existingVideoTrack.stop();
        currentStream.removeTrack(existingVideoTrack);
        setLocalStream(new MediaStream(currentStream.getTracks()));
      }

      const operations: Promise<void>[] = [];
      peerConnectionsRef.current.forEach((pc, peerId) => {
        const transceiver = pc.getTransceivers().find(
          (t) => t.receiver.track.kind === 'video' || t.sender.track?.kind === 'video'
        );
        if (transceiver) {
          operations.push(
            transceiver.sender.replaceTrack(null).then(() => {
              console.info(`[WebRTC] Video sender cleared for ${peerId}`);
            })
          );
        }
      });

      await Promise.all(operations);
      renegotiateWithAllPeers();

      setIsCameraOn(false);
      emit('webrtc_camera_toggle', { isCameraOn: false, roomCode });
    }
  }, [isCameraOn, getOrCreateLocalStream, roomCode, emit, renegotiateWithAllPeers, reportDiagnostic]);

  // ── Toggle Mic (Mute/Unmute without redundant SDP renegotiations) ──
  const toggleMic = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      console.warn('[WebRTC] getUserMedia not available (secure context required).');
      reportDiagnostic({
        code: 'media-unavailable',
        message: 'Microphone is unavailable. Open the app through the HTTPS sharing link and allow microphone access.',
      });
      return;
    }

    const currentStream = getOrCreateLocalStream();
    const existingAudioTrack = currentStream.getAudioTracks()[0];

    if (!isMicOn) {
      // Turn ON mic
      try {
        if (existingAudioTrack && existingAudioTrack.readyState === 'live') {
          console.log('[WebRTC] Enabling existing microphone track');
          existingAudioTrack.enabled = true;
          setIsMicOn(true);
          emit('webrtc_mic_toggle', { isMicOn: true, roomCode });
        } else {
          console.log('[WebRTC] Requesting microphone access...');
          const media = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              channelCount: 1,
              sampleRate: 48000,
            },
          });
          const newAudioTrack = media.getAudioTracks()[0];
          if (newAudioTrack) {
            console.log('[WebRTC] Microphone access granted. Attaching live audio track.');
            currentStream.addTrack(newAudioTrack);
            setLocalStream(new MediaStream(currentStream.getTracks()));

            const operations: Promise<void>[] = [];
            peerConnectionsRef.current.forEach((pc, peerId) => {
              const transceiver = pc.getTransceivers().find(
                (t) => t.receiver.track.kind === 'audio' || t.sender.track?.kind === 'audio'
              );
              if (transceiver) {
                transceiver.direction = 'sendrecv';
                operations.push(
                  transceiver.sender.replaceTrack(newAudioTrack).then(() => {
                    console.info(`[WebRTC] Audio sender updated for ${peerId}`);
                    return tuneAudioSender(pc, peerId);
                  })
                );
              } else {
                pc.addTrack(newAudioTrack, currentStream);
                console.info(`[WebRTC] Audio sender added for ${peerId}`);
                operations.push(tuneAudioSender(pc, peerId));
              }
            });

            await Promise.all(operations);
            renegotiateWithAllPeers();
          }
          setIsMicOn(true);
          emit('webrtc_mic_toggle', { isMicOn: true, roomCode });
        }
      } catch (err: any) {
        console.warn('[WebRTC] Microphone access failed:', err.message);
        reportDiagnostic({
          code: 'media-permission',
          message: err.name === 'NotAllowedError'
            ? 'Microphone permission was denied. Allow it in your browser site settings and try again.'
            : `Microphone could not start: ${err.message || 'unknown device error'}`,
        });
      }
    } else {
      // Turn OFF mic (Mute audio track without SDP renegotiation)
      console.log('[WebRTC] Muting microphone track');
      if (existingAudioTrack) {
        existingAudioTrack.enabled = false;
      }
      setIsMicOn(false);
      emit('webrtc_mic_toggle', { isMicOn: false, roomCode });
    }
  }, [isMicOn, getOrCreateLocalStream, roomCode, emit, renegotiateWithAllPeers, reportDiagnostic, tuneAudioSender]);

  // ── Leave Call / Cleanup ──
  const leaveCall = useCallback(() => {
    console.log('[WebRTC] Leaving call and releasing all media tracks');
    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();
    peerDisconnectTimersRef.current.forEach((timer) => clearTimeout(timer));
    peerDisconnectTimersRef.current.clear();
    pendingOffersRef.current.clear();
    pendingCandidatesRef.current.clear();

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }

    setLocalStream(null);
    setRemoteStreams([]);
    setRemoteCameraStates({});
    setRemoteMicStates({});
    setIsCameraOn(false);
    setIsMicOn(false);
    setIsConnected(false);

    emit('webrtc_leave', { roomCode });
  }, [roomCode, emit]);

  // ── Cleanup on unmount ──
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      peerConnectionsRef.current.forEach((pc) => pc.close());
      peerConnectionsRef.current.clear();
      peerDisconnectTimersRef.current.forEach((timer) => clearTimeout(timer));
      peerDisconnectTimersRef.current.clear();
      pendingOffersRef.current.clear();
      pendingCandidatesRef.current.clear();
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
      }
    };
  }, []);

  return {
    localStream,
    remoteStreams,
    remoteCameraStates,
    remoteMicStates,
    isCameraOn,
    isMicOn,
    isConnected,
    toggleCamera,
    toggleMic,
    leaveCall,
  };
}
