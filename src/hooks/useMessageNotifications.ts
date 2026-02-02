import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface UnreadInfo {
  friendId: string;
  count: number;
  lastMessage: string;
  lastMessageTime: string;
}

export function useMessageNotifications(currentUserId: string | null) {
  const [unreadByFriend, setUnreadByFriend] = useState<Map<string, UnreadInfo>>(new Map());
  const [totalUnread, setTotalUnread] = useState(0);
  const { toast } = useToast();

  // Fetch unread counts by friend
  const fetchUnreadCounts = useCallback(async () => {
    if (!currentUserId) return;

    try {
      // Get all unread messages
      const { data: unreadMessages, error } = await supabase
        .from('direct_messages')
        .select('id, sender_id, created_at')
        .eq('recipient_id', currentUserId)
        .is('read_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Group by sender
      const countMap = new Map<string, UnreadInfo>();
      
      for (const msg of unreadMessages || []) {
        const existing = countMap.get(msg.sender_id);
        if (existing) {
          existing.count++;
        } else {
          countMap.set(msg.sender_id, {
            friendId: msg.sender_id,
            count: 1,
            lastMessage: '', // We don't decrypt here for performance
            lastMessageTime: msg.created_at,
          });
        }
      }

      setUnreadByFriend(countMap);
      setTotalUnread(unreadMessages?.length || 0);
    } catch (error) {
      console.error('Error fetching unread counts:', error);
    }
  }, [currentUserId]);

  // Mark messages from a specific friend as read
  const markFriendMessagesRead = useCallback(async (friendId: string) => {
    if (!currentUserId) return;

    try {
      await supabase
        .from('direct_messages')
        .update({ read_at: new Date().toISOString() })
        .eq('recipient_id', currentUserId)
        .eq('sender_id', friendId)
        .is('read_at', null);

      // Update local state
      setUnreadByFriend(prev => {
        const newMap = new Map(prev);
        const removed = newMap.get(friendId);
        newMap.delete(friendId);
        if (removed) {
          setTotalUnread(t => Math.max(0, t - removed.count));
        }
        return newMap;
      });
    } catch (error) {
      console.error('Error marking messages as read:', error);
    }
  }, [currentUserId]);

  // Get unread count for a specific friend
  const getUnreadCount = useCallback((friendId: string): number => {
    return unreadByFriend.get(friendId)?.count || 0;
  }, [unreadByFriend]);

  // Initial fetch
  useEffect(() => {
    fetchUnreadCounts();
  }, [fetchUnreadCounts]);

  // Subscribe to new messages for real-time notifications
  useEffect(() => {
    if (!currentUserId) return;

    const channel = supabase
      .channel('message-notifications')
      .on(
        'postgres_changes',
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'direct_messages',
          filter: `recipient_id=eq.${currentUserId}`,
        },
        async (payload) => {
          const newMsg = payload.new as { sender_id: string; created_at: string };
          
          // Update unread count
          setUnreadByFriend(prev => {
            const newMap = new Map(prev);
            const existing = newMap.get(newMsg.sender_id);
            if (existing) {
              existing.count++;
              existing.lastMessageTime = newMsg.created_at;
            } else {
              newMap.set(newMsg.sender_id, {
                friendId: newMsg.sender_id,
                count: 1,
                lastMessage: '',
                lastMessageTime: newMsg.created_at,
              });
            }
            return newMap;
          });
          
          setTotalUnread(t => t + 1);

          // Get sender name for notification
          const { data: profile } = await supabase
            .from('profiles')
            .select('display_name')
            .eq('user_id', newMsg.sender_id)
            .single();

          // Show push-style notification
          toast({
            title: `💬 New message from ${profile?.display_name || 'Friend'}`,
            description: 'Tap to view',
          });

          // Also try browser notification if permitted
          if (Notification.permission === 'granted') {
            new Notification(`Message from ${profile?.display_name || 'Friend'}`, {
              body: 'You have a new encrypted message',
              icon: '/favicon.png',
            });
          }
        }
      )
      .on(
        'postgres_changes',
        { 
          event: 'UPDATE', 
          schema: 'public', 
          table: 'direct_messages',
        },
        () => {
          // Refetch when messages are marked as read
          fetchUnreadCounts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, toast, fetchUnreadCounts]);

  // Request notification permission
  const requestNotificationPermission = useCallback(async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
  }, []);

  return {
    unreadByFriend,
    totalUnread,
    getUnreadCount,
    markFriendMessagesRead,
    requestNotificationPermission,
    refetch: fetchUnreadCounts,
  };
}
