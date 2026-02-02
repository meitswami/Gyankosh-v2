import { useState, useCallback, useRef, useEffect } from 'react';
import { Languages, Copy, Check, ArrowRightLeft, Loader2, Type, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { unicodeToKruti, krutiToUnicode, isLikelyKrutiDev } from '@/lib/krutiDevConverter';
import { supabase } from '@/integrations/supabase/client';
import { DialogClose } from '@/components/ui/dialog';

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-with-document`;

interface TranslationPanelProps {
  initialText?: string;
  onClose?: () => void;
}

type LanguageOption = 'English' | 'Hindi' | 'Hinglish';
type ActionType = 'translate' | 'paraphrase' | 'grammar';

export function TranslationPanel({ initialText = '', onClose }: TranslationPanelProps) {
  const [inputText, setInputText] = useState(initialText);
  const [outputText, setOutputText] = useState('');
  const [krutiDevOutput, setKrutiDevOutput] = useState('');
  const [sourceLanguage, setSourceLanguage] = useState<LanguageOption>('English');
  const [targetLanguage, setTargetLanguage] = useState<LanguageOption>('Hindi');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedUnicode, setCopiedUnicode] = useState(false);
  const [copiedKruti, setCopiedKruti] = useState(false);
  const [activeTab, setActiveTab] = useState<ActionType>('translate');
  const { toast } = useToast();
  
  // Track current request to cancel it if needed
  const abortControllerRef = useRef<AbortController | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup function to cancel any in-flight requests
  const cleanupRequest = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (readerRef.current) {
      readerRef.current.releaseLock().catch(() => {
        // Ignore errors when releasing lock
      });
      readerRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupRequest();
    };
  }, [cleanupRequest]);

  const swapLanguages = () => {
    setSourceLanguage(targetLanguage);
    setTargetLanguage(sourceLanguage);
    setInputText(outputText);
    setOutputText('');
    setKrutiDevOutput('');
  };

  const handleAction = useCallback(async () => {
    if (!inputText.trim()) {
      toast({
        title: 'No text provided',
        description: 'Please enter some text to process',
        variant: 'destructive',
      });
      return;
    }

    // Cancel any existing request before starting a new one
    cleanupRequest();

    setIsLoading(true);
    setOutputText('');
    setKrutiDevOutput('');

    // Create a new AbortController for this request
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, 60000); // 60 second timeout
    timeoutRef.current = timeoutId;

    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) {
        throw new Error('Not authenticated. Please log in.');
      }

      // Check if input is Kruti Dev and convert first
      let processText = inputText;
      if (isLikelyKrutiDev(inputText)) {
        processText = krutiToUnicode(inputText);
        toast({
          title: 'Kruti Dev Detected',
          description: 'Converted to Unicode before processing',
        });
      }

      const response = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: [],
          documentContent: '',
          documentName: '',
          action: activeTab,
          targetLanguage: activeTab === 'translate' ? targetLanguage : undefined,
          sourceLanguage: activeTab === 'translate' ? sourceLanguage : undefined,
          inputText: processText,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        // Try to parse error response
        let errorMessage = `Request failed: ${response.status}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          // If not JSON, try to get text
          try {
            const errorText = await response.text();
            if (errorText) errorMessage = errorText;
          } catch {
            // Use default error message
          }
        }
        throw new Error(errorMessage);
      }

      if (!response.body) {
        throw new Error('No response body received from server');
      }

      reader = response.body.getReader();
      readerRef.current = reader;
      
      const decoder = new TextDecoder();
      let buffer = '';
      let fullResponse = '';
      let hasReceivedData = false;
      let lastDataTime = Date.now();

      try {
        while (true) {
          // Check if request was aborted
          if (abortController.signal.aborted) {
            throw new Error('Request was cancelled');
          }

          // Check for timeout during streaming (30 seconds of no data)
          if (hasReceivedData && Date.now() - lastDataTime > 30000) {
            throw new Error('Stream timeout: No data received for 30 seconds');
          }

          const { done, value } = await reader.read();
          
          if (done) {
            if (!hasReceivedData && !fullResponse) {
              throw new Error('Stream ended without any data');
            }
            break;
          }

          hasReceivedData = true;
          lastDataTime = Date.now();
          buffer += decoder.decode(value, { stream: true });

          let newlineIndex: number;
          while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
            let line = buffer.slice(0, newlineIndex);
            buffer = buffer.slice(newlineIndex + 1);

            if (line.endsWith('\r')) line = line.slice(0, -1);
            if (line.startsWith(':') || line.trim() === '') continue;
            if (!line.startsWith('data: ')) continue;

            const jsonStr = line.slice(6).trim();
            if (jsonStr === '[DONE]') {
              // Stream completed successfully
              break;
            }

            try {
              const parsed = JSON.parse(jsonStr);
              
              // Check for error in response
              if (parsed.error) {
                throw new Error(parsed.error.message || parsed.error || 'API returned an error');
              }

              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                fullResponse += delta;
                setOutputText(fullResponse);
                
                // Generate Kruti Dev version for Hindi output
                if (targetLanguage === 'Hindi' || activeTab !== 'translate') {
                  setKrutiDevOutput(unicodeToKruti(fullResponse));
                }
              }
            } catch (parseError) {
              // If JSON parse fails, it might be a malformed chunk
              // Continue processing but log the error
              console.warn('Failed to parse chunk:', jsonStr, parseError);
              // Don't break, continue processing
            }
          }
        }

        if (!fullResponse) {
          throw new Error('No content received from the API');
        }

        toast({
          title: 'Success',
          description: `${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} completed`,
        });
      } catch (streamError) {
        // If we have partial response, keep it
        if (fullResponse) {
          toast({
            title: 'Partial response',
            description: 'Received partial response before stream error',
            variant: 'default',
          });
        } else {
          throw streamError;
        }
      } finally {
        // Clean up reader
        if (reader) {
          try {
            reader.releaseLock();
          } catch (e) {
            // Reader might already be released or locked
            console.warn('Failed to release reader lock:', e);
          }
          readerRef.current = null;
        }
      }
    } catch (error) {
      console.error('Processing error:', error);
      
      let errorMessage = 'Processing failed';
      if (error instanceof Error) {
        if (error.name === 'AbortError' || error.message === 'Request was cancelled') {
          errorMessage = 'Request was cancelled or timed out. Please try again.';
        } else {
          errorMessage = error.message;
        }
      }

      // Only show error toast if not aborted (user might have cancelled intentionally)
      if (!abortController.signal.aborted) {
        toast({
          title: 'Error',
          description: errorMessage,
          variant: 'destructive',
        });
      }
    } finally {
      // Clean up all resources
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  }, [inputText, activeTab, sourceLanguage, targetLanguage, toast, cleanupRequest]);

  const copyToClipboard = async (text: string, isKruti: boolean) => {
    try {
      await navigator.clipboard.writeText(text);
      if (isKruti) {
        setCopiedKruti(true);
        setTimeout(() => setCopiedKruti(false), 2000);
      } else {
        setCopiedUnicode(true);
        setTimeout(() => setCopiedUnicode(false), 2000);
      }
      toast({
        title: 'Copied!',
        description: isKruti ? 'Kruti Dev text copied' : 'Unicode text copied',
      });
    } catch {
      toast({
        title: 'Copy failed',
        description: 'Please try selecting and copying manually',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="bg-card border border-border rounded-lg p-4 shadow-lg max-w-2xl w-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Languages className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">Language Tools</h3>
        </div>
        {onClose && (
          <Button variant="ghost" size="sm" onClick={onClose}>
            ✕
          </Button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ActionType)} className="mb-4">
        <TabsList className="grid grid-cols-3 w-full">
          <TabsTrigger value="translate" className="gap-1.5">
            <Languages className="w-4 h-4" />
            Translate
          </TabsTrigger>
          <TabsTrigger value="paraphrase" className="gap-1.5">
            <Type className="w-4 h-4" />
            Paraphrase
          </TabsTrigger>
          <TabsTrigger value="grammar" className="gap-1.5">
            <Sparkles className="w-4 h-4" />
            Grammar
          </TabsTrigger>
        </TabsList>

        <TabsContent value="translate" className="space-y-4 mt-4">
          {/* Language Selection */}
          <div className="flex items-center gap-2 justify-center">
            <select
              value={sourceLanguage}
              onChange={(e) => setSourceLanguage(e.target.value as LanguageOption)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="English">English</option>
              <option value="Hindi">Hindi (हिंदी)</option>
              <option value="Hinglish">Hinglish</option>
            </select>
            
            <Button variant="ghost" size="icon" onClick={swapLanguages} className="shrink-0">
              <ArrowRightLeft className="w-4 h-4" />
            </Button>
            
            <select
              value={targetLanguage}
              onChange={(e) => setTargetLanguage(e.target.value as LanguageOption)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="English">English</option>
              <option value="Hindi">Hindi (हिंदी)</option>
              <option value="Hinglish">Hinglish</option>
            </select>
          </div>
        </TabsContent>

        <TabsContent value="paraphrase" className="mt-4">
          <p className="text-sm text-muted-foreground text-center">
            Rewrite your text in a different way while keeping the meaning
          </p>
        </TabsContent>

        <TabsContent value="grammar" className="mt-4">
          <p className="text-sm text-muted-foreground text-center">
            Check and fix grammar, spelling, and punctuation errors
          </p>
        </TabsContent>
      </Tabs>

      {/* Input Area */}
      <div className="space-y-2">
        <Label htmlFor="input">
          {activeTab === 'translate' ? `Input (${sourceLanguage})` : 'Input Text'}
        </Label>
        <Textarea
          id="input"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={
            activeTab === 'translate'
              ? 'Enter text to translate... (supports Unicode & Kruti Dev)'
              : activeTab === 'paraphrase'
              ? 'Enter text to paraphrase...'
              : 'Enter text to check grammar...'
          }
          className="min-h-[100px] font-sans"
          dir="auto"
        />
        <p className="text-xs text-muted-foreground">
          💡 Supports Hindi, English, Hinglish. Kruti Dev input is auto-detected.
        </p>
      </div>

      {/* Action Button */}
      <Button
        onClick={handleAction}
        disabled={isLoading || !inputText.trim()}
        className="w-full mt-4 gap-2"
      >
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Processing...
          </>
        ) : (
          <>
            {activeTab === 'translate' && <Languages className="w-4 h-4" />}
            {activeTab === 'paraphrase' && <Type className="w-4 h-4" />}
            {activeTab === 'grammar' && <Sparkles className="w-4 h-4" />}
            {activeTab === 'translate' ? 'Translate' : activeTab === 'paraphrase' ? 'Paraphrase' : 'Check Grammar'}
          </>
        )}
      </Button>

      {/* Output Area */}
      {outputText && (
        <div className="mt-4 space-y-4">
          {/* Unicode Output */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                {activeTab === 'translate' ? `Output (${targetLanguage})` : 'Result'}
                <Badge variant="secondary" className="text-xs">Unicode</Badge>
              </Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyToClipboard(outputText, false)}
                className="gap-1.5 h-7"
              >
                {copiedUnicode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                Copy Unicode
              </Button>
            </div>
            <div className="p-3 bg-muted rounded-lg min-h-[80px] whitespace-pre-wrap font-sans" dir="auto">
              {outputText}
            </div>
          </div>

          {/* Kruti Dev Output (for Hindi) */}
          {(targetLanguage === 'Hindi' || activeTab !== 'translate') && krutiDevOutput && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  Kruti Dev Format
                  <Badge variant="outline" className="text-xs">Legacy</Badge>
                </Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(krutiDevOutput, true)}
                  className="gap-1.5 h-7"
                >
                  {copiedKruti ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  Copy Kruti Dev
                </Button>
              </div>
              <div className="p-3 bg-muted/50 rounded-lg min-h-[60px] whitespace-pre-wrap font-mono text-sm border border-dashed border-border">
                {krutiDevOutput}
              </div>
              <p className="text-xs text-muted-foreground">
                ⚠️ Paste in apps with Kruti Dev font installed (MS Word, PageMaker, etc.)
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
