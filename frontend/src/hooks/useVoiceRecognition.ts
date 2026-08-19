import { useState, useEffect, useRef, useCallback } from 'react';

// ─────────────────────────────────────────────────────────────
// useVoiceRecognition — Chrome Web Speech API hook
//
// Uses browser-native SpeechRecognition (Chrome → webkitSpeechRecognition).
// Provides live interim transcripts and auto-sends final transcripts.
//
// IMPORTANT: Chrome's Web Speech API sends audio to Google's cloud
// servers for recognition. An internet connection is required.
// This hook handles the complete recognition lifecycle including
// auto-restart, error recovery, and duplicate prevention.
//
// Target browser: Google Chrome desktop (current version)
// ─────────────────────────────────────────────────────────────

interface UseVoiceRecognitionOptions {
  /** Called when a transcript is produced. isFinal=true means committed result. */
  onResult?: (transcript: string, isFinal: boolean) => void;
  /** Called on recognition error with the raw error code string. */
  onError?: (error: string) => void;
  /** Enable continuous recognition (auto-restarts on natural pause). Default: true */
  continuous?: boolean;
  /** BCP-47 language code. Default: 'en-IN' */
  lang?: string;
}

/** Friendly user-facing error messages keyed by SpeechRecognition error codes */
const ERROR_MESSAGES: Record<string, string> = {
  'network':
    'Speech recognition could not connect to the browser\'s recognition service. ' +
    'Check your internet connection and Chrome speech-recognition availability.',
  'not-allowed':
    'Microphone permission was denied. Please allow microphone access in your browser settings.',
  'no-speech':
    'No speech was detected. Please try speaking again.',
  'audio-capture':
    'No microphone was found. Ensure a microphone is connected and working.',
  'aborted':
    'Speech recognition was interrupted.',
  'service-not-allowed':
    'Speech recognition service is not allowed. Check your browser or system settings.',
  'language-not-supported':
    'The selected language is not supported by the speech recognition service.',
};

// Configuration constants
const MAX_CONSECUTIVE_ERRORS = 3;
const RESTART_DELAY_MS = 350;

