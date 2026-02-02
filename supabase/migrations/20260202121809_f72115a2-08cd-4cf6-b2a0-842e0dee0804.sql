-- Create remaining missing tables

-- Direct messages table
CREATE TABLE IF NOT EXISTS public.direct_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id UUID NOT NULL,
  recipient_id UUID NOT NULL,
  encrypted_content TEXT NOT NULL,
  iv TEXT NOT NULL,
  content_hash TEXT,
  message_type TEXT DEFAULT 'text',
  media_url TEXT,
  expires_at TIMESTAMP WITH TIME ZONE,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  public_key TEXT,
  status TEXT DEFAULT 'offline',
  last_seen TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Document templates table
CREATE TABLE IF NOT EXISTS public.document_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  subcategory TEXT,
  description TEXT,
  content TEXT NOT NULL,
  icon TEXT,
  is_public BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Group chats table
CREATE TABLE IF NOT EXISTS public.group_chats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  avatar_url TEXT,
  created_by UUID NOT NULL,
  is_private BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Group chat members table
CREATE TABLE IF NOT EXISTS public.group_chat_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID REFERENCES public.group_chats(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT DEFAULT 'member',
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Group chat messages table
CREATE TABLE IF NOT EXISTS public.group_chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID REFERENCES public.group_chats(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  content TEXT NOT NULL,
  message_type TEXT DEFAULT 'text',
  media_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Message reactions table
CREATE TABLE IF NOT EXISTS public.message_reactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL,
  user_id UUID NOT NULL,
  emoji TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id, emoji)
);

-- Friends table
CREATE TABLE IF NOT EXISTS public.friends (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  friend_id UUID NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, friend_id)
);

-- Typing indicators table (for realtime)
CREATE TABLE IF NOT EXISTS public.typing_indicators (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  recipient_id UUID,
  group_id UUID,
  is_typing BOOLEAN DEFAULT true,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on new tables
ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_chat_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friends ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.typing_indicators ENABLE ROW LEVEL SECURITY;

-- RLS Policies for direct_messages
CREATE POLICY "Users can view their own DMs" ON public.direct_messages FOR SELECT 
  USING (auth.uid() = sender_id OR auth.uid() = recipient_id);
CREATE POLICY "Users can send DMs" ON public.direct_messages FOR INSERT 
  WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "Users can update their own DMs" ON public.direct_messages FOR UPDATE 
  USING (auth.uid() = sender_id OR auth.uid() = recipient_id);
CREATE POLICY "Users can delete their sent DMs" ON public.direct_messages FOR DELETE 
  USING (auth.uid() = sender_id);

-- RLS Policies for profiles
CREATE POLICY "Anyone can view profiles" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

-- RLS Policies for document_templates
CREATE POLICY "Users can view public or own templates" ON public.document_templates FOR SELECT 
  USING (is_public = true OR auth.uid() = user_id);
CREATE POLICY "Users can insert own templates" ON public.document_templates FOR INSERT 
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own templates" ON public.document_templates FOR UPDATE 
  USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own templates" ON public.document_templates FOR DELETE 
  USING (auth.uid() = user_id);

-- RLS Policies for group_chats
CREATE POLICY "Members can view group" ON public.group_chats FOR SELECT 
  USING (EXISTS (SELECT 1 FROM public.group_chat_members WHERE group_id = id AND user_id = auth.uid()));
CREATE POLICY "Users can create groups" ON public.group_chats FOR INSERT 
  WITH CHECK (auth.uid() = created_by);

-- RLS Policies for group_chat_members
CREATE POLICY "Members can view group members" ON public.group_chat_members FOR SELECT 
  USING (EXISTS (SELECT 1 FROM public.group_chat_members gcm WHERE gcm.group_id = group_id AND gcm.user_id = auth.uid()));
CREATE POLICY "Members can join groups" ON public.group_chat_members FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies for group_chat_messages
CREATE POLICY "Members can view group messages" ON public.group_chat_messages FOR SELECT 
  USING (EXISTS (SELECT 1 FROM public.group_chat_members WHERE group_id = group_chat_messages.group_id AND user_id = auth.uid()));
CREATE POLICY "Members can send group messages" ON public.group_chat_messages FOR INSERT 
  WITH CHECK (EXISTS (SELECT 1 FROM public.group_chat_members WHERE group_id = group_chat_messages.group_id AND user_id = auth.uid()));

-- RLS Policies for message_reactions
CREATE POLICY "Anyone can view reactions" ON public.message_reactions FOR SELECT USING (true);
CREATE POLICY "Users can add reactions" ON public.message_reactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can remove their reactions" ON public.message_reactions FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for friends
CREATE POLICY "Users can view their friends" ON public.friends FOR SELECT 
  USING (auth.uid() = user_id OR auth.uid() = friend_id);
CREATE POLICY "Users can add friends" ON public.friends FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update friend status" ON public.friends FOR UPDATE 
  USING (auth.uid() = user_id OR auth.uid() = friend_id);

-- RLS Policies for typing_indicators
CREATE POLICY "Users can view typing indicators" ON public.typing_indicators FOR SELECT USING (true);
CREATE POLICY "Users can update their typing status" ON public.typing_indicators FOR ALL USING (auth.uid() = user_id);

-- Create trigger for profiles updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles 
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_document_templates_updated_at BEFORE UPDATE ON public.document_templates 
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_group_chats_updated_at BEFORE UPDATE ON public.group_chats 
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();