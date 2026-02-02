import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { generateKeyPair, storePrivateKey } from '@/lib/encryption';

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
  const [pendingRequests] = useState<FriendRequest[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

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

  // Fetch friends from the friends table
  const fetchFriends = useCallback(async (userId: string) => {
    try {
      const { data: friendsData } = await supabase
        .from('friends')
        .select('friend_id')
        .eq('user_id', userId)
        .eq('status', 'accepted');

      if (!friendsData?.length) {
        setFriends([]);
        return;
      }

      const friendIds = friendsData.map(f => f.friend_id);

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

  // Send friend request using friends table
  const sendFriendRequest = useCallback(async (toUserId: string) => {
    if (!currentUser) return false;
    
    try {
      const { error } = await supabase
        .from('friends')
        .insert({
          user_id: currentUser.user_id,
          friend_id: toUserId,
          status: 'pending',
        });

      if (error) {
        console.error('Friend request error:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error sending friend request:', error);
      return false;
    }
  }, [currentUser]);

  // Accept/reject friend request
  const respondToRequest = useCallback(async (_requestId: string, _accept: boolean) => {
    // Stub implementation - would need friend_requests table
    return false;
  }, []);

  // Remove friend
  const removeFriend = useCallback(async (friendUserId: string) => {
    if (!currentUser) return false;
    
    try {
      // Note: RLS on friends table may prevent delete
      await supabase
        .from('friends')
        .delete()
        .eq('user_id', currentUser.user_id)
        .eq('friend_id', friendUserId);

      await fetchFriends(currentUser.user_id);
      return true;
    } catch (error) {
      console.error('Error removing friend:', error);
      return false;
    }
  }, [currentUser, fetchFriends]);

  // Initialize on auth change
  useEffect(() => {
    let mounted = true;

    // Listen for auth changes - INITIAL_SESSION fires on page load with existing session
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;
      
      // Initialize on initial load, sign in, or token refresh
      if ((event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user) {
        await initializeProfile(session.user.id, session.user.email || '');
        await Promise.all([
          fetchFriends(session.user.id),
          fetchAllUsers(session.user.id),
        ]);
        setLoading(false);
      } else if (event === 'SIGNED_OUT') {
        if (currentUser) {
          await updateStatus('offline');
        }
        setCurrentUser(null);
        setFriends([]);
        setLoading(false);
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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser]);

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
          fetchAllUsers(currentUser.user_id),
        ]);
      }
    },
  };
}
