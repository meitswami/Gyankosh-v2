import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { 
  generateGroupKey, 
  encryptGroupKey, 
  decryptGroupKey,
  encryptWithGroupKey,
  decryptWithGroupKey,
  getPrivateKey 
} from '@/lib/encryption';

export interface ChatGroup {
  id: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  created_by: string;
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
  content: string; // Decrypted
  content_type: string;
  file_url: string | null;
  file_name: string | null;
  created_at: string;
  sender?: {
    display_name: string | null;
    avatar_url: string | null;
  };
}

interface RawGroupMessage {
  id: string;
  group_id: string;
  sender_id: string;
  encrypted_content: string;
  iv: string;
  content_type: string;
  file_url: string | null;
  file_name: string | null;
  created_at: string;
}

export function useGroupChat(userId: string | null) {
  const [groups, setGroups] = useState<ChatGroup[]>([]);
  const [currentGroup, setCurrentGroup] = useState<ChatGroup | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [groupKey, setGroupKey] = useState<string | null>(null);
  const { toast } = useToast();

  // Fetch all groups user is member of
  const fetchGroups = useCallback(async () => {
    if (!userId) return;

    try {
      const { data: memberData } = await supabase
        .from('group_members')
        .select('group_id')
        .eq('user_id', userId);

      if (!memberData || memberData.length === 0) {
        setGroups([]);
        return;
      }

      const groupIds = memberData.map(m => m.group_id);
      const { data: groupsData, error } = await supabase
        .from('chat_groups')
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
    memberPublicKeys: Record<string, string>
  ) => {
    if (!userId) return null;

    try {
      // Generate symmetric group key
      const newGroupKey = await generateGroupKey();
      
      // Get creator's private key to encrypt group key for themselves
      const privateKey = await getPrivateKey(userId);
      if (!privateKey) throw new Error('No private key found');

      // We need creator's public key too
      const { data: creatorProfile } = await supabase
        .from('profiles')
        .select('public_key')
        .eq('user_id', userId)
        .single();

      if (!creatorProfile?.public_key) throw new Error('No public key found');

      // Encrypt group key for creator
      const encryptedForCreator = await encryptGroupKey(newGroupKey, creatorProfile.public_key);

      // Create the group
      const { data: group, error: groupError } = await supabase
        .from('chat_groups')
        .insert({
          name,
          created_by: userId,
          encrypted_group_key: encryptedForCreator,
        })
        .select()
        .single();

      if (groupError) throw groupError;

      // Add creator as admin
      await supabase
        .from('group_members')
        .insert({
          group_id: group.id,
          user_id: userId,
          encrypted_group_key: encryptedForCreator,
          role: 'admin',
        });

      // Add other members with their encrypted keys
      for (const memberId of memberIds) {
        if (memberId === userId) continue;
        
        const publicKey = memberPublicKeys[memberId];
        if (!publicKey) continue;

        const encryptedForMember = await encryptGroupKey(newGroupKey, publicKey);
        
        await supabase
          .from('group_members')
          .insert({
            group_id: group.id,
            user_id: memberId,
            encrypted_group_key: encryptedForMember,
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
      // Get user's encrypted group key
      const { data: membership } = await supabase
        .from('group_members')
        .select('encrypted_group_key')
        .eq('group_id', group.id)
        .eq('user_id', userId)
        .single();

      if (!membership) throw new Error('Not a member');

      // Decrypt the group key
      const privateKey = await getPrivateKey(userId);
      if (!privateKey) throw new Error('No private key');

      const decryptedKey = await decryptGroupKey(membership.encrypted_group_key, privateKey);
      setGroupKey(decryptedKey);

      // Fetch members with profiles
      const { data: membersData } = await supabase
        .from('group_members')
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
          ...m,
          role: m.role as 'admin' | 'member',
          profile: profileMap.get(m.user_id) || undefined,
        })));
      }

      // Fetch and decrypt messages
      const { data: messagesData } = await supabase
        .from('group_messages')
        .select('*')
        .eq('group_id', group.id)
        .order('created_at', { ascending: true });

      if (messagesData && decryptedKey) {
        const decryptedMessages = await Promise.all(
          messagesData.map(async (msg: RawGroupMessage) => {
            try {
              const content = await decryptWithGroupKey(
                msg.encrypted_content,
                msg.iv,
                decryptedKey
              );
              return {
                id: msg.id,
                group_id: msg.group_id,
                sender_id: msg.sender_id,
                content,
                content_type: msg.content_type,
                file_url: msg.file_url,
                file_name: msg.file_name,
                created_at: msg.created_at,
              };
            } catch {
              return {
                ...msg,
                content: '[Unable to decrypt]',
              };
            }
          })
        );
        setMessages(decryptedMessages as GroupMessage[]);
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
    if (!userId || !currentGroup || !groupKey) return false;

    try {
      const { encryptedContent, iv } = await encryptWithGroupKey(content, groupKey);

      const { error } = await supabase
        .from('group_messages')
        .insert({
          group_id: currentGroup.id,
          sender_id: userId,
          encrypted_content: encryptedContent,
          iv,
          content_type: contentType,
          file_url: fileUrl,
        });

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error sending message:', error);
      toast({ title: 'Failed to send message', variant: 'destructive' });
      return false;
    }
  }, [userId, currentGroup, groupKey, toast]);

  // Add member to current group
  const addMember = useCallback(async (memberId: string, publicKey: string) => {
    if (!userId || !currentGroup || !groupKey) return false;

    try {
      // Encrypt group key for new member
      const encryptedForMember = await encryptGroupKey(groupKey, publicKey);

      const { error } = await supabase
        .from('group_members')
        .insert({
          group_id: currentGroup.id,
          user_id: memberId,
          encrypted_group_key: encryptedForMember,
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
  }, [userId, currentGroup, groupKey, selectGroup, toast]);

  // Remove member (admin only) or leave group
  const removeMember = useCallback(async (memberId: string) => {
    if (!currentGroup) return false;

    try {
      const { error } = await supabase
        .from('group_members')
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
    if (!currentGroup || !groupKey) return;

    const channel = supabase
      .channel(`group-${currentGroup.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'group_messages',
          filter: `group_id=eq.${currentGroup.id}`,
        },
        async (payload) => {
          const msg = payload.new as RawGroupMessage;
          try {
            const content = await decryptWithGroupKey(msg.encrypted_content, msg.iv, groupKey);
            setMessages(prev => {
              if (prev.some(m => m.id === msg.id)) return prev;
              return [...prev, {
                id: msg.id,
                group_id: msg.group_id,
                sender_id: msg.sender_id,
                content,
                content_type: msg.content_type,
                file_url: msg.file_url,
                file_name: msg.file_name,
                created_at: msg.created_at,
              }];
            });
          } catch (e) {
            console.error('Failed to decrypt realtime message:', e);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentGroup, groupKey]);

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
    closeGroup: () => { setCurrentGroup(null); setMessages([]); setMembers([]); setGroupKey(null); },
    refetch: fetchGroups,
  };
}
