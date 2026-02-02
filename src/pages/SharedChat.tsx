import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { BookOpen, User, Bot, ArrowLeft, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';
import { FAQRenderer } from '@/components/FAQRenderer';
import { format } from 'date-fns';

interface SharedMessage {
  role: 'user' | 'assistant';
  content: string;
  documentName?: string;
  createdAt: string;
}

interface SharedChatData {
  title: string;
  messages_snapshot: SharedMessage[];
  created_at: string;
}

const isFAQContent = (content: string) => {
  return content.includes('FAQ_START') || 
         (content.includes('**Q') && content.includes('**A'));
};

export default function SharedChat() {
  const { token } = useParams<{ token: string }>();
  const [chatData, setChatData] = useState<SharedChatData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSharedChat = async () => {
      if (!token) {
        setError('Invalid share link');
        setLoading(false);
        return;
      }

      try {
        // Use secure RPC function instead of direct table access
        const { data, error: fetchError } = await supabase
          .rpc('get_shared_chat_by_token', { p_token: token });

        if (fetchError || !data || data.length === 0) {
          setError('Chat not found or link has expired');
          return;
        }

        const chatRecord = data[0];

        setChatData({
          title: chatRecord.title,
          messages_snapshot: chatRecord.messages_snapshot as unknown as SharedMessage[],
          created_at: chatRecord.created_at,
        });

        // Increment view count using secure RPC function
        await supabase.rpc('increment_chat_view_count', { p_token: token });
      } catch (err) {
        console.error('Error fetching shared chat:', err);
        setError('Failed to load shared chat');
      } finally {
        setLoading(false);
      }
    };

    fetchSharedChat();
  }, [token]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !chatData) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-background p-4">
        <div className="text-center space-y-4">
          <BookOpen className="w-16 h-16 mx-auto text-muted-foreground/50" />
          <h1 className="text-2xl font-bold text-foreground">Chat Not Found</h1>
          <p className="text-muted-foreground max-w-md">
            {error || 'This shared chat may have been deleted or the link is invalid.'}
          </p>
          <Button asChild>
            <Link to="/">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Go to Gyankosh
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border bg-card/95 backdrop-blur px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="font-semibold text-lg text-foreground">{chatData.title}</h1>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                Shared on {format(new Date(chatData.created_at), 'MMM d, yyyy')}
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link to="/">
              Try Gyankosh
            </Link>
          </Button>
        </div>
      </header>

      {/* Messages */}
      <main className="max-w-4xl mx-auto p-6">
        <ScrollArea className="h-[calc(100vh-180px)]">
          <div className="space-y-6">
            {chatData.messages_snapshot.map((msg, index) => (
              <div
                key={index}
                className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-4 h-4 text-primary" />
                  </div>
                )}
                
                <div
                  className={`
                    max-w-[80%] rounded-2xl px-4 py-3
                    ${msg.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-br-md'
                      : 'bg-muted rounded-bl-md'
                    }
                  `}
                >
                  {msg.role === 'assistant' ? (
                    isFAQContent(msg.content) ? (
                      <FAQRenderer content={msg.content} documentName={msg.documentName} />
                    ) : (
                      <MarkdownRenderer content={msg.content} />
                    )
                  ) : (
                    <p className="text-sm">{msg.content}</p>
                  )}
                </div>
                
                {msg.role === 'user' && (
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                    <User className="w-4 h-4 text-primary-foreground" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </main>

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 right-0 border-t border-border bg-background/95 backdrop-blur p-4">
        <p className="text-center text-xs text-muted-foreground">
          This is a shared conversation from{' '}
          <Link to="/" className="text-primary hover:underline font-medium">
            Gyankosh - ज्ञानकोष
          </Link>
        </p>
      </footer>
    </div>
  );
}
