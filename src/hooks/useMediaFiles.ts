import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface MediaFile {
  id: string;
  user_id: string;
  name: string;
  alias: string | null;
  media_type: 'video' | 'audio';
  source_type: 'upload' | 'youtube' | 'url';
  source_url: string | null;
  file_path: string | null;
  file_size: number | null;
  duration_seconds: number | null;
  thumbnail_url: string | null;
  status: 'pending' | 'processing' | 'ready' | 'error';
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface MediaTranscript {
  id: string;
  media_id: string;
  full_text: string;
  language: string | null;
  speakers_detected: number;
  processing_time_ms: number | null;
  created_at: string;
}

export interface MediaSegment {
  id: string;
  media_id: string;
  transcript_id: string | null;
  segment_index: number;
  start_time: number;
  end_time: number;
  text: string;
  speaker_id: string | null;
  speaker_label: string | null;
  confidence: number | null;
  is_key_moment: boolean;
  created_at: string;
}

export interface MediaQA {
  id: string;
  media_id: string;
  user_id: string;
  question: string;
  answer: string;
  relevant_segment_ids: string[] | null;
  relevant_timestamps: number[] | null;
  created_at: string;
}

const TRANSCRIBE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/transcribe-media`;
const MEDIA_QA_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/media-qa`;

export function useMediaFiles() {
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchMediaFiles = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase
        .from('media_files')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setMediaFiles((data || []) as MediaFile[]);
    } catch (error) {
      console.error('Error fetching media files:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const uploadMediaFile = useCallback(async (file: File, mediaType: 'video' | 'audio'): Promise<string | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Upload to storage
      const filePath = `${user.id}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('media')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Create media file record
      const { data: mediaFile, error: dbError } = await supabase
        .from('media_files')
        .insert({
          user_id: user.id,
          name: file.name,
          alias: file.name.replace(/\.[^/.]+$/, ''),
          media_type: mediaType,
          source_type: 'upload',
          file_path: filePath,
          file_size: file.size,
          status: 'pending',
        })
        .select()
        .single();

      if (dbError) throw dbError;

      setMediaFiles(prev => [mediaFile as MediaFile, ...prev]);

      // Trigger transcription
      await triggerTranscription(mediaFile.id, file);

      return mediaFile.id;
    } catch (error) {
      console.error('Error uploading media:', error);
      toast({
        title: 'Upload Failed',
        description: error instanceof Error ? error.message : 'Failed to upload file',
        variant: 'destructive',
      });
      return null;
    }
  }, [toast]);

  const uploadFromUrl = useCallback(async (url: string, mediaType: 'video' | 'audio', sourceType: 'youtube' | 'url'): Promise<string | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const fileName = sourceType === 'youtube' 
        ? `YouTube_${url.split('v=')[1]?.split('&')[0] || Date.now()}`
        : new URL(url).pathname.split('/').pop() || `external_${Date.now()}`;

      const { data: mediaFile, error: dbError } = await supabase
        .from('media_files')
        .insert({
          user_id: user.id,
          name: fileName,
          alias: fileName,
          media_type: mediaType,
          source_type: sourceType,
          source_url: url,
          status: 'pending',
        })
        .select()
        .single();

      if (dbError) throw dbError;

      setMediaFiles(prev => [mediaFile as MediaFile, ...prev]);

      // Note: For URLs, we'd need to download and process
      // This is a simplified version - full implementation would need URL fetching
      toast({
        title: 'URL Added',
        description: `${sourceType === 'youtube' ? 'YouTube' : 'URL'} link added to processing queue`,
      });

      return mediaFile.id;
    } catch (error) {
      console.error('Error adding URL:', error);
      toast({
        title: 'Failed to Add URL',
        description: error instanceof Error ? error.message : 'Could not add URL',
        variant: 'destructive',
      });
      return null;
    }
  }, [toast]);

  const triggerTranscription = useCallback(async (mediaId: string, file: File) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');

      const formData = new FormData();
      formData.append('audio', file);
      formData.append('media_id', mediaId);
      formData.append('language', 'hi-en'); // Hindi-English mixed

      const response = await fetch(TRANSCRIBE_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Transcription failed');
      }

      const result = await response.json();
      
      // Update local state
      setMediaFiles(prev => prev.map(m => 
        m.id === mediaId 
          ? { ...m, status: 'ready' as const }
          : m
      ));

      toast({
        title: 'Transcription Complete',
        description: `${result.segments_count} segments processed in ${Math.round(result.processing_time_ms / 1000)}s`,
      });

    } catch (error) {
      console.error('Transcription error:', error);
      setMediaFiles(prev => prev.map(m => 
        m.id === mediaId 
          ? { ...m, status: 'error' as const, error_message: 'Transcription failed' }
          : m
      ));
    }
  }, [toast]);

  const askQuestion = useCallback(async (mediaId: string, question: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');

      const response = await fetch(MEDIA_QA_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ media_id: mediaId, question }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error('Rate limit exceeded. Please try again later.');
        }
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to process question');
      }

      return await response.json();
    } catch (error) {
      console.error('Q&A error:', error);
      throw error;
    }
  }, []);

  const getMediaSegments = useCallback(async (mediaId: string): Promise<MediaSegment[]> => {
    try {
      const { data, error } = await supabase
        .from('media_segments')
        .select('*')
        .eq('media_id', mediaId)
        .order('start_time', { ascending: true });

      if (error) throw error;
      return (data || []) as MediaSegment[];
    } catch (error) {
      console.error('Error fetching segments:', error);
      return [];
    }
  }, []);

  const getMediaQAs = useCallback(async (mediaId: string): Promise<MediaQA[]> => {
    try {
      const { data, error } = await supabase
        .from('media_qa')
        .select('*')
        .eq('media_id', mediaId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as MediaQA[];
    } catch (error) {
      console.error('Error fetching Q&As:', error);
      return [];
    }
  }, []);

  const deleteMediaFile = useCallback(async (id: string) => {
    try {
      const media = mediaFiles.find(m => m.id === id);
      if (media?.file_path) {
        await supabase.storage.from('media').remove([media.file_path]);
      }

      const { error } = await supabase.from('media_files').delete().eq('id', id);
      if (error) throw error;

      setMediaFiles(prev => prev.filter(m => m.id !== id));
      toast({ title: 'Deleted', description: 'Media file removed' });
    } catch (error) {
      console.error('Delete error:', error);
      toast({ title: 'Delete failed', description: 'Could not delete file', variant: 'destructive' });
    }
  }, [mediaFiles, toast]);

  return {
    mediaFiles,
    loading,
    uploadMediaFile,
    uploadFromUrl,
    askQuestion,
    getMediaSegments,
    getMediaQAs,
    deleteMediaFile,
    refetch: fetchMediaFiles,
  };
}