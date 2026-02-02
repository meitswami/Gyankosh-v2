import { useRef, useEffect, useState } from 'react';
import { Bot, User, FileText } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TooltipProvider } from '@/components/ui/tooltip';
import { FAQRenderer, isFAQContent } from '@/components/FAQRenderer';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';
import { AISuggestions, parseAISuggestions } from '@/components/AISuggestions';
import { MessageDocxExport } from '@/components/MessageDocxExport';
import type { ChatMessage } from '@/hooks/useChat';

interface ChatAreaProps {
  messages: ChatMessage[];
  isLoading: boolean;
  hasDocuments?: boolean;
  onSendMessage?: (message: string) => void;
}

export function ChatArea({ messages, isLoading, hasDocuments = false, onSendMessage }: ChatAreaProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Parse suggestions from the last assistant message
  useEffect(() => {
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === 'assistant' && !isLoading) {
        const { suggestions: parsed } = parseAISuggestions(lastMessage.content);
        setSuggestions(parsed);
      }
    }
  }, [messages, isLoading]);

  const handleSuggestionClick = (suggestion: string) => {
    if (onSendMessage) {
      onSendMessage(suggestion);
      setSuggestions([]);
    }
  };

  if (messages.length === 0 && !isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-md animate-fade-in">
          <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
            <span className="text-4xl">📚</span>
          </div>
          <h2 className="text-2xl font-semibold text-foreground mb-2">
            ज्ञानकोष में स्वागत है
          </h2>
          <p className="text-muted-foreground mb-6">
            Welcome to Gyaankosh - Your AI-powered assistant
          </p>
          <div className="space-y-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-3 bg-primary/10 rounded-lg p-3 border border-primary/20">
              <Bot className="w-5 h-5 text-primary" />
              <span className="text-foreground">
                Ask me anything - just type and send!
              </span>
            </div>
            <div className="flex items-center gap-3 bg-muted/50 rounded-lg p-3">
              <FileText className="w-5 h-5 text-primary" />
              <span>Upload documents to build your knowledge base</span>
            </div>
            {hasDocuments && (
              <div className="flex items-center gap-3 bg-muted/50 rounded-lg p-3">
                <span className="font-mono text-primary">#</span>
                <span>Type # to reference a specific document</span>
              </div>
            )}
            <div className="flex items-center gap-3 bg-muted/50 rounded-lg p-3">
              <Bot className="w-5 h-5 text-primary" />
              <span>Ask questions in Hindi, English, or Hinglish</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
    <ScrollArea className="flex-1" ref={scrollRef}>
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        {messages.map((message, index) => {
          const isLastAssistant = message.role === 'assistant' && index === messages.length - 1;
          const { cleanContent } = message.role === 'assistant' 
            ? parseAISuggestions(message.content)
            : { cleanContent: message.content };

          return (
            <div
              key={message.id}
              className={`flex gap-3 animate-fade-in ${
                message.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              {message.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-4 h-4 text-primary" />
                </div>
              )}
              
              <div className={`max-w-[85%] ${
                message.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-assistant'
              }`}>
                {message.documentName && (
                  <div className="document-chip mb-2">
                    <FileText className="w-3 h-3" />
                    {message.documentName}
                  </div>
                )}
                {message.role === 'assistant' && isFAQContent(message.content) ? (
                  <FAQRenderer content={message.content} documentName={message.documentName} />
                ) : message.role === 'assistant' ? (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <MarkdownRenderer content={cleanContent} className="flex-1" />
                      <MessageDocxExport content={cleanContent} documentName={message.documentName} />
                    </div>
                    {isLastAssistant && !isLoading && suggestions.length > 0 && onSendMessage && (
                      <AISuggestions 
                        suggestions={suggestions} 
                        onSelectSuggestion={handleSuggestionClick} 
                      />
                    )}
                  </>
                ) : (
                  <div className="whitespace-pre-wrap text-sm leading-relaxed">
                    {message.content}
                  </div>
                )}
              </div>

              {message.role === 'user' && (
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                  <User className="w-4 h-4 text-primary-foreground" />
                </div>
              )}
            </div>
          );
        })}

        {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
          <div className="flex gap-3 animate-fade-in">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <Bot className="w-4 h-4 text-primary" />
            </div>
            <div className="chat-bubble-assistant">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-primary/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-primary/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-primary/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
      </div>
    </ScrollArea>
    </TooltipProvider>
  );
}
