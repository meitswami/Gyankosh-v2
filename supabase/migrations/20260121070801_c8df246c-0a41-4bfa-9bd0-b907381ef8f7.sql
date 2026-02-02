-- Fix security definer view by dropping and recreating with SECURITY INVOKER
DROP VIEW IF EXISTS public.friendships;

-- Recreate as a function instead (more secure)
CREATE OR REPLACE FUNCTION public.get_friends(p_user_id UUID DEFAULT auth.uid())
RETURNS TABLE (friend_id UUID, friends_since TIMESTAMP WITH TIME ZONE)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    CASE WHEN from_user_id = p_user_id THEN to_user_id ELSE from_user_id END as friend_id,
    fr.created_at as friends_since
  FROM public.friend_requests fr
  WHERE fr.status = 'accepted' 
    AND (fr.from_user_id = p_user_id OR fr.to_user_id = p_user_id);
END;
$$;