import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useTypingIndicator(currentUserId: string | null, recipientId: string | null) {
  const [isTyping, setIsTyping] = useState(false);
  const [friendIsTyping, setFriendIsTyping] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const stopTypingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Send typing indicator
  const startTyping = useCallback(async () => {
    if (!currentUserId || !recipientId) return;

    // Debounce - only send if not already typing
    if (isTyping) {
      // Reset the stop timeout
      if (stopTypingTimeoutRef.current) {
        clearTimeout(stopTypingTimeoutRef.current);
      }
      stopTypingTimeoutRef.current = setTimeout(() => {
        stopTyping();
      }, 3000);
      return;
    }

    setIsTyping(true);

    try {
      await supabase
        .from('typing_indicators')
        .upsert({
          user_id: currentUserId,
          recipient_id: recipientId,
          started_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id,recipient_id',
        });
    } catch (error) {
      console.error('Error setting typing indicator:', error);
    }

    // Auto-stop after 3 seconds of no typing
    stopTypingTimeoutRef.current = setTimeout(() => {
      stopTyping();
    }, 3000);
  }, [currentUserId, recipientId, isTyping]);

  // Stop typing indicator
  const stopTyping = useCallback(async () => {
    if (!currentUserId || !recipientId) return;

    setIsTyping(false);

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }

    if (stopTypingTimeoutRef.current) {
      clearTimeout(stopTypingTimeoutRef.current);
      stopTypingTimeoutRef.current = null;
    }

    try {
      await supabase
        .from('typing_indicators')
        .delete()
        .eq('user_id', currentUserId)
        .eq('recipient_id', recipientId);
    } catch (error) {
      console.error('Error removing typing indicator:', error);
    }
  }, [currentUserId, recipientId]);

  // Subscribe to friend's typing status
  useEffect(() => {
    if (!currentUserId || !recipientId) return;

    // Initial fetch
    const fetchTyping = async () => {
      const { data } = await supabase
        .from('typing_indicators')
        .select('*')
        .eq('user_id', recipientId)
        .eq('recipient_id', currentUserId)
        .single();

      if (data) {
        const startedAt = new Date(data.started_at);
        const now = new Date();
        // Only show if started within last 5 seconds
        setFriendIsTyping(now.getTime() - startedAt.getTime() < 5000);
      }
    };

    fetchTyping();

    // Subscribe to realtime changes
    const channel = supabase
      .channel(`typing-${currentUserId}-${recipientId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'typing_indicators',
          filter: `recipient_id=eq.${currentUserId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const data = payload.new as { user_id: string; started_at: string };
            if (data.user_id === recipientId) {
              setFriendIsTyping(true);
              // Auto-clear after 4 seconds
              setTimeout(() => setFriendIsTyping(false), 4000);
            }
          } else if (payload.eventType === 'DELETE') {
            setFriendIsTyping(false);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, recipientId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (stopTypingTimeoutRef.current) clearTimeout(stopTypingTimeoutRef.current);
    };
  }, []);

  return {
    isTyping,
    friendIsTyping,
    startTyping,
    stopTyping,
  };
}
