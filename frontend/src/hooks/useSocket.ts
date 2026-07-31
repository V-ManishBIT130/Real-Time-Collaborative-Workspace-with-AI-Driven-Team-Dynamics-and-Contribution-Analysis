import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

// Auto-detect: if accessed via IP (e.g. 192.168.x.x), connect Socket.IO to same IP
// This makes it work across WiFi devices without config changes
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL
  || `http://${window.location.hostname}:3001`;

let socketInstance: Socket | null = null;

/**
 * Returns a singleton Socket.IO connection with JWT authentication.
 * Reads token from localStorage and passes it in handshake.auth.
 */
export function getSocket(): Socket {
  const token = localStorage.getItem('collab-lens-token');

  if (!socketInstance) {
    socketInstance = io(BACKEND_URL, {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
      transports: ['websocket', 'polling'],
      auth: {
        token: token || ''
      }
    });

    socketInstance.on('connect_error', (err) => {
      if (err.message.includes('Authentication error')) {
        console.warn('Socket auth failed — token may be invalid');
      }
    });
  }

  return socketInstance;
}

/**
 * Disconnect and clear the existing socket instance.
 * Called when the user logs out or token changes.
 */
export function disconnectSocket() {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }
}

/**
 * Reconnect socket with a fresh token (e.g. after login).
 */
export function reconnectSocket() {
  disconnectSocket();
  return getSocket();
}

/**
 * Hook: Listen to a Socket.IO event. Auto-cleans up on unmount.
 */
export function useSocketEvent<T = unknown>(
  event: string,
  handler: (data: T) => void
) {
  const savedHandler = useRef(handler);

  useEffect(() => {
    savedHandler.current = handler;
  }, [handler]);

  useEffect(() => {
    const socket = getSocket();
    const eventHandler = (data: T) => savedHandler.current(data);
    socket.on(event, eventHandler);
    return () => {
      socket.off(event, eventHandler);
    };
  }, [event]);
}

/**
 * Hook: Emit a Socket.IO event with optional acknowledgment callback.
 */
export function useSocketEmit() {
  const emit = useCallback(
    <T = unknown>(
      event: string,
      data?: unknown,
      callback?: (response: T) => void
    ) => {
      const socket = getSocket();
      if (callback) {
        socket.emit(event, data, callback);
      } else {
        socket.emit(event, data);
      }
    },
    []
  );

  return emit;
}
