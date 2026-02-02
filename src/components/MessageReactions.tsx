import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SmilePlus } from 'lucide-react';
import type { MessageReaction } from '@/hooks/useMessageReactions';

interface MessageReactionsProps {
  messageId: string;
  reactions: MessageReaction[];
  currentUserId: string;
  onAddReaction: (messageId: string, emoji: string) => void;
  quickReactions: string[];
  isOwn: boolean;
}

export function MessageReactions({
  messageId,
  reactions,
  currentUserId,
  onAddReaction,
  quickReactions,
  isOwn,
}: MessageReactionsProps) {
  // Group reactions by emoji
  const groupedReactions = reactions.reduce((acc, r) => {
    if (!acc[r.emoji]) {
      acc[r.emoji] = { count: 0, hasOwn: false };
    }
    acc[r.emoji].count++;
    if (r.user_id === currentUserId) {
      acc[r.emoji].hasOwn = true;
    }
    return acc;
  }, {} as Record<string, { count: number; hasOwn: boolean }>);

  return (
    <div className={`flex items-center gap-1 mt-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
      {/* Existing reactions */}
      {Object.entries(groupedReactions).map(([emoji, { count, hasOwn }]) => (
        <button
          key={emoji}
          onClick={() => onAddReaction(messageId, emoji)}
          className={`
            inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs
            transition-colors hover:bg-muted
            ${hasOwn ? 'bg-primary/20 ring-1 ring-primary/50' : 'bg-muted/50'}
          `}
        >
          <span>{emoji}</span>
          {count > 1 && <span className="text-muted-foreground">{count}</span>}
        </button>
      ))}

      {/* Add reaction button */}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <SmilePlus className="w-3.5 h-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent side="top" className="w-auto p-2">
          <div className="flex gap-1">
            {quickReactions.map((emoji) => (
              <button
                key={emoji}
                onClick={() => onAddReaction(messageId, emoji)}
                className="p-1.5 hover:bg-muted rounded-lg transition-colors text-lg"
              >
                {emoji}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
