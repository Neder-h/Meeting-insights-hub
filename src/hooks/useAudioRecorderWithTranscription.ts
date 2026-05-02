import { useState, useRef, useCallback, useEffect } from 'react';
import { RecordingState } from '@/types/meeting';
import { WhisperMode, translateText } from '@/lib/api';

interface RecordingStateWithTranscript extends RecordingState {
  transcript: string;
  rawTranscript?: string;  // Original mixed-language transcript
  cleanedTranscript?: string; // Post-cleaned transcription before translation
  cleaningProfile?: string;
  cleaningDiff?: Array<{ before: string; after: string; count: number }>;
  segments?: Array<{ start: number; end: number; text: string; confidence?: number; low_confidence?: boolean }>;
  lowConfidenceSegments?: Array<{ start: number; end: number; text: string; confidence?: number }>;
  isTranscribing?: boolean;
  isTranslating?: boolean;
  translationWarning?: boolean;
}

interface UseAudioRecorderWithTranscriptionOptions {
  mode?: WhisperMode; // Whisper transcription modes
  enableDiagnostics?: boolean; // Enable diagnostics logging
}

interface UseAudioRecorderWithTranscriptionReturn {
  state: RecordingStateWithTranscript;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<{ blob: Blob | null; transcript: string; rawTranscript: string; cleanedTranscript: string }>;
  transcribeFile: (file: File) => Promise<{ blob: Blob; transcript: string; rawTranscript: string; cleanedTranscript: string; durationSeconds: number }>;
  pauseRecording: () => void;
  resumeRecording: () => void;
  error: string | null;
  detectedLanguage: string | null;
  transcribeError: string | null;
}

