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

    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!mounted) return;
        
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);

        // Redirect to auth if signed out
        if (event === 'SIGNED_OUT') {
          navigate('/auth');
        }
      }
    );

    // THEN check for existing session with error handling
    const initSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (!mounted) return;
        
        if (error) {
          console.error('Error getting session:', error);
          setLoading(false);
          navigate('/auth');
          return;
        }

        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);

        if (!session) {
          navigate('/auth');
        }
      } catch (error) {
        console.error('Session init error:', error);
        if (mounted) {
          setLoading(false);
          navigate('/auth');
        }
      }
    };

    initSession();

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
