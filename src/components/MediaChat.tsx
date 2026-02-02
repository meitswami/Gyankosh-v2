import { useState, useCallback } from 'react';
import { Send, Clock, Loader2, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useMediaFiles, type MediaQA } from '@/hooks/useMediaFiles';
import { cn } from '@/lib/utils';

interface MediaChatProps {
  mediaId: string;
  qaHistory: MediaQA[];
  onSeekTo?: (time: number) => void;
  onQAAdded?: () => void;
  className?: string;
}

interface QAResponse {
  answer: string;
  relevant_timestamps: number[];
  confidence: 'high' | 'medium' | 'low';
  speakers_mentioned?: string[] | null;
  seek_to?: number | null;
}

export function MediaChat({
  mediaId,
  qaHistory,
  onSeekTo,
  onQAAdded,
  className,
}: MediaChatProps) {
  const [question, setQuestion] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentAnswer, setCurrentAnswer] = useState<QAResponse | null>(null);
  const { askQuestion } = useMediaFiles();

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleAskQuestion = useCallback(async () => {
    if (!question.trim() || isLoading) return;

    setIsLoading(true);
    setCurrentAnswer(null);

    try {
      const response = await askQuestion(mediaId, question);
      setCurrentAnswer(response);
      setQuestion('');
      onQAAdded?.();
    } catch (error) {
      console.error('Q&A error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [mediaId, question, isLoading, askQuestion, onQAAdded]);

  const handleTimestampClick = (time: number) => {
    onSeekTo?.(time);
  };

  const TimestampBadge = ({ time }: { time: number }) => (
    <Badge
      variant="secondary"
      className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors"
      onClick={() => handleTimestampClick(time)}
    >
      <Clock className="h-3 w-3 mr-1" />
      {formatTime(time)}
    </Badge>
  );

  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <MessageSquare className="h-5 w-5" />
          Ask about this media
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-4">
        {/* Q&A History */}
        <ScrollArea className="flex-1 pr-4 -mr-4">
          <div className="space-y-4">
            {qaHistory.map((qa) => (
              <div key={qa.id} className="space-y-2">
                <div className="bg-primary/10 rounded-lg p-3">
                  <p className="text-sm font-medium">{qa.question}</p>
                </div>
                <div className="bg-muted rounded-lg p-3 space-y-2">
                  <p className="text-sm">{qa.answer}</p>
                  {qa.relevant_timestamps && qa.relevant_timestamps.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {qa.relevant_timestamps.map((time, i) => (
                        <TimestampBadge key={i} time={time} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Current Answer */}
            {currentAnswer && (
              <div className="space-y-2">
                <div className="bg-muted rounded-lg p-3 space-y-2">
                  <p className="text-sm">{currentAnswer.answer}</p>
                  {currentAnswer.relevant_timestamps &&
                    currentAnswer.relevant_timestamps.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {currentAnswer.relevant_timestamps.map((time, i) => (
                          <TimestampBadge key={i} time={time} />
                        ))}
                      </div>
                    )}
                  {currentAnswer.speakers_mentioned &&
                    currentAnswer.speakers_mentioned.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Speakers: {currentAnswer.speakers_mentioned.join(', ')}
                      </p>
                    )}
                </div>
              </div>
            )}

            {isLoading && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Analyzing transcript...</span>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Input */}
        <div className="flex gap-2">
          <Input
            placeholder="Ask a question about this video/audio..."
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAskQuestion()}
            disabled={isLoading}
          />
          <Button
            onClick={handleAskQuestion}
            disabled={!question.trim() || isLoading}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Suggested Questions */}
        {qaHistory.length === 0 && !currentAnswer && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Try asking:</p>
            <div className="flex flex-wrap gap-2">
              {[
                'What is the main topic?',
                'Summarize the key points',
                'Who are the speakers?',
              ].map((q) => (
                <Badge
                  key={q}
                  variant="outline"
                  className="cursor-pointer hover:bg-muted"
                  onClick={() => setQuestion(q)}
                >
                  {q}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
