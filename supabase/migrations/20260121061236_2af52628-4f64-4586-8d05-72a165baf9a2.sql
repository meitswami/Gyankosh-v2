-- Create shared_chats table for public chat links
CREATE TABLE public.shared_chats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES public.chat_sessions(id) ON DELETE CASCADE NOT NULL,
  share_token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  messages_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  title TEXT NOT NULL DEFAULT 'Shared Chat',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE,
  user_id UUID NOT NULL
);

-- Create shared_documents table for public document links
CREATE TABLE public.shared_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID REFERENCES public.documents(id) ON DELETE CASCADE NOT NULL,
  share_token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE,
  user_id UUID NOT NULL,
  view_count INTEGER NOT NULL DEFAULT 0
);

-- Enable RLS
ALTER TABLE public.shared_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_documents ENABLE ROW LEVEL SECURITY;

-- RLS policies for shared_chats: owners can manage, anyone can view by token
CREATE POLICY "Users can insert their own shared chats"
  ON public.shared_chats FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own shared chats"
  ON public.shared_chats FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own shared chats"
  ON public.shared_chats FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Anyone can view shared chats by token"
  ON public.shared_chats FOR SELECT
  USING (true);

-- RLS policies for shared_documents: owners can manage, anyone can view by token
CREATE POLICY "Users can insert their own shared documents"
  ON public.shared_documents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own shared documents"
  ON public.shared_documents FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own shared documents"
  ON public.shared_documents FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Anyone can view shared documents by token"
  ON public.shared_documents FOR SELECT
  USING (true);

CREATE POLICY "Anyone can update view count"
  ON public.shared_documents FOR UPDATE
  USING (true)
  WITH CHECK (true);