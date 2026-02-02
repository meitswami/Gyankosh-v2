-- Fix shared_chats public data exposure vulnerability

-- Drop the overly permissive SELECT policy that allows anyone to see all records
DROP POLICY IF EXISTS "Anyone can view shared chats by token" ON public.shared_chats;

-- Drop the existing UPDATE policy if it exists
DROP POLICY IF EXISTS "Anyone can update view count" ON public.shared_chats;

-- Create a secure RPC function for fetching shared chat by token
-- This validates the token and expiration in a controlled way
CREATE OR REPLACE FUNCTION public.get_shared_chat_by_token(p_token TEXT)
RETURNS TABLE (
  id uuid,
  title text,
  messages_snapshot jsonb,
  created_at timestamptz,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    sc.id,
    sc.title,
    sc.messages_snapshot,
    sc.created_at,
    sc.expires_at
  FROM public.shared_chats sc
  WHERE sc.share_token = p_token
    AND (sc.expires_at IS NULL OR sc.expires_at > now());
END;
$$;

-- Create a secure RPC function for incrementing view count
-- This validates the token before incrementing
CREATE OR REPLACE FUNCTION public.increment_chat_view_count(p_token TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.shared_chats
  SET view_count = view_count + 1
  WHERE share_token = p_token
    AND (expires_at IS NULL OR expires_at > now());
END;
$$;