import { useState, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAppSettings } from '@/hooks/useAppSettings';
import { ollama } from '@/lib/ollama';
import type { Document } from './useDocuments';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  documentId?: string;
  documentName?: string;
  createdAt: Date;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-with-document`;

// Helper to get JWT token
async function getAuthToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { settings: appSettings } = useAppSettings();

  const sendMessage = useCallback(async (
    content: string,
    document: Document | null,
    action?: 'summarize' | 'generateFaq' | 'paraphrase' | 'grammar' | 'translate' | 'email' | 'letter',
    faqCount?: number,
    targetLanguage?: string
  ) => {
    if (!content.trim() && !action) return;

    let userContent = content;
    if (action === 'generateFaq') userContent = `Generate ${faqCount} FAQs from ${document?.alias}`;
    else if (action === 'paraphrase') userContent = `Paraphrase this text: ${content}`;
    else if (action === 'grammar') userContent = `Check and fix grammar for: ${content}`;
    else if (action === 'translate') userContent = `Translate this text to ${targetLanguage}: ${content}`;
    else if (action === 'email') userContent = `Write an email about: ${content}`;
    else if (action === 'letter') userContent = `Write a letter about: ${content}`;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: userContent,
      documentId: document?.id,
      documentName: document?.alias,
      createdAt: new Date(),
    };

    if (!action || action === 'generateFaq') {
      setMessages(prev => [...prev, userMessage]);
    }

    setIsLoading(true);
    let assistantContent = '';

    try {
      if (appSettings.local_ai.enabled) {
        // Use Local Ollama
        console.log('Using Local AI (Ollama)...');
        ollama.setBaseUrl(appSettings.local_ai.ollama_url);

        let systemPrompt = "You are GenX AI Gyankosh, a helpful assistant.";
        if (document?.content_text) {
          systemPrompt += `\n\nContext from document "${document.alias}":\n${document.content_text.slice(0, 8000)}`;
        }

        const ollamaResponse = await ollama.chat({
          model: appSettings.local_ai.model_name,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent }
          ],
          stream: true
        }, (chunk) => {
          assistantContent += chunk;
          updateAssistantMessage(assistantContent, document);
        });

        return assistantContent;
      } else {
        // Use Supabase Cloud
        const token = await getAuthToken();
        if (!token) {
          throw new Error('Not authenticated. Please log in.');
        }

        const response = await fetch(CHAT_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            messages: action ? [] : [{ role: 'user', content }],
            documentContent: document?.content_text || '',
            documentName: document?.alias || document?.name,
            action,
            faqCount,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `Request failed: ${response.status}`);
        }

        if (!response.body) throw new Error('No response body');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        const processChunk = () => {
          let newlineIndex: number;
          while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
            let line = buffer.slice(0, newlineIndex);
            buffer = buffer.slice(newlineIndex + 1);

            if (line.endsWith('\r')) line = line.slice(0, -1);
            if (line.startsWith(':') || line.trim() === '') continue;
            if (!line.startsWith('data: ')) continue;

            const jsonStr = line.slice(6).trim();
            if (jsonStr === '[DONE]') return true;

            try {
              const parsed = JSON.parse(jsonStr);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                assistantContent += delta;
                updateAssistantMessage(assistantContent, document);
              }
            } catch {
              buffer = line + '\n' + buffer;
              break;
            }
          }
          return false;
        };

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          if (processChunk()) break;
        }

        // Final flush
        if (buffer.trim()) {
          processChunk();
        }

        return assistantContent;
      }
    } catch (error) {
      console.error('Chat error:', error);
      toast({
        title: appSettings.local_ai.enabled ? 'Local AI Error' : 'Error',
        description: error instanceof Error ? error.message : 'Failed to get response',
        variant: 'destructive',
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [toast, appSettings.local_ai]);


  const updateAssistantMessage = useCallback((content: string, document: Document | null) => {
    setMessages(prev => {
      const last = prev[prev.length - 1];
      if (last?.role === 'assistant') {
        return prev.map((m, i) =>
          i === prev.length - 1 ? { ...m, content } : m
        );
      }
      return [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant' as const,
        content,
        documentId: document?.id,
        documentName: document?.alias,
        createdAt: new Date(),
      }];
    });
  }, []);

  const clearMessages = () => setMessages([]);

  return {
    messages,
    isLoading,
    sendMessage,
    clearMessages,
    setMessages,
  };
}
