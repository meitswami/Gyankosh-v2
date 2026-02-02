import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { encryptMessage, decryptMessage, getPrivateKey } from '@/lib/encryption';
import type { UserProfile } from './useUserPresence';

export interface DirectMessage {
  id: string;
  sender_id: string;
  recipient_id: string;
  content: string; // Decrypted content
  encrypted_content: string;
  iv: string;
  message_type: 'text' | 'file' | 'document' | 'audio' | 'video';
  media_url: string | null;
  is_read: boolean;
  created_at: string;
}

interface RawMessage {
  id: string;
  sender_id: string;
  recipient_id: string;
  encrypted_content: string;
  iv: string;
  message_type: string;
  media_url: string | null;
  is_read: boolean;
  created_at: string;
}

export function useDirectMessages(currentUserId: string | null, friendProfile: UserProfile | null) {
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const { toast } = useToast();

  // Decrypt a single message
  const decryptSingleMessage = useCallback(async (
    msg: RawMessage,
    privateKey: string
  ): Promise<DirectMessage | null> => {
    try {
      // The encrypted_content contains both the encrypted message and the encrypted key
      // Format: encryptedContent|encryptedKey
      const [encContent, encKey] = msg.encrypted_content.split('|');
      
      if (!encContent || !encKey) {
        console.warn('Invalid encrypted message format');
        return null;
      }

      const decrypted = await decryptMessage(encContent, msg.iv, encKey, privateKey);
      
      return {
        ...msg,
        content: decrypted,
        message_type: msg.message_type as DirectMessage['message_type'],
      };
    } catch (error) {
      console.error('Decryption error:', error);
      return {
        ...msg,
        content: '[Unable to decrypt message]',
        message_type: msg.message_type as DirectMessage['message_type'],
      };
    }
  }, []);

  // Fetch and decrypt messages with a friend
  const fetchMessages = useCallback(async () => {
    if (!currentUserId || !friendProfile) return;
    
    setLoading(true);
    try {
      const privateKey = await getPrivateKey(currentUserId);
      if (!privateKey) {
        console.error('No private key found');
        return;
      }

      const { data, error } = await supabase
        .from('direct_messages')
        .select('*')
        .or(`and(sender_id.eq.${currentUserId},recipient_id.eq.${friendProfile.user_id}),and(sender_id.eq.${friendProfile.user_id},recipient_id.eq.${currentUserId})`)
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Decrypt all messages
      const decryptedMessages = await Promise.all(
        (data || []).map(msg => decryptSingleMessage(msg as RawMessage, privateKey))
      );

      setMessages(decryptedMessages.filter(Boolean) as DirectMessage[]);
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setLoading(false);
    }
  }, [currentUserId, friendProfile, decryptSingleMessage]);

  // Send encrypted message
  const sendMessage = useCallback(async (content: string, contentType: 'text' | 'file' | 'document' = 'text', fileUrl?: string) => {
    if (!currentUserId || !friendProfile?.public_key) {
      toast({ title: 'Cannot send message', variant: 'destructive' });
      return false;
    }

    try {
      // Encrypt message for recipient
      const { encryptedContent, iv, encryptedKey } = await encryptMessage(
        content,
        friendProfile.public_key
      );

      // Store as combined string (content|key)
      const combinedEncrypted = `${encryptedContent}|${encryptedKey}`;

      const { error } = await supabase
        .from('direct_messages')
        .insert({
          sender_id: currentUserId,
          recipient_id: friendProfile.user_id,
          encrypted_content: combinedEncrypted,
          iv,
          message_type: contentType,
          media_url: fileUrl,
        });

      if (error) throw error;
      
      return true;
    } catch (error) {
      console.error('Error sending message:', error);
      toast({ title: 'Failed to send message', variant: 'destructive' });
      return false;
    }
  }, [currentUserId, friendProfile, toast]);

  // Mark messages as read
  const markAsRead = useCallback(async () => {
    if (!currentUserId || !friendProfile) return;

    try {
      await supabase
        .from('direct_messages')
        .update({ is_read: true })
        .eq('recipient_id', currentUserId)
        .eq('sender_id', friendProfile.user_id)
        .eq('is_read', false);
        
      // Update local messages state to reflect read status
      setMessages(prev => prev.map(msg => 
        msg.sender_id === friendProfile.user_id && !msg.is_read
          ? { ...msg, is_read: true }
          : msg
      ));
    } catch (error) {
      console.error('Error marking as read:', error);
    }
  }, [currentUserId, friendProfile]);

  // Fetch total unread count
  const fetchUnreadCount = useCallback(async () => {
    if (!currentUserId) return;

    try {
      const { count } = await supabase
        .from('direct_messages')
        .select('*', { count: 'exact', head: true })
        .eq('recipient_id', currentUserId)
        .eq('is_read', false);

      setUnreadCount(count || 0);
    } catch (error) {
      console.error('Error fetching unread count:', error);
    }
  }, [currentUserId]);

  // Load messages when friend changes
  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Subscribe to new messages
  useEffect(() => {
    if (!currentUserId) return;

    const channel = supabase
      .channel('direct-messages')
      .on(
        'postgres_changes',
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'direct_messages',
          filter: `recipient_id=eq.${currentUserId}`,
        },
        async (payload) => {
          const newMsg = payload.new as RawMessage;
          
          // Get private key and decrypt
          const privateKey = await getPrivateKey(currentUserId);
          if (privateKey) {
            const decrypted = await decryptSingleMessage(newMsg, privateKey);
            if (decrypted) {
              // If chat is open with this friend, add to messages
              if (friendProfile && newMsg.sender_id === friendProfile.user_id) {
                setMessages(prev => [...prev, decrypted]);
              }
              
              // Show notification
              toast({
                title: 'New message',
                description: decrypted.content.substring(0, 50) + (decrypted.content.length > 50 ? '...' : ''),
              });
            }
          }
          
          fetchUnreadCount();
        }
      )
      .on(
        'postgres_changes',
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'direct_messages',
          filter: `sender_id=eq.${currentUserId}`,
        },
        async (payload) => {
          // Add sent message to UI (already have decrypted content locally)
          const newMsg = payload.new as RawMessage;
          if (friendProfile && newMsg.recipient_id === friendProfile.user_id) {
            // We need to show the message we just sent
            const privateKey = await getPrivateKey(currentUserId);
            if (privateKey) {
              const decrypted = await decryptSingleMessage(newMsg, privateKey);
              if (decrypted) {
                setMessages(prev => {
                  // Avoid duplicates
                  if (prev.some(m => m.id === decrypted.id)) return prev;
                  return [...prev, decrypted];
                });
              }
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, friendProfile, decryptSingleMessage, toast, fetchUnreadCount]);

  // Fetch unread count on mount
  useEffect(() => {
    fetchUnreadCount();
  }, [fetchUnreadCount]);

  return {
    messages,
    loading,
    unreadCount,
    sendMessage,
    markAsRead,
    refetch: fetchMessages,
    refreshUnreadCount: fetchUnreadCount,
  };
}
