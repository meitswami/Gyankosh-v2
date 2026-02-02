-- Add delivery status to direct_messages
ALTER TABLE public.direct_messages 
ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'read'));

-- Create message reactions table
CREATE TABLE public.message_reactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.direct_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id, emoji)
);

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

-- Users can view reactions on messages they're part of
CREATE POLICY "Users can view message reactions"
ON public.message_reactions FOR SELECT
USING (
  message_id IN (
    SELECT id FROM public.direct_messages 
    WHERE sender_id = auth.uid() OR recipient_id = auth.uid()
  )
);

-- Users can add reactions to messages they received or sent
CREATE POLICY "Users can add reactions"
ON public.message_reactions FOR INSERT
WITH CHECK (
  auth.uid() = user_id AND
  message_id IN (
    SELECT id FROM public.direct_messages 
    WHERE sender_id = auth.uid() OR recipient_id = auth.uid()
  )
);

-- Users can remove their own reactions
CREATE POLICY "Users can remove own reactions"
ON public.message_reactions FOR DELETE
USING (auth.uid() = user_id);

-- Create typing indicators table (ephemeral, cleaned up automatically)
CREATE TABLE public.typing_indicators (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, recipient_id)
);

ALTER TABLE public.typing_indicators ENABLE ROW LEVEL SECURITY;

-- Users can see typing indicators directed at them
CREATE POLICY "Users can view typing indicators for them"
ON public.typing_indicators FOR SELECT
USING (auth.uid() = recipient_id);

-- Users can manage their own typing indicators
CREATE POLICY "Users can manage own typing"
ON public.typing_indicators FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own typing"
ON public.typing_indicators FOR DELETE
USING (auth.uid() = user_id);

-- Enable realtime for reactions and typing
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.typing_indicators;

-- Create indexes
CREATE INDEX idx_reactions_message ON public.message_reactions(message_id);
CREATE INDEX idx_typing_recipient ON public.typing_indicators(recipient_id);
CREATE INDEX idx_messages_status ON public.direct_messages(status);