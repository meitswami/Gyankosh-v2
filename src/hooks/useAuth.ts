import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const initTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    let mounted = true;

    const finishLoading = () => {
      if (!mounted) return;
      setLoading(false);
      if (initTimeoutRef.current) {
        window.clearTimeout(initTimeoutRef.current);
        initTimeoutRef.current = null;
      }
    };

    // Hard timeout: never allow auth loading to hang forever.
    // If we can't restore a session quickly, we force sign-out and send user to login.
    initTimeoutRef.current = window.setTimeout(() => {
      if (!mounted) return;
      console.warn('[auth] init timeout - forcing logout');
      setSession(null);
      setUser(null);
      finishLoading();
      // best-effort signout (clears any broken refresh state)
      supabase.auth.signOut().finally(() => {
        if (mounted) navigate('/auth', { replace: true });
      });
    }, 4000);

    // Listener for ongoing auth changes (does NOT control initial loading)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;

      setSession(session);
      setUser(session?.user ?? null);

      // INITIAL_SESSION is the most reliable signal that the client hydrated auth state.
      if (event === 'INITIAL_SESSION') {
        finishLoading();
        if (!session) {
          navigate('/auth', { replace: true });
        }
        return;
      }

      if (event === 'TOKEN_REFRESHED') {
        // If we were stuck waiting, this also unblocks UI
        finishLoading();
      }

      if (event === 'SIGNED_OUT') {
        finishLoading();
        navigate('/auth', { replace: true });
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
          navigate('/auth', { replace: true });
        }
      } catch (e) {
        console.error('[auth] getSession failed - forcing logout', e);
        setSession(null);
        setUser(null);
        supabase.auth.signOut().catch(() => {
          // ignore
        });
        if (mounted) navigate('/auth', { replace: true });
      } finally {
        finishLoading();
      }
    };

    initializeAuth();

    return () => {
      mounted = false;
      if (initTimeoutRef.current) {
        window.clearTimeout(initTimeoutRef.current);
        initTimeoutRef.current = null;
      }
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