export function useVoiceRecognition(options: UseVoiceRecognitionOptions = {}) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [isSupported, setIsSupported] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Stable refs for callbacks (avoids stale closures in event handlers) ──
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // ── Internal state refs ──
  const recognitionRef = useRef<any>(null);
  const isStoppedByUserRef = useRef(true);
  const isRestartingRef = useRef(false);
  const restartTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const consecutiveErrorsRef = useRef(0);
  const isMountedRef = useRef(true);

  // ── Browser support detection ──
  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setIsSupported(!!SR);
  }, []);

  // ── Create and configure the SpeechRecognition instance ──
  const createRecognition = useCallback(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) return null;

    const recognition = new SpeechRecognition();
    recognition.continuous = optionsRef.current.continuous ?? true;
    recognition.interimResults = true;
    recognition.lang = optionsRef.current.lang || 'en-IN';
    recognition.maxAlternatives = 1;

    // ── onstart ──
    recognition.onstart = () => {
      if (!isMountedRef.current) return;
      setIsListening(true);
      setError(null);
      consecutiveErrorsRef.current = 0;
      isRestartingRef.current = false;
    };

    // ── onspeechstart ──
    recognition.onspeechstart = () => {
      // Actual speech audio detected — reset transient error count
      consecutiveErrorsRef.current = 0;
    };

    // ── onspeechend ──
    recognition.onspeechend = () => {
      // User stopped speaking. Recognition continues processing final results.
    };

    // ── onaudioend ──
    recognition.onaudioend = () => {
      // Audio capture ended. Recognition may still fire onresult with final results.
    };

    // ── onnomatch ──
    recognition.onnomatch = () => {
      console.warn('[VoiceRecognition] No match found for speech input');
    };

    // ── onresult — the core transcript handler ──
    recognition.onresult = (event: any) => {
      if (!isMountedRef.current) return;

      let currentInterim = '';
      let newFinals = '';

      // Process ONLY from event.resultIndex forward to prevent duplicate processing.
      // Each result index is processed exactly once.
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript;

        if (result.isFinal) {
          newFinals += text;
        } else {
          currentInterim += text;
        }
      }

      // Update interim transcript — this REPLACES the previous interim (not append).
      // This ensures the live preview shows the evolving partial recognition
      // without creating duplicate text.
      setInterimTranscript(currentInterim);

      // Commit finalized results
      if (newFinals.trim()) {
        const finalText = newFinals.trim();
        setTranscript((prev) =>
          prev ? `${prev.trim()} ${finalText}` : finalText
        );
        setInterimTranscript('');
        optionsRef.current.onResult?.(finalText, true);
      }
    };

    // ── onerror ──
    recognition.onerror = (event: any) => {
      if (!isMountedRef.current) return;

      const errorCode: string = event.error;
      console.warn('[VoiceRecognition] Error:', errorCode, event.message || '');

      // ── Transient / ignorable errors ──
      if (errorCode === 'no-speech') {
        // No speech detected during the listening window.
        // Recognition will fire onend next — auto-restart handles it.
        return;
      }

      if (errorCode === 'aborted') {
        // Aborted by our own .abort() call (e.g., cleanup). Silent.
        return;
      }

      // ── Real errors ──
      consecutiveErrorsRef.current++;

      const friendlyMessage =
        ERROR_MESSAGES[errorCode] || `Speech recognition error: ${errorCode}`;
      setError(friendlyMessage);
      optionsRef.current.onError?.(errorCode);

      // If too many consecutive errors, give up to prevent infinite restart loop
      if (consecutiveErrorsRef.current >= MAX_CONSECUTIVE_ERRORS) {
        console.warn(
          `[VoiceRecognition] ${MAX_CONSECUTIVE_ERRORS} consecutive errors — stopping auto-restart.`
        );
        isStoppedByUserRef.current = true;
        setIsListening(false);
        setInterimTranscript('');
      }
    };

    // ── onend — Chrome fires this when recognition stops for any reason ──
    recognition.onend = () => {
      if (!isMountedRef.current) return;

      const shouldAutoRestart =
        !isStoppedByUserRef.current &&
        consecutiveErrorsRef.current < MAX_CONSECUTIVE_ERRORS;

      if (shouldAutoRestart) {
        // ── Controlled auto-restart ──
        // Keep isListening=true during restart gap so UI doesn't flicker.
        // Clear any existing restart timeout to prevent overlapping restarts.
        if (restartTimeoutRef.current) {
          clearTimeout(restartTimeoutRef.current);
        }

        isRestartingRef.current = true;
        restartTimeoutRef.current = setTimeout(() => {
          restartTimeoutRef.current = null;

          if (!isMountedRef.current || isStoppedByUserRef.current) {
            isRestartingRef.current = false;
            setIsListening(false);
            return;
          }

          try {
            recognitionRef.current?.start();
          } catch (e: any) {
            console.warn('[VoiceRecognition] Auto-restart failed:', e.message);
            isRestartingRef.current = false;
            // If start itself throws, stop retrying
            isStoppedByUserRef.current = true;
            setIsListening(false);
            setInterimTranscript('');
          }
        }, RESTART_DELAY_MS);
      } else {
        // ── User stopped or error limit reached — fully stop ──
        setIsListening(false);
        setInterimTranscript('');
        isRestartingRef.current = false;
      }
    };

    return recognition;
  }, []);

  // ── Initialize recognition instance on mount, cleanup on unmount ──
  useEffect(() => {
    isMountedRef.current = true;
    recognitionRef.current = createRecognition();

    return () => {
      isMountedRef.current = false;
      isStoppedByUserRef.current = true;

      if (restartTimeoutRef.current) {
        clearTimeout(restartTimeoutRef.current);
        restartTimeoutRef.current = null;
      }

      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (_) {
          // Ignore cleanup errors
        }
        recognitionRef.current = null;
      }
    };
  }, [createRecognition]);

  // ── Public API ──

  const startListening = useCallback(() => {
    if (!recognitionRef.current) {
      setError(
        'Speech recognition is not supported in this browser. ' +
        'Please use the latest version of Google Chrome.'
      );
      return;
    }

    // Guard against double-start
    if (isListening || isRestartingRef.current) return;

    // Reset state for fresh listening session
    setError(null);
    setInterimTranscript('');
    isStoppedByUserRef.current = false;
    consecutiveErrorsRef.current = 0;

    try {
      recognitionRef.current.start();
    } catch (e: any) {
      if (e.message?.includes('already started')) {
        // Recognition already running — abort and retry once
        try {
          recognitionRef.current.abort();
        } catch (_) {}
        setTimeout(() => {
          if (!isStoppedByUserRef.current && recognitionRef.current) {
            try {
              recognitionRef.current.start();
            } catch (retryErr: any) {
              console.warn('[VoiceRecognition] Retry start failed:', retryErr.message);
              setError('Failed to start speech recognition. Please try again.');
            }
          }
        }, 200);
      } else {
        console.warn('[VoiceRecognition] Start error:', e.message);
        setError('Failed to start speech recognition. Please try again.');
      }
    }
  }, [isListening]);

  const stopListening = useCallback(() => {
    // Mark as user-initiated stop — prevents auto-restart in onend
    isStoppedByUserRef.current = true;

    // Cancel any pending auto-restart
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }

    if (recognitionRef.current) {
      try {
        // .stop() (not .abort()) — allows pending audio to finalize
        recognitionRef.current.stop();
      } catch (e: any) {
        console.warn('[VoiceRecognition] Stop error:', e.message);
      }
    }

    setIsListening(false);
    setInterimTranscript('');
    isRestartingRef.current = false;
  }, []);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  const resetTranscript = useCallback(() => {
    setTranscript('');
    setInterimTranscript('');
  }, []);

  return {
    isListening,
    isSupported,
    transcript,
    interimTranscript,
    error,
    startListening,
    stopListening,
    toggleListening,
    resetTranscript,
  };
}
