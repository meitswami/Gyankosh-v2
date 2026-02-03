import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface Recording {
  id: string;
  user_id: string;
  name: string;
  duration_seconds: number | null;
  file_path: string | null;
  file_size: number | null;
  status: string;
  storage_type: string;
  folder_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecordingTranscript {
  id: string;
  recording_id: string;
  original_text: string;
  edited_text: string | null;
  language: string | null;
  speakers_detected: number | null;
  summary: string | null;
  key_points: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface RecordingSegment {
  id: string;
  recording_id: string;
  transcript_id: string | null;
  segment_index: number;
  speaker_label: string | null;
  text: string;
  start_time: number;
  end_time: number;
  confidence: number | null;
  created_at: string;
}

export function useRecordings() {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchRecordings = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setLoading(false);
      setRecordings([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('recordings')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRecordings((data || []) as Recording[]);
    } catch (error) {
      console.error('Error fetching recordings:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const createRecording = useCallback(async (
    name: string,
    storageType: 'cloud' | 'local' = 'cloud'
  ): Promise<Recording | null> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast({ title: 'Error', description: 'Please login first', variant: 'destructive' });
      return null;
    }

    try {
      const { data, error } = await supabase
        .from('recordings')
        .insert({
          user_id: user.id,
          name,
          status: 'recording',
          storage_type: storageType,
        })
        .select()
        .single();

      if (error) throw error;
      setRecordings(prev => [data as Recording, ...prev]);
      return data as Recording;
    } catch (error) {
      console.error('Error creating recording:', error);
      toast({ title: 'Error', description: 'Failed to create recording', variant: 'destructive' });
      return null;
    }
  }, [toast]);

  const updateRecording = useCallback(async (
    id: string,
    updates: Partial<Recording>
  ): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('recordings')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
      setRecordings(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
      return true;
    } catch (error) {
      console.error('Error updating recording:', error);
      return false;
    }
  }, []);

  const deleteRecording = useCallback(async (id: string): Promise<boolean> => {
    try {
      const recording = recordings.find(r => r.id === id);
      if (recording?.file_path) {
        await supabase.storage.from('media').remove([recording.file_path]);
      }

      const { error } = await supabase
        .from('recordings')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setRecordings(prev => prev.filter(r => r.id !== id));
      toast({ title: 'Recording deleted' });
      return true;
    } catch (error) {
      console.error('Error deleting recording:', error);
      toast({ title: 'Error', description: 'Failed to delete recording', variant: 'destructive' });
      return false;
    }
  }, [recordings, toast]);

  const saveTranscript = useCallback(async (
    recordingId: string,
    originalText: string,
    segments: Omit<RecordingSegment, 'id' | 'recording_id' | 'transcript_id' | 'created_at'>[],
    language?: string,
    speakersDetected?: number,
    summary?: string,
    keyPoints?: string[]
  ): Promise<RecordingTranscript | null> => {
    try {
      // Insert transcript
      const { data: transcript, error: transcriptError } = await supabase
        .from('recording_transcripts')
        .insert({
          recording_id: recordingId,
          original_text: originalText,
          language,
          speakers_detected: speakersDetected,
          summary,
          key_points: keyPoints,
        })
        .select()
        .single();

      if (transcriptError) throw transcriptError;

      // Insert segments if any
      if (segments.length > 0) {
        const segmentsToInsert = segments.map(seg => ({
          ...seg,
          recording_id: recordingId,
          transcript_id: transcript.id,
        }));

        const { error: segError } = await supabase
          .from('recording_segments')
          .insert(segmentsToInsert);

        if (segError) console.error('Error saving segments:', segError);
      }

      return transcript as RecordingTranscript;
    } catch (error) {
      console.error('Error saving transcript:', error);
      toast({ title: 'Error', description: 'Failed to save transcript', variant: 'destructive' });
      return null;
    }
  }, [toast]);

  const getTranscript = useCallback(async (recordingId: string): Promise<RecordingTranscript | null> => {
    try {
      const { data, error } = await supabase
        .from('recording_transcripts')
        .select('*')
        .eq('recording_id', recordingId)
        .single();

      if (error) throw error;
      return data as RecordingTranscript;
    } catch (error) {
      console.error('Error fetching transcript:', error);
      return null;
    }
  }, []);

  const getSegments = useCallback(async (recordingId: string): Promise<RecordingSegment[]> => {
    try {
      const { data, error } = await supabase
        .from('recording_segments')
        .select('*')
        .eq('recording_id', recordingId)
        .order('segment_index', { ascending: true });

      if (error) throw error;
      return (data || []) as RecordingSegment[];
    } catch (error) {
      console.error('Error fetching segments:', error);
      return [];
    }
  }, []);

  const updateTranscriptText = useCallback(async (
    transcriptId: string,
    editedText: string
  ): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('recording_transcripts')
        .update({ edited_text: editedText })
        .eq('id', transcriptId);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error updating transcript:', error);
      return false;
    }
  }, []);

  useEffect(() => {
    fetchRecordings();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) fetchRecordings();
      else if (event === 'SIGNED_OUT') {
        setRecordings([]);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchRecordings]);

  return {
    recordings,
    loading,
    createRecording,
    updateRecording,
    deleteRecording,
    saveTranscript,
    getTranscript,
    getSegments,
    updateTranscriptText,
    refetch: fetchRecordings,
  };
}
