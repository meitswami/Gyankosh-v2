import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { generateKeyPair, storePrivateKey, getPrivateKey } from '@/lib/encryption';

export interface UserProfile {
  id: string;
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  status: 'online' | 'offline' | 'away';
  last_seen: string;
  public_key: string | null;
}

export interface FriendRequest {
  id: string;
  from_user_id: string;
  to_user_id: string;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
  from_profile?: UserProfile;
  to_profile?: UserProfile;
}

export function useUserPresence() {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [friends, setFriends] = useState<UserProfile[]>([]);
  const [pendingRequests, setPendingRequests] = useState<FriendRequest[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  // Initialize or get user profile with encryption keys
  const initializeProfile = useCallback(async (userId: string, email: string) => {
    try {
      // Check if profile exists
      const { data: existing } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (existing) {
        // Update status to online
        await supabase
          .from('profiles')
          .update({ status: 'online', last_seen: new Date().toISOString() })
          .eq('user_id', userId);
        
        setCurrentUser({ ...existing, status: 'online' } as UserProfile);
        return existing as UserProfile;
      }

      // Generate encryption keys for new user
      const { publicKey, privateKey } = await generateKeyPair();
      
      // Store private key locally (never sent to server)
      await storePrivateKey(userId, privateKey);

      // Create new profile with public key
      const displayName = email.split('@')[0];
      const { data: newProfile, error } = await supabase
        .from('profiles')
        .insert({
          user_id: userId,
          display_name: displayName,
          status: 'online',
          public_key: publicKey,
        })
        .select()
        .single();

      if (error) throw error;
      
      setCurrentUser(newProfile as UserProfile);
      return newProfile as UserProfile;
    } catch (error) {
      console.error('Error initializing profile:', error);
      return null;
    }
  }, []);

  // Update presence status
  const updateStatus = useCallback(async (status: 'online' | 'offline' | 'away') => {
    if (!currentUser) return;
    
    try {
      await supabase
        .from('profiles')
        .update({ status, last_seen: new Date().toISOString() })
        .eq('user_id', currentUser.user_id);
      
      setCurrentUser(prev => prev ? { ...prev, status } : null);
    } catch (error) {
      console.error('Error updating status:', error);
    }
  }, [currentUser]);

  // Fetch friends
  const fetchFriends = useCallback(async (userId: string) => {
    try {
      // Get accepted friend requests
      const { data: friendRequests } = await supabase
        .from('friend_requests')
        .select('*')
        .eq('status', 'accepted')
        .or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`);

      if (!friendRequests?.length) {
        setFriends([]);
        return;
      }

      // Get friend user IDs
      const friendIds = friendRequests.map(fr => 
        fr.from_user_id === userId ? fr.to_user_id : fr.from_user_id
      );

      // Fetch friend profiles
      const { data: profiles } = await supabase
        .from('profiles')
        .select('*')
        .in('user_id', friendIds);

      setFriends((profiles || []) as UserProfile[]);
    } catch (error) {
      console.error('Error fetching friends:', error);
    }
  }, []);

  // Fetch pending requests
  const fetchPendingRequests = useCallback(async (userId: string) => {
    try {
      const { data } = await supabase
        .from('friend_requests')
        .select('*')
        .eq('status', 'pending')
        .or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`);

      if (!data?.length) {
        setPendingRequests([]);
        return;
      }

      // Get all user IDs involved
      const userIds = [...new Set(data.flatMap(r => [r.from_user_id, r.to_user_id]))];
      
      const { data: profiles } = await supabase
        .from('profiles')
        .select('*')
        .in('user_id', userIds);

      const profileMap = new Map((profiles || []).map(p => [p.user_id, p]));

      const enrichedRequests = data.map(r => ({
        ...r,
        from_profile: profileMap.get(r.from_user_id) as UserProfile,
        to_profile: profileMap.get(r.to_user_id) as UserProfile,
      }));

      setPendingRequests(enrichedRequests as FriendRequest[]);
    } catch (error) {
      console.error('Error fetching pending requests:', error);
    }
  }, []);

  // Fetch all users (for discovery)
  const fetchAllUsers = useCallback(async (userId: string) => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .neq('user_id', userId);

      setAllUsers((data || []) as UserProfile[]);
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  }, []);

  // Send friend request
  const sendFriendRequest = useCallback(async (toUserId: string) => {
    if (!currentUser) return false;
    
    try {
      const { error } = await supabase
        .from('friend_requests')
        .insert({
          from_user_id: currentUser.user_id,
          to_user_id: toUserId,
        });

      if (error) {
        if (error.code === '23505') {
          toast({ title: 'Request already sent', variant: 'destructive' });
        } else {
          throw error;
        }
        return false;
      }

      toast({ title: 'Friend request sent!' });
      await fetchPendingRequests(currentUser.user_id);
      return true;
    } catch (error) {
      console.error('Error sending friend request:', error);
      toast({ title: 'Failed to send request', variant: 'destructive' });
      return false;
    }
  }, [currentUser, fetchPendingRequests, toast]);

  // Accept/reject friend request
  const respondToRequest = useCallback(async (requestId: string, accept: boolean) => {
    if (!currentUser) return false;
    
    try {
      const { error } = await supabase
        .from('friend_requests')
        .update({ status: accept ? 'accepted' : 'rejected' })
        .eq('id', requestId);

      if (error) throw error;

      toast({ title: accept ? 'Friend request accepted!' : 'Request declined' });
      await Promise.all([
        fetchFriends(currentUser.user_id),
        fetchPendingRequests(currentUser.user_id),
      ]);
      return true;
    } catch (error) {
      console.error('Error responding to request:', error);
      toast({ title: 'Failed to respond', variant: 'destructive' });
      return false;
    }
  }, [currentUser, fetchFriends, fetchPendingRequests, toast]);

  // Remove friend
  const removeFriend = useCallback(async (friendUserId: string) => {
    if (!currentUser) return false;
    
    try {
      const { error } = await supabase
        .from('friend_requests')
        .delete()
        .eq('status', 'accepted')
        .or(`and(from_user_id.eq.${currentUser.user_id},to_user_id.eq.${friendUserId}),and(from_user_id.eq.${friendUserId},to_user_id.eq.${currentUser.user_id})`);

      if (error) throw error;

      toast({ title: 'Friend removed' });
      await fetchFriends(currentUser.user_id);
      return true;
    } catch (error) {
      console.error('Error removing friend:', error);
      return false;
    }
  }, [currentUser, fetchFriends, toast]);

  // Initialize on auth change
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.user && mounted) {
        await initializeProfile(session.user.id, session.user.email || '');
        await Promise.all([
          fetchFriends(session.user.id),
          fetchPendingRequests(session.user.id),
          fetchAllUsers(session.user.id),
        ]);
      }
      
      if (mounted) setLoading(false);
    };

    init();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user && mounted) {
        await initializeProfile(session.user.id, session.user.email || '');
        await Promise.all([
          fetchFriends(session.user.id),
          fetchPendingRequests(session.user.id),
          fetchAllUsers(session.user.id),
        ]);
      } else if (event === 'SIGNED_OUT') {
        if (currentUser) {
          await updateStatus('offline');
        }
        if (mounted) {
          setCurrentUser(null);
          setFriends([]);
          setPendingRequests([]);
        }
      }
    });

    // Update to offline on page unload
    const handleUnload = () => {
      if (currentUser) {
        navigator.sendBeacon(
          `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/profiles?user_id=eq.${currentUser.user_id}`,
          JSON.stringify({ status: 'offline', last_seen: new Date().toISOString() })
        );
      }
    };

    window.addEventListener('beforeunload', handleUnload);

    return () => {
      mounted = false;
      subscription.unsubscribe();
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, []);

  // Realtime presence updates
  useEffect(() => {
    if (!currentUser) return;

    const channel = supabase
      .channel('presence-changes')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles' },
        (payload) => {
          const updated = payload.new as UserProfile;
          setFriends(prev => prev.map(f => 
            f.user_id === updated.user_id ? updated : f
          ));
          setAllUsers(prev => prev.map(u => 
            u.user_id === updated.user_id ? updated : u
          ));
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friend_requests' },
        async (payload) => {
          // Refresh friend data on any change
          if (currentUser) {
            await Promise.all([
              fetchFriends(currentUser.user_id),
              fetchPendingRequests(currentUser.user_id),
            ]);

            // Show notification for new incoming requests
            if (payload.eventType === 'INSERT') {
              const request = payload.new as FriendRequest;
              if (request.to_user_id === currentUser.user_id) {
                toast({ title: 'New friend request received!' });
              }
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser, fetchFriends, fetchPendingRequests, toast]);

  return {
    currentUser,
    friends,
    pendingRequests,
    allUsers,
    loading,
    updateStatus,
    sendFriendRequest,
    respondToRequest,
    removeFriend,
    refetch: async () => {
      if (currentUser) {
        await Promise.all([
          fetchFriends(currentUser.user_id),
          fetchPendingRequests(currentUser.user_id),
          fetchAllUsers(currentUser.user_id),
        ]);
      }
    },
  };
}
