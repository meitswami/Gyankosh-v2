-- Add view_count to shared_chats for realtime notifications
ALTER TABLE public.shared_chats 
ADD COLUMN IF NOT EXISTS view_count integer NOT NULL DEFAULT 0;