import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ChatSession {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  user_id: string | null;
}

const LAST_SESSION_KEY = 'gyankosh_last_session_id';

export function useChatSessions() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionIdState] = useState<string | null>(() => {
    // Restore last session from localStorage on mount
    if (typeof window !== 'undefined') {
      return localStorage.getItem(LAST_SESSION_KEY);
    }
    return null;
  });
  const [loading, setLoading] = useState(true);
  const fetchedRef = useRef(false);

  // Wrapper to persist session ID to localStorage
  const setCurrentSessionId = useCallback((id: string | null) => {
    setCurrentSessionIdState(id);
    if (id) {
      localStorage.setItem(LAST_SESSION_KEY, id);
    } else {
      localStorage.removeItem(LAST_SESSION_KEY);
    }
  }, []);

  // Fetch all sessions for the current user
  const fetchSessions = useCallback(async () => {
    // Check if user is authenticated before fetching
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setLoading(false);
      setSessions([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('chat_sessions')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) {
        // If token is invalid/expired, force logout so UI never gets stuck.
        const status = (error as any)?.status as number | undefined;
        if (status === 401 || status === 403) {
          console.warn('[auth] chat sessions fetch unauthorized - signing out');
          await supabase.auth.signOut();
          setSessions([]);
          setCurrentSessionId(null);
          return;
        }

        console.error('Error fetching sessions:', error);
        return;
      }

      setSessions(data || []);
      
      // Validate that the restored session still exists
      if (currentSessionId && data && !data.find(s => s.id === currentSessionId)) {
        // Session no longer exists, clear it
        setCurrentSessionId(null);
      }
    } finally {
      setLoading(false);
    }
  }, [currentSessionId, setCurrentSessionId]);

  useEffect(() => {
    let mounted = true;

    // Listen for ongoing auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;
      
      // Fetch on sign in or token refresh
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
        await fetchSessions();
      } else if (event === 'SIGNED_OUT') {
        setSessions([]);
        setCurrentSessionId(null);
        setLoading(false);
        fetchedRef.current = false;
      }
    });

    // Initial load (only once, prevents loading from getting stuck on refresh)
    if (!fetchedRef.current) {
      fetchedRef.current = true;
      fetchSessions();
    }

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Create new session with user_id
  const createSession = useCallback(async (title: string = 'New Chat') => {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      console.error('No user found for session creation');
      return null;
    }

    const { data, error } = await supabase
      .from('chat_sessions')
      .insert({ title, user_id: user.id })
      .select()
      .single();

    if (error) {
      console.error('Error creating session:', error);
      return null;
    }

    setSessions(prev => [data, ...prev]);
    setCurrentSessionId(data.id);
    return data;
  }, [setCurrentSessionId]);

  // Update session title
  const updateSessionTitle = useCallback(async (id: string, title: string) => {
    const { error } = await supabase
      .from('chat_sessions')
      .update({ title, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      console.error('Error updating session:', error);
      return;
    }

    setSessions(prev => 
      prev.map(s => s.id === id ? { ...s, title, updated_at: new Date().toISOString() } : s)
    );
  }, []);

  // Delete session
  const deleteSession = useCallback(async (id: string) => {
    const { error } = await supabase
      .from('chat_sessions')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting session:', error);
      return;
    }

    setSessions(prev => prev.filter(s => s.id !== id));
    if (currentSessionId === id) {
      setCurrentSessionId(null);
    }
  }, [currentSessionId, setCurrentSessionId]);

  // Generate title from first message
  const generateTitle = useCallback((firstMessage: string) => {
    // Take first 40 chars or first sentence
    const cleaned = firstMessage.trim();
    const firstSentence = cleaned.split(/[.!?]/)[0];
    const title = firstSentence.length > 40 
      ? firstSentence.slice(0, 37) + '...' 
      : firstSentence || 'New Chat';
    return title;
  }, []);

  return {
    sessions,
    currentSessionId,
    setCurrentSessionId,
    loading,
    createSession,
    updateSessionTitle,
    deleteSession,
    generateTitle,
    refetch: fetchSessions,
  };
}
