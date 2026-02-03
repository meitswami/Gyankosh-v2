-- Create recordings table
CREATE TABLE public.recordings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  duration_seconds NUMERIC,
  file_path TEXT,
  file_size BIGINT,
  status TEXT NOT NULL DEFAULT 'draft',
  storage_type TEXT NOT NULL DEFAULT 'cloud',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create recording_transcripts table
CREATE TABLE public.recording_transcripts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recording_id UUID NOT NULL REFERENCES public.recordings(id) ON DELETE CASCADE,
  original_text TEXT NOT NULL,
  edited_text TEXT,
  language TEXT,
  speakers_detected INTEGER DEFAULT 1,
  summary TEXT,
  key_points JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create recording_segments table (for speaker-separated transcript)
CREATE TABLE public.recording_segments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recording_id UUID NOT NULL REFERENCES public.recordings(id) ON DELETE CASCADE,
  transcript_id UUID REFERENCES public.recording_transcripts(id) ON DELETE CASCADE,
  segment_index INTEGER NOT NULL,
  speaker_label TEXT,
  text TEXT NOT NULL,
  start_time NUMERIC NOT NULL,
  end_time NUMERIC NOT NULL,
  confidence NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create user_folders table
CREATE TABLE public.user_folders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  parent_id UUID REFERENCES public.user_folders(id) ON DELETE CASCADE,
  folder_type TEXT NOT NULL DEFAULT 'custom',
  icon TEXT,
  color TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, name, parent_id)
);

-- Add folder_id to documents table
ALTER TABLE public.documents ADD COLUMN folder_id UUID REFERENCES public.user_folders(id) ON DELETE SET NULL;

-- Add folder_id to recordings table
ALTER TABLE public.recordings ADD COLUMN folder_id UUID REFERENCES public.user_folders(id) ON DELETE SET NULL;

-- Enable RLS
ALTER TABLE public.recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recording_transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recording_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_folders ENABLE ROW LEVEL SECURITY;

-- RLS Policies for recordings
CREATE POLICY "Users can view their own recordings" ON public.recordings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own recordings" ON public.recordings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own recordings" ON public.recordings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own recordings" ON public.recordings FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for recording_transcripts
CREATE POLICY "Users can view their recording transcripts" ON public.recording_transcripts FOR SELECT
USING (EXISTS (SELECT 1 FROM public.recordings WHERE recordings.id = recording_transcripts.recording_id AND recordings.user_id = auth.uid()));
CREATE POLICY "Users can insert their recording transcripts" ON public.recording_transcripts FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM public.recordings WHERE recordings.id = recording_transcripts.recording_id AND recordings.user_id = auth.uid()));
CREATE POLICY "Users can update their recording transcripts" ON public.recording_transcripts FOR UPDATE
USING (EXISTS (SELECT 1 FROM public.recordings WHERE recordings.id = recording_transcripts.recording_id AND recordings.user_id = auth.uid()));
CREATE POLICY "Users can delete their recording transcripts" ON public.recording_transcripts FOR DELETE
USING (EXISTS (SELECT 1 FROM public.recordings WHERE recordings.id = recording_transcripts.recording_id AND recordings.user_id = auth.uid()));

-- RLS Policies for recording_segments
CREATE POLICY "Users can view their recording segments" ON public.recording_segments FOR SELECT
USING (EXISTS (SELECT 1 FROM public.recordings WHERE recordings.id = recording_segments.recording_id AND recordings.user_id = auth.uid()));
CREATE POLICY "Users can insert their recording segments" ON public.recording_segments FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM public.recordings WHERE recordings.id = recording_segments.recording_id AND recordings.user_id = auth.uid()));

-- RLS Policies for user_folders
CREATE POLICY "Users can view their own folders" ON public.user_folders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own folders" ON public.user_folders FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own folders" ON public.user_folders FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own folders" ON public.user_folders FOR DELETE USING (auth.uid() = user_id);

-- Create updated_at triggers
CREATE TRIGGER update_recordings_updated_at BEFORE UPDATE ON public.recordings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_recording_transcripts_updated_at BEFORE UPDATE ON public.recording_transcripts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_user_folders_updated_at BEFORE UPDATE ON public.user_folders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();