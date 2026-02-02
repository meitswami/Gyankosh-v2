import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface ChatGroup {
  id: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  created_by: string;
  is_private: boolean;
  created_at: string;
  updated_at: string;
}

export interface GroupMember {
  id: string;
  group_id: string;
  user_id: string;
  role: 'admin' | 'member';
  joined_at: string;
  profile?: {
    display_name: string | null;
    avatar_url: string | null;
    status: string;
  };
}

export interface GroupMessage {
  id: string;
  group_id: string;
  sender_id: string;
  content: string;
  message_type: string;
  media_url: string | null;
  created_at: string;
  sender?: {
    display_name: string | null;
    avatar_url: string | null;
  };
}

export function useGroupChat(userId: string | null) {
  const [groups, setGroups] = useState<ChatGroup[]>([]);
  const [currentGroup, setCurrentGroup] = useState<ChatGroup | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // Fetch all groups user is member of
  const fetchGroups = useCallback(async () => {
    if (!userId) return;

    try {
      const { data: memberData } = await supabase
        .from('group_chat_members')
        .select('group_id')
        .eq('user_id', userId);

      if (!memberData || memberData.length === 0) {
        setGroups([]);
        return;
      }

      const groupIds = memberData.map(m => m.group_id).filter(Boolean) as string[];
      if (groupIds.length === 0) {
        setGroups([]);
        return;
      }

      const { data: groupsData, error } = await supabase
        .from('group_chats')
        .select('*')
        .in('id', groupIds)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setGroups((groupsData || []) as ChatGroup[]);
    } catch (error) {
      console.error('Error fetching groups:', error);
    }
  }, [userId]);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  // Create a new group
  const createGroup = useCallback(async (
    name: string,
    memberIds: string[],
    _memberPublicKeys?: Record<string, string>
  ) => {
    if (!userId) return null;

    try {
      // Create the group
      const { data: group, error: groupError } = await supabase
        .from('group_chats')
        .insert({
          name,
          created_by: userId,
        })
        .select()
        .single();

      if (groupError) throw groupError;

      // Add creator as admin
      await supabase
        .from('group_chat_members')
        .insert({
          group_id: group.id,
          user_id: userId,
          role: 'admin',
        });

      // Add other members
      for (const memberId of memberIds) {
        if (memberId === userId) continue;
        
        await supabase
          .from('group_chat_members')
          .insert({
            group_id: group.id,
            user_id: memberId,
            role: 'member',
          });
      }

      await fetchGroups();
      toast({ title: 'Group created successfully' });
      return group as ChatGroup;
    } catch (error) {
      console.error('Error creating group:', error);
      toast({ title: 'Failed to create group', variant: 'destructive' });
      return null;
    }
  }, [userId, fetchGroups, toast]);

  // Select a group and load its data
  const selectGroup = useCallback(async (group: ChatGroup) => {
    if (!userId) return;

    setCurrentGroup(group);
    setLoading(true);

    try {
      // Fetch members with profiles
      const { data: membersData } = await supabase
        .from('group_chat_members')
        .select('*')
        .eq('group_id', group.id);

      if (membersData) {
        // Fetch profiles for members
        const memberUserIds = membersData.map(m => m.user_id);
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, display_name, avatar_url, status')
          .in('user_id', memberUserIds);

        const profileMap = new Map(profiles?.map(p => [p.user_id, p]));
        
        setMembers(membersData.map(m => ({
          id: m.id,
          group_id: m.group_id || '',
          user_id: m.user_id,
          role: (m.role || 'member') as 'admin' | 'member',
          joined_at: m.joined_at,
          profile: profileMap.get(m.user_id) || undefined,
        })));
      }

      // Fetch messages
      const { data: messagesData } = await supabase
        .from('group_chat_messages')
        .select('*')
        .eq('group_id', group.id)
        .order('created_at', { ascending: true });

      if (messagesData) {
        setMessages(messagesData.map(msg => ({
          id: msg.id,
          group_id: msg.group_id || '',
          sender_id: msg.sender_id,
          content: msg.content,
          message_type: msg.message_type || 'text',
          media_url: msg.media_url,
          created_at: msg.created_at,
        })));
      }
    } catch (error) {
      console.error('Error loading group:', error);
      toast({ title: 'Failed to load group', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [userId, toast]);

  // Send message to current group
  const sendMessage = useCallback(async (content: string, contentType = 'text', fileUrl?: string) => {
    if (!userId || !currentGroup) return false;

    try {
      const { error } = await supabase
        .from('group_chat_messages')
        .insert({
          group_id: currentGroup.id,
          sender_id: userId,
          content,
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
  }, [userId, currentGroup, toast]);

  // Add member to current group
  const addMember = useCallback(async (memberId: string, _publicKey?: string) => {
    if (!userId || !currentGroup) return false;

    try {
      const { error } = await supabase
        .from('group_chat_members')
        .insert({
          group_id: currentGroup.id,
          user_id: memberId,
          role: 'member',
        });

      if (error) throw error;

      toast({ title: 'Member added' });
      await selectGroup(currentGroup);
      return true;
    } catch (error) {
      console.error('Error adding member:', error);
      toast({ title: 'Failed to add member', variant: 'destructive' });
      return false;
    }
  }, [userId, currentGroup, selectGroup, toast]);

  // Remove member (admin only) or leave group
  const removeMember = useCallback(async (memberId: string) => {
    if (!currentGroup) return false;

    try {
      // Note: RLS doesn't allow delete on group_chat_members, so this may fail
      const { error } = await supabase
        .from('group_chat_members')
        .delete()
        .eq('group_id', currentGroup.id)
        .eq('user_id', memberId);

      if (error) throw error;

      if (memberId === userId) {
        setCurrentGroup(null);
        await fetchGroups();
        toast({ title: 'Left group' });
      } else {
        toast({ title: 'Member removed' });
        await selectGroup(currentGroup);
      }
      return true;
    } catch (error) {
      console.error('Error removing member:', error);
      toast({ title: 'Failed to remove member', variant: 'destructive' });
      return false;
    }
  }, [userId, currentGroup, fetchGroups, selectGroup, toast]);

  // Subscribe to realtime messages
  useEffect(() => {
    if (!currentGroup) return;

    const channel = supabase
      .channel(`group-${currentGroup.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'group_chat_messages',
          filter: `group_id=eq.${currentGroup.id}`,
        },
        async (payload) => {
          const msg = payload.new as {
            id: string;
            group_id: string;
            sender_id: string;
            content: string;
            message_type: string;
            media_url: string | null;
            created_at: string;
          };
          
          setMessages(prev => {
            if (prev.some(m => m.id === msg.id)) return prev;
            return [...prev, {
              id: msg.id,
              group_id: msg.group_id || '',
              sender_id: msg.sender_id,
              content: msg.content,
              message_type: msg.message_type || 'text',
              media_url: msg.media_url,
              created_at: msg.created_at,
            }];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentGroup]);

  return {
    groups,
    currentGroup,
    members,
    messages,
    loading,
    createGroup,
    selectGroup,
    sendMessage,
    addMember,
    removeMember,
    leaveGroup: () => userId ? removeMember(userId) : Promise.resolve(false),
    closeGroup: () => { setCurrentGroup(null); setMessages([]); setMembers([]); },
    refetch: fetchGroups,
  };
}
