import { useState } from 'react';
import { Languages, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface TranslateButtonProps {
  content: string;
  onTranslated: (translatedContent: string, language: 'en' | 'hi') => void;
  currentLanguage?: 'en' | 'hi';
  className?: string;
}

// Simple language detection based on character set
function detectLanguage(text: string): 'en' | 'hi' {
  // Count Devanagari characters (Hindi)
  const hindiChars = (text.match(/[\u0900-\u097F]/g) || []).length;
  const totalChars = text.replace(/\s/g, '').length;
  
  // If more than 30% Hindi characters, consider it Hindi
  return hindiChars / totalChars > 0.3 ? 'hi' : 'en';
}

export function TranslateButton({ 
  content, 
  onTranslated, 
  currentLanguage,
  className 
}: TranslateButtonProps) {
  const [isTranslating, setIsTranslating] = useState(false);
  const { toast } = useToast();
  
  const detectedLang = currentLanguage || detectLanguage(content);
  const targetLang = detectedLang === 'en' ? 'hi' : 'en';
  const targetLabel = targetLang === 'hi' ? 'हिंदी' : 'English';

  const handleTranslate = async () => {
    setIsTranslating(true);
    
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
              content: `Translate the following text to ${targetLang === 'hi' ? 'Hindi' : 'English'}. Only provide the translation, no explanations:\n\n${content}`
            }],
            documentContent: '',
            documentName: '',
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Translation failed');
      }

      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let translatedText = '';
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
              translatedText += delta;
            }
          } catch {
            // Incomplete JSON, continue
          }
        }
      }

      if (translatedText) {
        onTranslated(translatedText, targetLang);
        toast({
          title: `Translated to ${targetLabel}`,
          description: 'Click again to switch back',
        });
      }
    } catch (error) {
      console.error('Translation error:', error);
      toast({
        title: 'Translation failed',
        description: 'Could not translate the message',
        variant: 'destructive',
      });
    } finally {
      setIsTranslating(false);
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={`h-7 w-7 text-muted-foreground hover:text-primary ${className}`}
          onClick={handleTranslate}
          disabled={isTranslating}
        >
          {isTranslating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Languages className="h-3.5 w-3.5" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">
        <p>Translate to {targetLabel}</p>
      </TooltipContent>
    </Tooltip>
  );
}
