import { useState, useCallback, useRef, useEffect } from 'react';
import { 
  Mic, MicOff, Video, Square, Play, Pause, Save, Trash2, 
  Languages, User, Clock, FileText, Sparkles, Volume2, X,
  ChevronDown, ChevronUp, Edit2, Check
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useToast } from '@/hooks/use-toast';
import { useRecordings } from '@/hooks/useRecordings';
import { useLiveTranscription, type TranscriptSegment } from '@/hooks/useLiveTranscription';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { AudioWaveform, SimpleWaveform } from '@/components/AudioWaveform';

interface LiveRecorderProps {
  onClose: () => void;
  onTranscriptReady?: (recordingId: string, transcript: string) => void;
}

const LANGUAGES = [
  { code: 'hi-IN', label: 'हिंदी (Hindi)' },
  { code: 'en-IN', label: 'English (India)' },
  { code: 'bn-IN', label: 'বাংলা (Bengali)' },
  { code: 'ta-IN', label: 'தமிழ் (Tamil)' },
  { code: 'te-IN', label: 'తెలుగు (Telugu)' },
  { code: 'mr-IN', label: 'मराठी (Marathi)' },
  { code: 'gu-IN', label: 'ગુજરાતી (Gujarati)' },
  { code: 'kn-IN', label: 'ಕನ್ನಡ (Kannada)' },
  { code: 'ml-IN', label: 'മലയാളം (Malayalam)' },
  { code: 'pa-IN', label: 'ਪੰਜਾਬੀ (Punjabi)' },
  { code: 'ur-IN', label: 'اردو (Urdu)' },
];

