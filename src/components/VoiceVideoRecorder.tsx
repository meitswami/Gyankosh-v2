import { useState, useCallback, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Mic, Video, Square, Play, Pause, X, Send } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface VoiceVideoRecorderProps {
  onSend: (blob: Blob, type: 'audio' | 'video', duration: number) => void;
  onCancel: () => void;
}

export function VoiceVideoRecorder({ onSend, onCancel }: VoiceVideoRecorderProps) {
  const [mode, setMode] = useState<'idle' | 'audio' | 'video'>('idle');
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const { toast } = useToast();

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const startRecording = useCallback(async (type: 'audio' | 'video') => {
    try {
      const constraints: MediaStreamConstraints = type === 'video' 
        ? { audio: true, video: { facingMode: 'user', width: 480, height: 480 } }
        : { audio: true };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      const mimeType = type === 'video' 
        ? (MediaRecorder.isTypeSupported('video/webm') ? 'video/webm' : 'video/mp4')
        : (MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4');

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setRecordedBlob(blob);
        setPreviewUrl(URL.createObjectURL(blob));
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start(100);
      setMode(type);
      setIsRecording(true);
      setDuration(0);

      // Start timer
      timerRef.current = setInterval(() => {
        setDuration(d => d + 1);
      }, 1000);

    } catch (error) {
      console.error('Recording error:', error);
      toast({
        title: 'Permission denied',
        description: `Please allow ${type === 'video' ? 'camera and ' : ''}microphone access`,
        variant: 'destructive',
      });
    }
  }, [toast]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [isRecording]);

  const togglePause = useCallback(() => {
    if (!mediaRecorderRef.current) return;
    
    if (isPaused) {
      mediaRecorderRef.current.resume();
      timerRef.current = setInterval(() => {
        setDuration(d => d + 1);
      }, 1000);
    } else {
      mediaRecorderRef.current.pause();
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    setIsPaused(!isPaused);
  }, [isPaused]);

  const handleSend = useCallback(() => {
    if (recordedBlob && mode !== 'idle') {
      onSend(recordedBlob, mode, duration);
      setRecordedBlob(null);
      setPreviewUrl(null);
      setMode('idle');
      setDuration(0);
    }
  }, [recordedBlob, mode, duration, onSend]);

  const handleCancel = useCallback(() => {
    if (isRecording) {
      stopRecording();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setRecordedBlob(null);
    setPreviewUrl(null);
    setMode('idle');
    setDuration(0);
    onCancel();
  }, [isRecording, stopRecording, previewUrl, onCancel]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Idle - show record buttons
  if (mode === 'idle') {
    return (
      <div className="flex items-center gap-2 p-3 border-t border-border bg-muted/30">
        <Button
          variant="outline"
          size="sm"
          onClick={() => startRecording('audio')}
          className="gap-2"
        >
          <Mic className="w-4 h-4" />
          Voice Note
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => startRecording('video')}
          className="gap-2"
        >
          <Video className="w-4 h-4" />
          Video Note
        </Button>
        <Button variant="ghost" size="icon" onClick={onCancel} className="ml-auto h-8 w-8">
          <X className="w-4 h-4" />
        </Button>
      </div>
    );
  }

  // Recording or Preview
  return (
    <div className="p-3 border-t border-border bg-muted/30 space-y-3">
      {/* Preview (video only) */}
      {mode === 'video' && (
        <div className="relative rounded-xl overflow-hidden bg-black aspect-square max-h-48 mx-auto">
          {isRecording && streamRef.current ? (
            <video
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover"
              ref={(el) => {
                if (el && streamRef.current) {
                  el.srcObject = streamRef.current;
                }
              }}
            />
          ) : previewUrl ? (
            <video
              ref={videoPreviewRef}
              src={previewUrl}
              className="w-full h-full object-cover"
              controls
            />
          ) : null}
          
          {isRecording && (
            <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-full bg-destructive text-destructive-foreground text-xs">
              <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
              REC
            </div>
          )}
        </div>
      )}

      {/* Audio waveform indicator */}
      {mode === 'audio' && isRecording && (
        <div className="flex items-center justify-center gap-1 h-12">
          {[...Array(12)].map((_, i) => (
            <div
              key={i}
              className="w-1 bg-primary rounded-full animate-pulse"
              style={{
                height: `${Math.random() * 100}%`,
                animationDelay: `${i * 100}ms`,
              }}
            />
          ))}
        </div>
      )}

      {/* Audio preview */}
      {mode === 'audio' && previewUrl && !isRecording && (
        <audio src={previewUrl} controls className="w-full h-10" />
      )}

      {/* Timer & Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`text-lg font-mono ${isRecording ? 'text-destructive' : 'text-foreground'}`}>
            {formatDuration(duration)}
          </span>
          {isRecording && (
            <span className="text-xs text-muted-foreground">
              {mode === 'audio' ? 'Recording audio...' : 'Recording video...'}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isRecording ? (
            <>
              <Button variant="outline" size="icon" onClick={togglePause} className="h-9 w-9">
                {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
              </Button>
              <Button variant="destructive" size="icon" onClick={stopRecording} className="h-9 w-9">
                <Square className="w-4 h-4" />
              </Button>
            </>
          ) : recordedBlob ? (
            <>
              <Button variant="outline" size="sm" onClick={handleCancel}>
                Discard
              </Button>
              <Button size="sm" onClick={handleSend} className="gap-1">
                <Send className="w-4 h-4" />
                Send
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
