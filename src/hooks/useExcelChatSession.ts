import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { ParsedExcel } from '@/lib/excelParser';

export interface ExcelChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  document_id?: string | null;
  session_id: string;
  /** Local-only field for cell references (not stored in DB) */
  cellReferences?: Array<{ sheet: string; cell: string; value: unknown }>;
}

interface UseExcelChatSessionOptions {
  documentId: string | null;
  excel: ParsedExcel | null;
}

/**
 * Hook to persist Excel chat sessions to the database.
 * - Creates/loads a chat session linked to the Excel document
 * - Saves user and assistant messages
 * - Auto-saves partial responses periodically
 * - Supports "continue" by resuming from the last saved content
 */
export function useExcelChatSession({ documentId, excel }: UseExcelChatSessionOptions) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ExcelChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastSavedContent, setLastSavedContent] = useState<string>('');
  
  // Refs for auto-save
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pendingAssistantIdRef = useRef<string | null>(null);
  const pendingContentRef = useRef<string>('');

  // Load or create session when documentId changes
  useEffect(() => {
    if (!documentId) {
      setSessionId(null);
      setMessages([]);
      return;
    }

    let mounted = true;

    const loadOrCreateSession = async () => {
      setLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || !mounted) return;

        // Check for existing session for this document
        const { data: existingMessages, error: msgError } = await supabase
          .from('chat_messages')
          .select('*, chat_sessions!inner(*)')
          .eq('document_id', documentId)
          .order('created_at', { ascending: true });

        if (msgError) {
          console.error('Error loading Excel chat:', msgError);
          return;
        }

        if (existingMessages && existingMessages.length > 0) {
          // Load existing session
          const existingSessionId = existingMessages[0].session_id;
          setSessionId(existingSessionId);
          setMessages(existingMessages.map(m => ({
            id: m.id,
            role: m.role as 'user' | 'assistant',
            content: m.content,
            created_at: m.created_at,
            document_id: m.document_id,
            session_id: m.session_id,
          })));

          // Track last saved assistant content for resume
          const lastAssistant = [...existingMessages].reverse().find(m => m.role === 'assistant');
          if (lastAssistant) {
            setLastSavedContent(lastAssistant.content);
          }
        } else {
          // Create new session
          const title = excel?.fileName 
            ? `Excel: ${excel.fileName}` 
            : 'Excel Analysis';

          const { data: newSession, error: sessionError } = await supabase
            .from('chat_sessions')
            .insert({ title, user_id: user.id })
            .select()
            .single();

          if (sessionError) {
            console.error('Error creating Excel session:', sessionError);
            return;
          }

          if (mounted) {
            setSessionId(newSession.id);
            setMessages([]);
          }
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadOrCreateSession();

    return () => {
      mounted = false;
    };
  }, [documentId, excel?.fileName]);

  // Cleanup auto-save timer on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearInterval(autoSaveTimerRef.current);
      }
    };
  }, []);

  /**
   * Save a user message to the database
   */
  const saveUserMessage = useCallback(async (content: string): Promise<ExcelChatMessage | null> => {
    if (!sessionId || !content.trim()) return null;

    const { data, error } = await supabase
      .from('chat_messages')
      .insert({
        session_id: sessionId,
        role: 'user',
        content,
        document_id: documentId,
      })
      .select()
      .single();

    if (error) {
      console.error('Error saving user message:', error);
      return null;
    }

    const msg: ExcelChatMessage = {
      id: data.id,
      role: 'user',
      content: data.content,
      created_at: data.created_at,
      document_id: data.document_id,
      session_id: data.session_id,
    };

    setMessages(prev => [...prev, msg]);
    return msg;
  }, [sessionId, documentId]);

  /**
   * Start streaming an assistant response.
   * Returns an ID that should be used for updates.
   */
  const startAssistantMessage = useCallback(async (): Promise<string | null> => {
    if (!sessionId) return null;

    // Create placeholder in DB
    const { data, error } = await supabase
      .from('chat_messages')
      .insert({
        session_id: sessionId,
        role: 'assistant',
        content: '...',
        document_id: documentId,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating assistant message:', error);
      return null;
    }

    const msg: ExcelChatMessage = {
      id: data.id,
      role: 'assistant',
      content: '',
      created_at: data.created_at,
      document_id: data.document_id,
      session_id: data.session_id,
    };

    setMessages(prev => [...prev, msg]);
    pendingAssistantIdRef.current = data.id;
    pendingContentRef.current = '';

    // Start auto-save every 3 seconds
    autoSaveTimerRef.current = setInterval(() => {
      const content = pendingContentRef.current;
      const id = pendingAssistantIdRef.current;
      if (id && content && content.length > 0) {
        supabase
          .from('chat_messages')
          .update({ content })
          .eq('id', id)
          .then(({ error }) => {
            if (!error) {
              setLastSavedContent(content);
            }
          });
      }
    }, 3000);

    return data.id;
  }, [sessionId, documentId]);

  /**
   * Update streaming content (local + periodic DB save)
   */
  const updateAssistantContent = useCallback((messageId: string, content: string) => {
    pendingContentRef.current = content;
    setMessages(prev => 
      prev.map(m => m.id === messageId ? { ...m, content } : m)
    );
  }, []);

  /**
   * Finalize assistant message - save final content to DB
   */
  const finalizeAssistantMessage = useCallback(async (messageId: string, finalContent: string) => {
    // Stop auto-save
    if (autoSaveTimerRef.current) {
      clearInterval(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }

    // Save final content
    const { error } = await supabase
      .from('chat_messages')
      .update({ content: finalContent })
      .eq('id', messageId);

    if (error) {
      console.error('Error finalizing assistant message:', error);
    }

    setLastSavedContent(finalContent);
    pendingAssistantIdRef.current = null;
    pendingContentRef.current = '';

    setMessages(prev =>
      prev.map(m => m.id === messageId ? { ...m, content: finalContent } : m)
    );
  }, []);

  /**
   * Force save current progress (call on stop or before unload)
   */
  const forceSaveProgress = useCallback(async () => {
    const id = pendingAssistantIdRef.current;
    const content = pendingContentRef.current;

    if (autoSaveTimerRef.current) {
      clearInterval(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }

    if (id && content && content.length > 3) {
      const { error } = await supabase
        .from('chat_messages')
        .update({ content: content + '\n\n⚠️ *Analysis was stopped. Say "continue" to resume.*' })
        .eq('id', id);

      if (!error) {
        setLastSavedContent(content);
      }
    }

    pendingAssistantIdRef.current = null;
    pendingContentRef.current = '';
  }, []);

  /**
   * Check if user wants to continue from previous analysis
   */
  const shouldContinue = useCallback((userQuery: string): boolean => {
    const lowerQuery = userQuery.toLowerCase().trim();
    const continueKeywords = ['continue', 'resume', 'go on', 'keep going', 'carry on', 'proceed', 'जारी'];
    return continueKeywords.some(kw => lowerQuery.includes(kw));
  }, []);

  /**
   * Get context for continuing previous analysis
   */
  const getContinueContext = useCallback((): string | null => {
    if (!lastSavedContent || lastSavedContent.length < 50) return null;

    // Get last ~2000 chars of previous response for context
    const contextLength = Math.min(2000, lastSavedContent.length);
    return lastSavedContent.slice(-contextLength);
  }, [lastSavedContent]);

  /**
   * Update session title
   */
  const updateSessionTitle = useCallback(async (title: string) => {
    if (!sessionId) return;

    await supabase
      .from('chat_sessions')
      .update({ title, updated_at: new Date().toISOString() })
      .eq('id', sessionId);
  }, [sessionId]);

  return {
    sessionId,
    messages,
    loading,
    lastSavedContent,
    saveUserMessage,
    startAssistantMessage,
    updateAssistantContent,
    finalizeAssistantMessage,
    forceSaveProgress,
    shouldContinue,
    getContinueContext,
    updateSessionTitle,
    setMessages,
  };
}
