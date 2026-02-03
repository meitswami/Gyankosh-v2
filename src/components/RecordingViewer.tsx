import { useState, useEffect, useCallback } from 'react';
import { 
  Play, Pause, Edit2, Check, X, Download, Trash2, 
  Clock, User, Languages, FileText, Sparkles, MessageSquare
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useRecordings, type Recording, type RecordingTranscript, type RecordingSegment } from '@/hooks/useRecordings';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface RecordingViewerProps {
  recording: Recording;
  onClose: () => void;
  onAskQuestion?: (question: string, context: string) => void;
}

export function RecordingViewer({ recording, onClose, onAskQuestion }: RecordingViewerProps) {
  const { getTranscript, getSegments, updateTranscriptText, deleteRecording } = useRecordings();
  
  const [transcript, setTranscript] = useState<RecordingTranscript | null>(null);
  const [segments, setSegments] = useState<RecordingSegment[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState('');
  const [activeTab, setActiveTab] = useState('transcript');
  const [question, setQuestion] = useState('');

  // Load transcript and segments
  useEffect(() => {
    const loadData = async () => {
      const [t, s] = await Promise.all([
        getTranscript(recording.id),
        getSegments(recording.id),
      ]);
      setTranscript(t);
      setSegments(s);
      if (t) {
        setEditedText(t.edited_text || t.original_text);
      }
    };
    loadData();
  }, [recording.id, getTranscript, getSegments]);

  // Load audio URL
  useEffect(() => {
    if (recording.file_path) {
      const loadAudio = async () => {
        const { data } = await supabase.storage
          .from('media')
          .createSignedUrl(recording.file_path!, 3600);
        if (data?.signedUrl) {
          setAudioUrl(data.signedUrl);
        }
      };
      loadAudio();
    }
  }, [recording.file_path]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSaveEdit = async () => {
    if (transcript && editedText !== transcript.edited_text) {
      await updateTranscriptText(transcript.id, editedText);
      setTranscript(prev => prev ? { ...prev, edited_text: editedText } : null);
    }
    setIsEditing(false);
  };

  const handleDelete = async () => {
    if (confirm('Are you sure you want to delete this recording?')) {
      await deleteRecording(recording.id);
      onClose();
    }
  };

  const handleAskQuestion = () => {
    if (question.trim() && onAskQuestion && transcript) {
      onAskQuestion(question, transcript.edited_text || transcript.original_text);
      setQuestion('');
    }
  };

  const handleDownload = () => {
    if (!transcript) return;
    
    const text = transcript.edited_text || transcript.original_text;
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${recording.name}_transcript.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="w-full max-w-3xl mx-auto">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="flex items-center gap-2">
            🎙️ {recording.name}
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {format(new Date(recording.created_at), 'PPpp')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={handleDownload}>
            <Download className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={handleDelete} className="text-destructive">
            <Trash2 className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Metadata */}
        <div className="flex flex-wrap gap-2">
          {recording.duration_seconds && (
            <Badge variant="outline" className="gap-1">
              <Clock className="w-3 h-3" />
              {formatTime(recording.duration_seconds)}
            </Badge>
          )}
          {transcript?.speakers_detected && (
            <Badge variant="outline" className="gap-1">
              <User className="w-3 h-3" />
              {transcript.speakers_detected} speakers
            </Badge>
          )}
          {transcript?.language && (
            <Badge variant="outline" className="gap-1">
              <Languages className="w-3 h-3" />
              {transcript.language}
            </Badge>
          )}
        </div>

        {/* Audio Player */}
        {audioUrl && (
          <audio controls src={audioUrl} className="w-full h-10" />
        )}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="transcript" className="gap-1">
              <FileText className="w-4 h-4" />
              Transcript
            </TabsTrigger>
            <TabsTrigger value="speakers" className="gap-1">
              <User className="w-4 h-4" />
              Speakers
            </TabsTrigger>
            <TabsTrigger value="summary" className="gap-1">
              <Sparkles className="w-4 h-4" />
              Summary
            </TabsTrigger>
          </TabsList>

          {/* Transcript Tab */}
          <TabsContent value="transcript" className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {isEditing ? 'Edit transcript (changes saved separately)' : 'Original transcript preserved'}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => isEditing ? handleSaveEdit() : setIsEditing(true)}
                className="gap-1"
              >
                {isEditing ? (
                  <>
                    <Check className="w-3 h-3" />
                    Save
                  </>
                ) : (
                  <>
                    <Edit2 className="w-3 h-3" />
                    Edit
                  </>
                )}
              </Button>
            </div>
            
            {isEditing ? (
              <Textarea
                value={editedText}
                onChange={(e) => setEditedText(e.target.value)}
                className="min-h-[300px] font-mono text-sm"
              />
            ) : (
              <ScrollArea className="h-[300px] rounded-lg border bg-muted/30 p-3">
                <pre className="text-sm whitespace-pre-wrap font-sans">
                  {transcript?.edited_text || transcript?.original_text || 'No transcript available'}
                </pre>
              </ScrollArea>
            )}
          </TabsContent>

          {/* Speakers Tab */}
          <TabsContent value="speakers">
            <ScrollArea className="h-[300px]">
              <div className="space-y-2">
                {segments.length > 0 ? (
                  segments.map((segment) => (
                    <div key={segment.id} className="flex items-start gap-2 p-2 rounded-lg hover:bg-muted/50">
                      <Badge variant="secondary" className="shrink-0 mt-0.5">
                        {segment.speaker_label || `Speaker ${segment.segment_index + 1}`}
                      </Badge>
                      <div className="flex-1">
                        <p className="text-sm">{segment.text}</p>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {formatTime(segment.start_time)} - {formatTime(segment.end_time)}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-center text-muted-foreground py-8">
                    No speaker segments available
                  </p>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* Summary Tab */}
          <TabsContent value="summary">
            <div className="space-y-4">
              {transcript?.summary ? (
                <div className="rounded-lg border bg-muted/30 p-4">
                  <h4 className="font-medium mb-2">Summary</h4>
                  <p className="text-sm text-muted-foreground">{transcript.summary}</p>
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-4">
                  No summary available
                </p>
              )}

              {transcript?.key_points && (transcript.key_points as string[]).length > 0 && (
                <div className="rounded-lg border bg-muted/30 p-4">
                  <h4 className="font-medium mb-2">Key Points</h4>
                  <ul className="space-y-1">
                    {(transcript.key_points as string[]).map((point, i) => (
                      <li key={i} className="text-sm flex items-start gap-2">
                        <span className="text-primary">•</span>
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* Q&A */}
        {onAskQuestion && transcript && (
          <div className="pt-4 border-t">
            <div className="flex items-center gap-2 mb-2">
              <MessageSquare className="w-4 h-4" />
              <h4 className="font-medium text-sm">Ask about this recording</h4>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Ask a question about the transcript..."
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAskQuestion()}
                className="flex-1 h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
              <Button onClick={handleAskQuestion} disabled={!question.trim()}>
                Ask
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