export function useAudioRecorderWithTranscription(options: UseAudioRecorderWithTranscriptionOptions = {}): UseAudioRecorderWithTranscriptionReturn {
  const { mode = 'bilingual', enableDiagnostics = false } = options;
  const [state, setState] = useState<RecordingStateWithTranscript>({
    isRecording: false,
    isPaused: false,
    duration: 0,
    transcript: '',
    isTranscribing: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [detectedLanguage, setDetectedLanguage] = useState<string | null>(null);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const transcriptRef = useRef<string>('');

  const getAudioDuration = useCallback((blob: Blob): Promise<number> => {
    return new Promise((resolve) => {
      try {
        const audio = new Audio();
        const objectUrl = URL.createObjectURL(blob);
        audio.src = objectUrl;
        audio.onloadedmetadata = () => {
          URL.revokeObjectURL(objectUrl);
          if (Number.isFinite(audio.duration)) {
            resolve(Math.round(audio.duration));
          } else {
            resolve(0);
          }
        };
        audio.onerror = () => {
          URL.revokeObjectURL(objectUrl);
          resolve(0);
        };
      } catch {
        resolve(0);
      }
    });
  }, []);

  const transcribeAudioBlob = useCallback(async (audioBlob: Blob): Promise<{ transcript: string; rawTranscript: string; cleanedTranscript: string }> => {
    setTranscribeError(null);
    setDetectedLanguage(null);

    setState((prev) => ({
      ...prev,
      audioBlob,
      isTranscribing: true,
      isTranslating: false,
      translationWarning: false,
      transcript: '',
      rawTranscript: '',
      cleanedTranscript: '',
      cleaningProfile: undefined,
      cleaningDiff: [],
      segments: [],
      lowConfidenceSegments: [],
    }));

    try {
      const file = new File([audioBlob], "meeting.webm", { type: audioBlob.type || "audio/webm" });

      const formData = new FormData();
      formData.append('file', file);

      console.log('Starting Whisper transcription with mode:', mode);
      const response = await fetch(`http://127.0.0.1:9000/transcribe?mode=${mode}`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(errorData.detail || `HTTP ${response.status}`);
      }

      const result = await response.json();
      const rawTranscript = result.raw_text || result.text || '';
      const cleanedTranscript = result.cleaned_text || result.text || rawTranscript;
      const segments = Array.isArray(result.segments) ? result.segments : [];
      const lowConfidenceSegments = segments
        .filter((s: any) => !!s.low_confidence || (typeof s.confidence === 'number' && s.confidence < 55))
        .map((s: any) => ({ start: s.start, end: s.end, text: s.text, confidence: s.confidence }));

      if (result.detected_language) {
        setDetectedLanguage(result.detected_language);
      }

      console.log('Whisper transcription completed:', rawTranscript.substring(0, 100) + '...');

      // Now translate to French
      setState((prev) => ({
        ...prev,
        rawTranscript,
        cleanedTranscript,
        cleaningProfile: result.cleaning_profile,
        cleaningDiff: Array.isArray(result.cleaning_diff) ? result.cleaning_diff : [],
        segments,
        lowConfidenceSegments,
        isTranscribing: false,
        isTranslating: true,
      }));

      let finalTranscript = cleanedTranscript;
      let translationWarning = false;

      try {
        console.log('Starting translation to French...');
        const translationStartTime = performance.now();
        const translationResult = await translateText(cleanedTranscript, 'fra_Latn', 'segment');
        finalTranscript = translationResult.text;
        const translationTime = Math.round(performance.now() - translationStartTime);
        
        // Dev logs for end-to-end verification
        console.log('[Transcription] Raw length:', rawTranscript.length, 'chars, Translated length:', finalTranscript.length, 'chars');
        console.log('[Transcription] Translation time:', translationTime, 'ms');
        console.log('[Transcription] Raw sample:', JSON.stringify(rawTranscript.substring(0, 100) + '...'));
        console.log('[Transcription] Translated sample:', JSON.stringify(finalTranscript.substring(0, 100) + '...'));
        console.log('[Transcription] Stats:', translationResult.stats);
      } catch (translationError) {
        console.warn('Translation failed, using raw transcript:', translationError);
        translationWarning = true;
        // Fall back to raw transcript
      }

      setState((prev) => ({
        ...prev,
        transcript: finalTranscript,
        rawTranscript,
        cleanedTranscript,
        isTranslating: false,
        translationWarning,
      }));

      return { transcript: finalTranscript, rawTranscript, cleanedTranscript };
    } catch (error) {
      console.error('Whisper transcription failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Transcription failed';
      setTranscribeError(errorMessage);
      setState((prev) => ({
        ...prev,
        isTranscribing: false,
        isTranslating: false,
      }));
      return { transcript: '', rawTranscript: '', cleanedTranscript: '' };
    }
  }, [mode]);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      setTranscribeError(null);
      setDetectedLanguage(null);
      chunksRef.current = [];
      transcriptRef.current = '';

      // Check if we're on HTTPS or localhost
      if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
        throw new Error('L\'enregistrement audio nécessite une connexion HTTPS. Utilisez https:// ou localhost.');
      }

      // Check if MediaRecorder is supported
      if (!window.MediaRecorder) {
        throw new Error('Votre navigateur ne supporte pas l\'enregistrement audio. Utilisez Chrome, Firefox, ou Edge.');
      }

      console.log('Requesting microphone access...');

      // Check current permission status
      if (navigator.permissions) {
        const permissionStatus = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        console.log('Microphone permission status:', permissionStatus.state);
        if (permissionStatus.state === 'denied') {
          throw new Error('L\'accès au microphone est bloqué. Vérifiez les paramètres de votre navigateur et de Windows.');
        }
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000, // Higher sample rate for better quality
          channelCount: 1, // Mono for better speech recognition
        },
      });
      console.log('Microphone access granted');

      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(1000);

      // Start timer
      const startTime = Date.now();
      intervalRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        setState((prev) => ({
          ...prev,
          duration: elapsed,
          isRecording: true,
          isPaused: false,
        }));
      }, 1000);

      setState((prev) => ({
        ...prev,
        isRecording: true,
        isPaused: false,
        duration: 0,
      }));

      console.log('Recording started successfully');

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start recording';
      console.error('Recording start error:', message);
      setError(message);
      throw err;
    }
  }, [mode, enableDiagnostics]);

  const stopRecording = useCallback(async (): Promise<{ blob: Blob | null; transcript: string; rawTranscript: string; cleanedTranscript: string }> => {
    // Immediately stop the timer
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Stop media stream tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    return new Promise((resolve) => {
      if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
        setState((prev) => ({
          ...prev,
          isRecording: false,
          isPaused: false,
        }));
        resolve({ blob: null, transcript: '', rawTranscript: '', cleanedTranscript: '' });
        return;
      }

      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });

        setState((prev) => ({
          ...prev,
          isRecording: false,
          isPaused: false,
        }));

        mediaRecorderRef.current = null;

        const result = await transcribeAudioBlob(audioBlob);
        resolve({ blob: audioBlob, transcript: result.transcript, rawTranscript: result.rawTranscript, cleanedTranscript: result.cleanedTranscript });
      };

      mediaRecorderRef.current.stop();
    });
  }, [transcribeAudioBlob]);

  const transcribeFile = useCallback(async (file: File): Promise<{ blob: Blob; transcript: string; rawTranscript: string; cleanedTranscript: string; durationSeconds: number }> => {
    setError(null);
    setTranscribeError(null);
    setDetectedLanguage(null);
    transcriptRef.current = '';

    const audioBlob = file.slice(0, file.size, file.type || 'audio/webm');
    const durationSeconds = await getAudioDuration(audioBlob);

    setState((prev) => ({
      ...prev,
      isRecording: false,
      isPaused: false,
      duration: durationSeconds,
    }));

    const result = await transcribeAudioBlob(audioBlob);
    return { blob: audioBlob, transcript: result.transcript, rawTranscript: result.rawTranscript, cleanedTranscript: result.cleanedTranscript, durationSeconds };
  }, [getAudioDuration, transcribeAudioBlob]);

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && state.isRecording && !state.isPaused) {
      mediaRecorderRef.current.pause();

      setState((prev) => ({ ...prev, isPaused: true }));

      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
  }, [state.isRecording, state.isPaused]);

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current && state.isRecording && state.isPaused) {
      mediaRecorderRef.current.resume();

      setState((prev) => ({ ...prev, isPaused: false }));

      intervalRef.current = setInterval(() => {
        setState((prev) => ({
          ...prev,
          duration: prev.duration + 1,
        }));
      }, 1000);
    }
  }, [state.isRecording, state.isPaused]);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    state,
    startRecording,
    stopRecording,
    transcribeFile,
    pauseRecording,
    resumeRecording,
    error,
    detectedLanguage,
    transcribeError,
  };
}
