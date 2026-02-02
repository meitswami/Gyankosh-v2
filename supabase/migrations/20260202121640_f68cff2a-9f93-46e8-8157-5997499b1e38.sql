-- Create function to update timestamps (if not exists)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create media_files table to store video/audio metadata and transcripts
CREATE TABLE public.media_files (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  alias TEXT,
  media_type TEXT NOT NULL CHECK (media_type IN ('video', 'audio')),
  source_type TEXT NOT NULL CHECK (source_type IN ('upload', 'youtube', 'url')),
  source_url TEXT,
  file_path TEXT,
  file_size BIGINT,
  duration_seconds NUMERIC,
  thumbnail_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'ready', 'error')),
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create media_transcripts table for storing full transcripts with speaker info
CREATE TABLE public.media_transcripts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  media_id UUID NOT NULL REFERENCES public.media_files(id) ON DELETE CASCADE,
  full_text TEXT NOT NULL,
  language TEXT,
  speakers_detected INTEGER DEFAULT 1,
  processing_time_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create media_segments table for time-based segments with speaker diarization
CREATE TABLE public.media_segments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  media_id UUID NOT NULL REFERENCES public.media_files(id) ON DELETE CASCADE,
  transcript_id UUID REFERENCES public.media_transcripts(id) ON DELETE CASCADE,
  segment_index INTEGER NOT NULL,
  start_time NUMERIC NOT NULL,
  end_time NUMERIC NOT NULL,
  text TEXT NOT NULL,
  speaker_id TEXT,
  speaker_label TEXT,
  confidence NUMERIC,
  is_key_moment BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create media_qa table to store Q&A history for reuse
CREATE TABLE public.media_qa (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  media_id UUID NOT NULL REFERENCES public.media_files(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  relevant_segment_ids UUID[],
  relevant_timestamps NUMERIC[],
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.media_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_qa ENABLE ROW LEVEL SECURITY;

-- RLS Policies for media_files
CREATE POLICY "Users can view their own media files"
  ON public.media_files FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own media files"
  ON public.media_files FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own media files"
  ON public.media_files FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own media files"
  ON public.media_files FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for media_transcripts (via media_files ownership)
CREATE POLICY "Users can view transcripts of their media"
  ON public.media_transcripts FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.media_files WHERE id = media_id AND user_id = auth.uid()
  ));

CREATE POLICY "Users can insert transcripts for their media"
  ON public.media_transcripts FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.media_files WHERE id = media_id AND user_id = auth.uid()
  ));

-- RLS Policies for media_segments (via media_files ownership)
CREATE POLICY "Users can view segments of their media"
  ON public.media_segments FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.media_files WHERE id = media_id AND user_id = auth.uid()
  ));

CREATE POLICY "Users can insert segments for their media"
  ON public.media_segments FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.media_files WHERE id = media_id AND user_id = auth.uid()
  ));

-- RLS Policies for media_qa
CREATE POLICY "Users can view their own Q&A"
  ON public.media_qa FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own Q&A"
  ON public.media_qa FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX idx_media_files_user_id ON public.media_files(user_id);
CREATE INDEX idx_media_files_status ON public.media_files(status);
CREATE INDEX idx_media_segments_media_id ON public.media_segments(media_id);
CREATE INDEX idx_media_segments_timestamps ON public.media_segments(media_id, start_time, end_time);
CREATE INDEX idx_media_qa_media_id ON public.media_qa(media_id);

-- Create updated_at trigger for media_files
CREATE TRIGGER update_media_files_updated_at
  BEFORE UPDATE ON public.media_files
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for media files (500MB limit per file)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('media', 'media', false, 524288000)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for media bucket
CREATE POLICY "Users can view their own media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'media' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can upload their own media"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'media' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own media"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'media' AND auth.uid()::text = (storage.foldername(name))[1]);