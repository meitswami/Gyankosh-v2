import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

const WEB_SEARCH_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/web-search`;

export function useWebSearch() {
  const [isSearching, setIsSearching] = useState(false);

  const search = useCallback(async (
    query: string,
    engine: 'google' | 'bing' = 'google',
    onChunk?: (chunk: string) => void
  ): Promise<string> => {
    setIsSearching(true);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      
      if (!token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(WEB_SEARCH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ query, engine, count: 5 }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Search failed');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response');

      const decoder = new TextDecoder();
      let fullResponse = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ') && line !== 'data: [DONE]') {
            try {
              const data = JSON.parse(line.slice(6));
              const content = data.choices?.[0]?.delta?.content;
              if (content) {
                fullResponse += content;
                onChunk?.(content);
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }

      return fullResponse;
    } finally {
      setIsSearching(false);
    }
  }, []);

  return { search, isSearching };
}
