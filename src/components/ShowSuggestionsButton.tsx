import { useState } from 'react';
import { Lightbulb, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface ShowSuggestionsButtonProps {
  content: string;
  onSuggestionsLoaded: (suggestions: string[]) => void;
  className?: string;
}

export function ShowSuggestionsButton({ 
  content, 
  onSuggestionsLoaded,
  className 
}: ShowSuggestionsButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleFetchSuggestions = async () => {
    setIsLoading(true);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-with-document`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            messages: [{
              role: 'user',
              content: `Based on this response, suggest exactly 3 relevant follow-up questions the user might want to ask. Keep them concise (under 10 words each). Return only the questions as a numbered list, nothing else:\n\n${content.slice(0, 2000)}`
            }],
            documentContent: '',
            documentName: '',
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch suggestions');
      }

      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let suggestionsText = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        
        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
          let line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);

          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') break;

          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              suggestionsText += delta;
            }
          } catch {
            // Incomplete JSON, continue
          }
        }
      }

      // Parse the suggestions from numbered list
      const suggestions = suggestionsText
        .split('\n')
        .map(line => line.replace(/^\d+[\.\)]\s*/, '').trim())
        .filter(line => line.length > 5 && line.length < 100)
        .slice(0, 3);

      if (suggestions.length > 0) {
        onSuggestionsLoaded(suggestions);
      } else {
        toast({
          title: 'No suggestions',
          description: 'Could not generate relevant suggestions',
        });
      }
    } catch (error) {
      console.error('Suggestions error:', error);
      toast({
        title: 'Failed to load suggestions',
        description: 'Could not fetch related questions',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={`h-7 gap-1.5 text-muted-foreground hover:text-primary ${className}`}
          onClick={handleFetchSuggestions}
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Lightbulb className="h-3.5 w-3.5" />
          )}
          <span className="text-xs">Suggestions</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">
        <p>Get related questions</p>
      </TooltipContent>
    </Tooltip>
  );
}
