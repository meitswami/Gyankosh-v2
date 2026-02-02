-- Create chat_sessions table to store chat conversations
CREATE TABLE public.chat_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'New Chat',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;

-- RLS policies for public access (dummy auth)
CREATE POLICY "Anyone can view sessions" ON public.chat_sessions FOR SELECT USING (true);
CREATE POLICY "Anyone can insert sessions" ON public.chat_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update sessions" ON public.chat_sessions FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete sessions" ON public.chat_sessions FOR DELETE USING (true);

-- Add session_id to chat_messages
ALTER TABLE public.chat_messages ADD COLUMN session_id UUID REFERENCES public.chat_sessions(id) ON DELETE CASCADE;

-- Create trigger for updated_at
CREATE TRIGGER update_chat_sessions_updated_at
BEFORE UPDATE ON public.chat_sessions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();