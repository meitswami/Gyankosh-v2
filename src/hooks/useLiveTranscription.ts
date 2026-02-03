import { useState, useCallback, useRef, useEffect } from 'react';

export interface TranscriptSegment {
  id: string;
  speakerLabel: string;
  text: string;
  startTime: number;
  endTime: number;
  isFinal: boolean;
}

interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent {
  error: string;
  message?: string;
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
}

// Use any to avoid conflicts with existing global types
type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

export interface UseLiveTranscriptionOptions {
  language?: string;
  onSegment?: (segment: TranscriptSegment) => void;
  onInterim?: (text: string) => void;
  onError?: (error: string) => void;
}

// Simple speaker detection based on audio characteristics and pauses
function detectSpeakerChange(
  currentTime: number,
  lastSpeechTime: number,
  pauseThreshold: number = 2000
): boolean {
  return currentTime - lastSpeechTime > pauseThreshold;
}

export function useLiveTranscription(options: UseLiveTranscriptionOptions = {}) {
  const {
    language = 'hi-IN', // Default Hindi, supports Indian English
    onSegment,
    onInterim,
    onError,
  } = options;

  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [currentSpeaker, setCurrentSpeaker] = useState(1);
  const [interimText, setInterimText] = useState('');

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const startTimeRef = useRef<number>(0);
  const segmentStartRef = useRef<number>(0);
  const lastSpeechTimeRef = useRef<number>(0);
  const speakerCountRef = useRef<number>(1);
  const accumulatedTextRef = useRef<string>('');

  // Initialize speech recognition
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    setIsSupported(!!SpeechRecognition);

    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = language;
    // Note: maxAlternatives, onspeechstart, onspeechend not available in all browsers

    recognition.onstart = () => {
      console.log('[Transcription] Started');
      setIsListening(true);
      startTimeRef.current = Date.now();
      segmentStartRef.current = Date.now();
      lastSpeechTimeRef.current = Date.now();
    };

    recognition.onend = () => {
      console.log('[Transcription] Ended');
      // Auto-restart if still supposed to be listening
      if (isListening && recognitionRef.current) {
        try {
          recognitionRef.current.start();
        } catch (e) {
          console.log('[Transcription] Could not restart:', e);
          setIsListening(false);
        }
      } else {
        setIsListening(false);
      }
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const now = Date.now();
      lastSpeechTimeRef.current = now;

      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interimTranscript += result[0].transcript;
        }
      }

      // Update interim display
      if (interimTranscript) {
        setInterimText(interimTranscript);
        onInterim?.(interimTranscript);
      }

      // Handle final transcript
      if (finalTranscript) {
        accumulatedTextRef.current += ' ' + finalTranscript;
        setInterimText('');

        // Check for natural break (sentence end)
        if (/[.?!।॥]$/.test(finalTranscript.trim())) {
          finalizeSegment();
        }
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('[Transcription] Error:', event.error);
      
      // Don't stop for "no-speech" - just continue
      if (event.error === 'no-speech') {
        return;
      }

      let errorMessage = 'Transcription error';
      switch (event.error) {
        case 'audio-capture':
          errorMessage = 'Microphone not found';
          break;
        case 'not-allowed':
          errorMessage = 'Microphone access denied';
          break;
        case 'network':
          errorMessage = 'Network error - check connection';
          break;
        default:
          errorMessage = `Error: ${event.error}`;
      }
      onError?.(errorMessage);
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, [language, onError, onInterim, isListening]);

  const finalizeSegment = useCallback(() => {
    const text = accumulatedTextRef.current.trim();
    if (!text) return;

    const now = Date.now();
    const segment: TranscriptSegment = {
      id: crypto.randomUUID(),
      speakerLabel: `Speaker ${currentSpeaker}`,
      text,
      startTime: (segmentStartRef.current - startTimeRef.current) / 1000,
      endTime: (now - startTimeRef.current) / 1000,
      isFinal: true,
    };

    setSegments(prev => [...prev, segment]);
    onSegment?.(segment);
    accumulatedTextRef.current = '';
    segmentStartRef.current = now;
  }, [currentSpeaker, onSegment]);

  const startTranscription = useCallback(async () => {
    if (!recognitionRef.current) {
      onError?.('Speech recognition not supported');
      return false;
    }

    try {
      // Request microphone permission
      await navigator.mediaDevices.getUserMedia({ audio: true });
      
      setSegments([]);
      speakerCountRef.current = 1;
      setCurrentSpeaker(1);
      accumulatedTextRef.current = '';
      
      recognitionRef.current.start();
      return true;
    } catch (error) {
      console.error('Failed to start transcription:', error);
      onError?.('Failed to access microphone');
      return false;
    }
  }, [onError]);

  const stopTranscription = useCallback(() => {
    // Finalize any remaining text
    if (accumulatedTextRef.current.trim()) {
      finalizeSegment();
    }
    
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsListening(false);
    setInterimText('');
  }, [finalizeSegment]);

  const resetTranscription = useCallback(() => {
    setSegments([]);
    speakerCountRef.current = 1;
    setCurrentSpeaker(1);
    accumulatedTextRef.current = '';
    setInterimText('');
  }, []);

  // Get full transcript text
  const getFullTranscript = useCallback(() => {
    return segments.map(s => `${s.speakerLabel}: ${s.text}`).join('\n');
  }, [segments]);

  // Get speaker count
  const getSpeakerCount = useCallback(() => {
    const speakers = new Set(segments.map(s => s.speakerLabel));
    return speakers.size;
  }, [segments]);

  return {
    isListening,
    isSupported,
    segments,
    currentSpeaker,
    interimText,
    startTranscription,
    stopTranscription,
    resetTranscription,
    getFullTranscript,
    getSpeakerCount,
  };
}
