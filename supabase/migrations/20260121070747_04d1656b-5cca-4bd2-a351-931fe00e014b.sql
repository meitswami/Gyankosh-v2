-- Create profiles table for user presence and info
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  status TEXT DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'away')),
  last_seen TIMESTAMP WITH TIME ZONE DEFAULT now(),
  public_key TEXT, -- For E2E encryption (Web Crypto API)
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles are viewable by authenticated users
CREATE POLICY "Profiles viewable by authenticated users" 
ON public.profiles FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Users can update their own profile
CREATE POLICY "Users can update own profile" 
ON public.profiles FOR UPDATE 
USING (auth.uid() = user_id);

-- Users can insert their own profile
CREATE POLICY "Users can insert own profile" 
ON public.profiles FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Friend requests table
CREATE TABLE public.friend_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  from_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(from_user_id, to_user_id)
);

ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;

-- Users can view friend requests involving them
CREATE POLICY "Users can view own friend requests" 
ON public.friend_requests FOR SELECT 
USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);

-- Users can send friend requests
CREATE POLICY "Users can send friend requests" 
ON public.friend_requests FOR INSERT 
WITH CHECK (auth.uid() = from_user_id);

-- Users can update requests they received
CREATE POLICY "Users can respond to friend requests" 
ON public.friend_requests FOR UPDATE 
USING (auth.uid() = to_user_id);

-- Users can delete their own requests
CREATE POLICY "Users can delete own requests" 
ON public.friend_requests FOR DELETE 
USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);

-- Friendships view (accepted friends)
CREATE OR REPLACE VIEW public.friendships AS
SELECT 
  CASE WHEN from_user_id = auth.uid() THEN to_user_id ELSE from_user_id END as friend_id,
  created_at as friends_since
FROM public.friend_requests
WHERE status = 'accepted' 
  AND (from_user_id = auth.uid() OR to_user_id = auth.uid());

-- Direct messages table (E2E encrypted)
CREATE TABLE public.direct_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  encrypted_content TEXT NOT NULL, -- E2E encrypted message
  iv TEXT NOT NULL, -- Initialization vector for decryption
  content_type TEXT DEFAULT 'text' CHECK (content_type IN ('text', 'file', 'document')),
  file_url TEXT, -- For shared files (also encrypted)
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;

-- Users can view messages they sent or received
CREATE POLICY "Users can view own messages" 
ON public.direct_messages FOR SELECT 
USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

-- Users can send messages (only to friends - enforced at app level)
CREATE POLICY "Users can send messages" 
ON public.direct_messages FOR INSERT 
WITH CHECK (auth.uid() = sender_id);

-- Recipients can mark messages as read
CREATE POLICY "Recipients can mark messages read" 
ON public.direct_messages FOR UPDATE 
USING (auth.uid() = recipient_id);

-- Users can delete their own sent messages
CREATE POLICY "Users can delete own messages" 
ON public.direct_messages FOR DELETE 
USING (auth.uid() = sender_id);

-- Enable realtime for messages and presence
ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.friend_requests;

-- Trigger for updated_at
CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_friend_requests_updated_at
BEFORE UPDATE ON public.friend_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster message queries
CREATE INDEX idx_direct_messages_participants ON public.direct_messages(sender_id, recipient_id);
CREATE INDEX idx_direct_messages_created_at ON public.direct_messages(created_at DESC);
CREATE INDEX idx_friend_requests_status ON public.friend_requests(status);
CREATE INDEX idx_profiles_status ON public.profiles(status);