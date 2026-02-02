import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface MessageReaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

export function useMessageReactions(currentUserId: string | null) {
  const [reactionsByMessage, setReactionsByMessage] = useState<Map<string, MessageReaction[]>>(new Map());

  // Fetch reactions for a set of message IDs
  const fetchReactions = useCallback(async (messageIds: string[]) => {
    if (!messageIds.length) return;

    try {
      const { data, error } = await supabase
        .from('message_reactions')
        .select('*')
        .in('message_id', messageIds);

      if (error) throw error;

      // Group by message
      const grouped = new Map<string, MessageReaction[]>();
      for (const reaction of data || []) {
        const existing = grouped.get(reaction.message_id) || [];
        existing.push(reaction as MessageReaction);
        grouped.set(reaction.message_id, existing);
      }

      setReactionsByMessage(prev => {
        const newMap = new Map(prev);
        grouped.forEach((reactions, msgId) => {
          newMap.set(msgId, reactions);
        });
        return newMap;
      });
    } catch (error) {
      console.error('Error fetching reactions:', error);
    }
  }, []);

  // Add a reaction
  const addReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!currentUserId) return false;

    try {
      const { data, error } = await supabase
        .from('message_reactions')
        .insert({
          message_id: messageId,
          user_id: currentUserId,
          emoji,
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          // Already exists, remove it instead (toggle)
          return removeReaction(messageId, emoji);
        }
        throw error;
      }

      // Update local state
      setReactionsByMessage(prev => {
        const newMap = new Map(prev);
        const existing = newMap.get(messageId) || [];
        newMap.set(messageId, [...existing, data as MessageReaction]);
        return newMap;
      });

      return true;
    } catch (error) {
      console.error('Error adding reaction:', error);
      return false;
    }
  }, [currentUserId]);

  // Remove a reaction
  const removeReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!currentUserId) return false;

    try {
      await supabase
        .from('message_reactions')
        .delete()
        .eq('message_id', messageId)
        .eq('user_id', currentUserId)
        .eq('emoji', emoji);

      // Update local state
      setReactionsByMessage(prev => {
        const newMap = new Map(prev);
        const existing = newMap.get(messageId) || [];
        newMap.set(
          messageId,
          existing.filter(r => !(r.user_id === currentUserId && r.emoji === emoji))
        );
        return newMap;
      });

      return true;
    } catch (error) {
      console.error('Error removing reaction:', error);
      return false;
    }
  }, [currentUserId]);

  // Get reactions for a specific message
  const getReactions = useCallback((messageId: string): MessageReaction[] => {
    return reactionsByMessage.get(messageId) || [];
  }, [reactionsByMessage]);

  // Check if current user has reacted with specific emoji
  const hasReacted = useCallback((messageId: string, emoji: string): boolean => {
    const reactions = reactionsByMessage.get(messageId) || [];
    return reactions.some(r => r.user_id === currentUserId && r.emoji === emoji);
  }, [reactionsByMessage, currentUserId]);

  // Subscribe to reaction changes
  useEffect(() => {
    if (!currentUserId) return;

    const channel = supabase
      .channel('message-reactions')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'message_reactions',
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const reaction = payload.new as MessageReaction;
            setReactionsByMessage(prev => {
              const newMap = new Map(prev);
              const existing = newMap.get(reaction.message_id) || [];
              if (!existing.find(r => r.id === reaction.id)) {
                newMap.set(reaction.message_id, [...existing, reaction]);
              }
              return newMap;
            });
          } else if (payload.eventType === 'DELETE') {
            const reaction = payload.old as MessageReaction;
            setReactionsByMessage(prev => {
              const newMap = new Map(prev);
              const existing = newMap.get(reaction.message_id) || [];
              newMap.set(
                reaction.message_id,
                existing.filter(r => r.id !== reaction.id)
              );
              return newMap;
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId]);

  return {
    fetchReactions,
    addReaction,
    removeReaction,
    getReactions,
    hasReacted,
    quickReactions: QUICK_REACTIONS,
  };
}
