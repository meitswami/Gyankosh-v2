import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getPrivateKey, decryptMessage } from '@/lib/encryption';

export interface SearchableMessage {
  id: string;
  sender_id: string;
  recipient_id: string;
  content: string;
  created_at: string;
  friend_name: string;
  friend_id: string;
  is_sent: boolean;
}

interface RawMessageWithDecryption {
  id: string;
  sender_id: string;
  recipient_id: string;
  encrypted_content: string;
  iv: string;
  created_at: string;
}

export function useChatSearch(currentUserId: string | null) {
  const [allMessages, setAllMessages] = useState<SearchableMessage[]>([]);
  const [searchResults, setSearchResults] = useState<SearchableMessage[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [friendsMap, setFriendsMap] = useState<Map<string, string>>(new Map());

  // Fetch and decrypt all messages for search
  const fetchAllMessages = useCallback(async () => {
    if (!currentUserId) return;
    
    setLoading(true);
    try {
      const privateKey = await getPrivateKey(currentUserId);
      if (!privateKey) {
        console.error('No private key found');
        return;
      }

      // Fetch all messages
      const { data: messages, error } = await supabase
        .from('direct_messages')
        .select('*')
        .or(`sender_id.eq.${currentUserId},recipient_id.eq.${currentUserId}`)
        .order('created_at', { ascending: false })
        .limit(500); // Limit for performance

      if (error) throw error;
      if (!messages?.length) return;

      // Get unique friend IDs
      const friendIds = [...new Set(messages.map(m => 
        m.sender_id === currentUserId ? m.recipient_id : m.sender_id
      ))];

      // Fetch friend profiles
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, display_name')
        .in('user_id', friendIds);

      const friendMap = new Map(
        (profiles || []).map(p => [p.user_id, p.display_name || 'Unknown'])
      );
      setFriendsMap(friendMap);

      // Decrypt messages
      const decryptedMessages: SearchableMessage[] = [];
      
      for (const msg of messages as RawMessageWithDecryption[]) {
        try {
          const [encContent, encKey] = msg.encrypted_content.split('|');
          if (!encContent || !encKey) continue;
          
          const decrypted = await decryptMessage(encContent, msg.iv, encKey, privateKey);
          const friendId = msg.sender_id === currentUserId ? msg.recipient_id : msg.sender_id;
          
          decryptedMessages.push({
            id: msg.id,
            sender_id: msg.sender_id,
            recipient_id: msg.recipient_id,
            content: decrypted,
            created_at: msg.created_at,
            friend_name: friendMap.get(friendId) || 'Unknown',
            friend_id: friendId,
            is_sent: msg.sender_id === currentUserId,
          });
        } catch {
          // Skip messages that can't be decrypted
        }
      }

      setAllMessages(decryptedMessages);
    } catch (error) {
      console.error('Error fetching messages for search:', error);
    } finally {
      setLoading(false);
    }
  }, [currentUserId]);

  // Search messages
  const search = useCallback((query: string) => {
    setSearchQuery(query);
    
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    const lowerQuery = query.toLowerCase();
    const results = allMessages.filter(msg => 
      msg.content.toLowerCase().includes(lowerQuery) ||
      msg.friend_name.toLowerCase().includes(lowerQuery)
    );

    setSearchResults(results);
  }, [allMessages]);

  // Initial fetch
  useEffect(() => {
    fetchAllMessages();
  }, [fetchAllMessages]);

  // Subscribe to new messages
  useEffect(() => {
    if (!currentUserId) return;

    const channel = supabase
      .channel('chat-search-updates')
      .on(
        'postgres_changes',
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'direct_messages',
        },
        () => {
          // Refetch when new messages arrive
          fetchAllMessages();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, fetchAllMessages]);

  return {
    allMessages,
    searchResults,
    searchQuery,
    loading,
    search,
    friendsMap,
    refetch: fetchAllMessages,
  };
}