export function LiveRecorder({ onClose, onTranscriptReady }: LiveRecorderProps) {
  const { toast } = useToast();
  const { createRecording, updateRecording, saveTranscript } = useRecordings();
  
  // Recording state
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [recordingName, setRecordingName] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [storageType, setStorageType] = useState<'cloud' | 'local'>('cloud');
  const [language, setLanguage] = useState('hi-IN');
  const [showCaptions, setShowCaptions] = useState(true);
  const [amplifyAudio, setAmplifyAudio] = useState(false);
  
  // Edit state
  const [editingSegmentId, setEditingSegmentId] = useState<string | null>(null);
  const [editedText, setEditedText] = useState('');
  const [showSummary, setShowSummary] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [keyPoints, setKeyPoints] = useState<string[]>([]);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);

  // Media recorder
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

  // Live transcription
  const {
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
  } = useLiveTranscription({
    language,
    onError: (error) => toast({ title: 'Transcription Error', description: error, variant: 'destructive' }),
  });

  // Cleanup
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (audioContextRef.current) audioContextRef.current.close();
    };
  }, []);

  // Auto-scroll captions
  const captionsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (captionsRef.current) {
      captionsRef.current.scrollTop = captionsRef.current.scrollHeight;
    }
  }, [segments, interimText]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const startRecording = useCallback(async () => {
    try {
      // Create recording entry
      const name = recordingName || `Recording ${new Date().toLocaleString()}`;
      const recording = await createRecording(name, storageType);
      if (!recording) return;
      setRecordingId(recording.id);

      // Get media stream with audio enhancement
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // Apply audio amplification if enabled
      if (amplifyAudio) {
        audioContextRef.current = new AudioContext();
        const source = audioContextRef.current.createMediaStreamSource(stream);
        gainNodeRef.current = audioContextRef.current.createGain();
        gainNodeRef.current.gain.value = 2.0; // 2x amplification
        const destination = audioContextRef.current.createMediaStreamDestination();
        source.connect(gainNodeRef.current);
        gainNodeRef.current.connect(destination);
        streamRef.current = destination.stream;
      } else {
        streamRef.current = stream;
      }

      // Setup media recorder
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const mediaRecorder = new MediaRecorder(streamRef.current, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.start(1000);
      setIsRecording(true);
      setDuration(0);

      // Start timer
      timerRef.current = setInterval(() => {
        setDuration(d => d + 1);
      }, 1000);

      // Start live transcription
      await startTranscription();

      toast({ title: '🎙️ Recording started', description: 'Live transcription is active' });
    } catch (error) {
      console.error('Recording error:', error);
      toast({
        title: 'Recording failed',
        description: error instanceof Error ? error.message : 'Could not start recording',
        variant: 'destructive',
      });
    }
  }, [recordingName, storageType, amplifyAudio, createRecording, startTranscription, toast]);

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      if (isPaused) {
        mediaRecorderRef.current.resume();
        timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
      } else {
        mediaRecorderRef.current.pause();
        if (timerRef.current) clearInterval(timerRef.current);
      }
      setIsPaused(!isPaused);
    }
  }, [isRecording, isPaused]);

  const stopRecording = useCallback(async () => {
    // Stop timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    // Stop transcription
    stopTranscription();

    // Stop media recorder
    if (mediaRecorderRef.current && isRecording) {
      return new Promise<void>((resolve) => {
        mediaRecorderRef.current!.onstop = async () => {
          // Create blob
          const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
          const blob = new Blob(chunksRef.current, { type: mimeType });

          // Stop stream
          streamRef.current?.getTracks().forEach(t => t.stop());

          // Upload to storage if cloud mode
          if (storageType === 'cloud' && recordingId) {
            try {
              const { data: { user } } = await supabase.auth.getUser();
              if (user) {
                const filePath = `${user.id}/recordings/${recordingId}.webm`;
                await supabase.storage.from('media').upload(filePath, blob);
                await updateRecording(recordingId, {
                  file_path: filePath,
                  file_size: blob.size,
                  duration_seconds: duration,
                  status: 'completed',
                });
              }
            } catch (error) {
              console.error('Upload error:', error);
            }
          } else if (storageType === 'local') {
            // Save locally
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${recordingName || 'recording'}_${Date.now()}.webm`;
            a.click();
            URL.revokeObjectURL(url);
          }

          setIsRecording(false);
          setIsPaused(false);
          resolve();
        };
        mediaRecorderRef.current!.stop();
      });
    }
  }, [isRecording, stopTranscription, storageType, recordingId, recordingName, duration, updateRecording]);

  const generateSummary = useCallback(async () => {
    if (!recordingId || segments.length === 0) return;

    setIsGeneratingSummary(true);
    try {
      const transcript = getFullTranscript();
      
      // Call AI to generate summary
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-with-document`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            documentContent: transcript,
            action: 'summarize',
            customPrompt: `Analyze this transcript and provide:
1. A brief summary (2-3 sentences)
2. 5-7 key bullet points of the main discussion topics

Format as JSON: { "summary": "...", "keyPoints": ["...", "..."] }`,
          }),
        }
      );

      if (!response.ok) throw new Error('Failed to generate summary');

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response');

      const decoder = new TextDecoder();
      let fullResponse = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ') && line !== 'data: [DONE]') {
            try {
              const data = JSON.parse(line.slice(6));
              const content = data.choices?.[0]?.delta?.content;
              if (content) fullResponse += content;
            } catch { /* skip */ }
          }
        }
      }

      // Parse response
      const jsonMatch = fullResponse.match(/\{[\s\S]*?\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        setSummary(parsed.summary || fullResponse);
        setKeyPoints(parsed.keyPoints || []);
      } else {
        setSummary(fullResponse);
      }
      setShowSummary(true);
    } catch (error) {
      console.error('Summary error:', error);
      toast({ title: 'Error', description: 'Failed to generate summary', variant: 'destructive' });
    } finally {
      setIsGeneratingSummary(false);
    }
  }, [recordingId, segments.length, getFullTranscript, toast]);

  const saveAndClose = useCallback(async () => {
    if (!recordingId) {
      onClose();
      return;
    }

    // Stop if still recording
    if (isRecording) {
      await stopRecording();
    }

    // Save transcript
    const transcript = getFullTranscript();
    const segmentsToSave = segments.map((s, i) => ({
      segment_index: i,
      speaker_label: s.speakerLabel,
      text: s.text,
      start_time: s.startTime,
      end_time: s.endTime,
      confidence: null,
    }));

    await saveTranscript(
      recordingId,
      transcript,
      segmentsToSave,
      language,
      getSpeakerCount(),
      summary || undefined,
      keyPoints.length > 0 ? keyPoints : undefined
    );

    await updateRecording(recordingId, { status: 'completed' });

    toast({ title: '✅ Recording saved', description: 'Transcript and summary saved successfully' });
    onTranscriptReady?.(recordingId, transcript);
    onClose();
  }, [recordingId, isRecording, stopRecording, getFullTranscript, segments, language, getSpeakerCount, summary, keyPoints, saveTranscript, updateRecording, toast, onTranscriptReady, onClose]);

  const startEditingSegment = (segment: TranscriptSegment) => {
    setEditingSegmentId(segment.id);
    setEditedText(segment.text);
  };

  const saveSegmentEdit = (segmentId: string) => {
    // In real implementation, would update the segments state
    // For now, just clear editing state
    setEditingSegmentId(null);
    setEditedText('');
  };

  if (!isSupported) {
    return (
      <Card className="w-full max-w-2xl mx-auto">
        <CardContent className="p-6 text-center">
          <MicOff className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="font-semibold mb-2">Speech Recognition Not Supported</h3>
          <p className="text-muted-foreground text-sm">
            Please use Chrome, Edge, or Safari for live transcription features.
          </p>
          <Button onClick={onClose} className="mt-4">Close</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-3xl mx-auto">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2">
          <Mic className="w-5 h-5" />
          Live Recording
        </CardTitle>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Setup (before recording) */}
        {!isRecording && !recordingId && (
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Recording Name</Label>
              <Input
                id="name"
                placeholder="Enter recording name..."
                value={recordingName}
                onChange={(e) => setRecordingName(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Language</Label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {LANGUAGES.map(lang => (
                    <option key={lang.code} value={lang.code}>{lang.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <Label>Storage</Label>
                <select
                  value={storageType}
                  onChange={(e) => setStorageType(e.target.value as 'cloud' | 'local')}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="cloud">☁️ Cloud (Sync)</option>
                  <option value="local">💾 Local (Download)</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Switch
                  checked={showCaptions}
                  onCheckedChange={setShowCaptions}
                  id="captions"
                />
                <Label htmlFor="captions">Show Live Captions</Label>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  checked={amplifyAudio}
                  onCheckedChange={setAmplifyAudio}
                  id="amplify"
                />
                <Label htmlFor="amplify" className="flex items-center gap-1">
                  <Volume2 className="w-4 h-4" />
                  Amplify Audio
                </Label>
              </div>
            </div>

            <Button onClick={startRecording} className="w-full gap-2" size="lg">
              <Mic className="w-5 h-5" />
              Start Recording
            </Button>
          </div>
        )}

        {/* Recording in progress */}
        {(isRecording || recordingId) && (
          <>
            {/* Waveform Visualization */}
            {isRecording && (
              <div className="rounded-lg border bg-muted/30 p-4">
                {streamRef.current ? (
                  <AudioWaveform
                    stream={streamRef.current}
                    isRecording={isRecording}
                    isPaused={isPaused}
                    className="h-16"
                  />
                ) : (
                  <SimpleWaveform isRecording={isRecording} isPaused={isPaused} />
                )}
              </div>
            )}

            {/* Timer and controls */}
            <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
              <div className="flex items-center gap-4">
                <div className={cn(
                  "flex items-center gap-2 text-2xl font-mono",
                  isRecording && !isPaused && "text-destructive"
                )}>
                  {isRecording && !isPaused && (
                    <span className="w-3 h-3 rounded-full bg-destructive animate-pulse" />
                  )}
                  <Clock className="w-5 h-5" />
                  {formatTime(duration)}
                </div>

                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="gap-1">
                    <User className="w-3 h-3" />
                    {getSpeakerCount()} speakers
                  </Badge>
                  <Badge variant="outline" className="gap-1">
                    <Languages className="w-3 h-3" />
                    {LANGUAGES.find(l => l.code === language)?.label.split(' ')[0]}
                  </Badge>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {isRecording && (
                  <>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={pauseRecording}
                    >
                      {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                    </Button>
                    <Button
                      variant="destructive"
                      size="icon"
                      onClick={stopRecording}
                    >
                      <Square className="w-4 h-4" />
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Live Captions */}
            {showCaptions && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Live Transcript
                  </h4>
                  {segments.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={generateSummary}
                      disabled={isGeneratingSummary || isRecording}
                      className="gap-1"
                    >
                      <Sparkles className="w-3 h-3" />
                      {isGeneratingSummary ? 'Generating...' : 'Generate Summary'}
                    </Button>
                  )}
                </div>

                <ScrollArea className="h-64 rounded-lg border bg-background p-3" ref={captionsRef}>
                  <div className="space-y-2">
                    {segments.map((segment) => (
                      <div key={segment.id} className="group">
                        {editingSegmentId === segment.id ? (
                          <div className="flex items-start gap-2">
                            <Badge variant="secondary" className="mt-1 shrink-0">
                              {segment.speakerLabel}
                            </Badge>
                            <Textarea
                              value={editedText}
                              onChange={(e) => setEditedText(e.target.value)}
                              className="flex-1 min-h-[60px]"
                            />
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => saveSegmentEdit(segment.id)}
                            >
                              <Check className="w-4 h-4" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-start gap-2">
                            <Badge variant="secondary" className="mt-1 shrink-0">
                              {segment.speakerLabel}
                            </Badge>
                            <p className="flex-1 text-sm">{segment.text}</p>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="opacity-0 group-hover:opacity-100 h-6 w-6"
                              onClick={() => startEditingSegment(segment)}
                            >
                              <Edit2 className="w-3 h-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Current speaker + interim text */}
                    {(isListening || interimText) && (
                      <div className="flex items-start gap-2 opacity-60">
                        <Badge variant="outline" className="mt-1 shrink-0">
                          Speaker {currentSpeaker}
                        </Badge>
                        <p className="flex-1 text-sm italic">
                          {interimText || '...'}
                        </p>
                      </div>
                    )}

                    {segments.length === 0 && !interimText && (
                      <p className="text-muted-foreground text-sm text-center py-8">
                        {isRecording ? 'Listening... Speak now!' : 'No transcript yet'}
                      </p>
                    )}
                  </div>
                </ScrollArea>
              </div>
            )}

            {/* Summary */}
            {showSummary && summary && (
              <Collapsible open={showSummary} onOpenChange={setShowSummary}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full justify-between">
                    <span className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4" />
                      Summary & Key Points
                    </span>
                    {showSummary ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-3 pt-2">
                  <div className="rounded-lg border bg-muted/30 p-3">
                    <h5 className="font-medium mb-1">Summary</h5>
                    <p className="text-sm text-muted-foreground">{summary}</p>
                  </div>
                  
                  {keyPoints.length > 0 && (
                    <div className="rounded-lg border bg-muted/30 p-3">
                      <h5 className="font-medium mb-2">Key Points</h5>
                      <ul className="space-y-1">
                        {keyPoints.map((point, i) => (
                          <li key={i} className="text-sm flex items-start gap-2">
                            <span className="text-primary">•</span>
                            {point}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Actions */}
            {!isRecording && recordingId && (
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    resetTranscription();
                    setRecordingId(null);
                    setSummary(null);
                    setKeyPoints([]);
                  }}
                  className="gap-1"
                >
                  <Trash2 className="w-4 h-4" />
                  Discard
                </Button>
                <Button onClick={saveAndClose} className="flex-1 gap-1">
                  <Save className="w-4 h-4" />
                  Save Recording
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
