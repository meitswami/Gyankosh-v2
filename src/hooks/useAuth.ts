import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;

    // Listener for ongoing auth changes (does NOT control initial loading)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;

      setSession(session);
      setUser(session?.user ?? null);

      if (event === 'SIGNED_OUT') {
        navigate('/auth');
      }
    });

    // Initial load (controls loading state)
    const initializeAuth = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!mounted) return;

        setSession(session);
        setUser(session?.user ?? null);

        if (!session) {
          navigate('/auth');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    initializeAuth();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [navigate]);

  const signUp = useCallback(async (email: string, password: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl
      }
    });
    return { error };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  }, []);

  const logout = useCallback(async () => {
    try {
      // Clear state first
      setUser(null);
      setSession(null);
      
      // Clear any localStorage flags
      localStorage.removeItem('gyaankosh_logged_in');
      localStorage.removeItem('gyaankosh_user');
      localStorage.removeItem('privateKey');
      
      // Then sign out
      await supabase.auth.signOut();
      
      navigate('/auth');
    } catch (error) {
      console.error('Logout error:', error);
      // Force navigate even if signOut fails
      navigate('/auth');
    }
  }, [navigate]);

  return { 
    user, 
    session,
    isLoggedIn: !!session, 
    loading, 
    signUp,
    signIn,
    logout 
  };
}
