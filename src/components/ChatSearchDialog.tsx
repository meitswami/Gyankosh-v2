import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Search, MessageCircle, ArrowRight } from 'lucide-react';
import { highlightText } from '@/lib/highlightText';
import { format, isToday, isYesterday } from 'date-fns';
import type { SearchableMessage } from '@/hooks/useChatSearch';
import type { UserProfile } from '@/hooks/useUserPresence';

interface ChatSearchDialogProps {
  isOpen: boolean;
  onClose: () => void;
  searchResults: SearchableMessage[];
  searchQuery: string;
  onSearch: (query: string) => void;
  loading: boolean;
  onSelectMessage: (friendId: string) => void;
  friendsMap: Map<string, string>;
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function formatTime(dateStr: string) {
  const date = new Date(dateStr);
  if (isToday(date)) return format(date, 'HH:mm');
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'MMM d');
}

export function ChatSearchDialog({
  isOpen,
  onClose,
  searchResults,
  searchQuery,
  onSearch,
  loading,
  onSelectMessage,
  friendsMap,
}: ChatSearchDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Group results by friend
  const groupedResults = searchResults.reduce((acc, msg) => {
    const key = msg.friend_id;
    if (!acc[key]) {
      acc[key] = {
        friendId: msg.friend_id,
        friendName: msg.friend_name,
        messages: [],
      };
    }
    acc[key].messages.push(msg);
    return acc;
  }, {} as Record<string, { friendId: string; friendName: string; messages: SearchableMessage[] }>);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col p-0">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <Search className="w-5 h-5 text-primary" />
            Search All Chats
          </DialogTitle>
        </DialogHeader>

        {/* Search Input */}
        <div className="px-4 py-3 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              ref={inputRef}
              placeholder="Search messages, names..."
              value={searchQuery}
              onChange={(e) => onSearch(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>
        </div>

        {/* Results */}
        <ScrollArea className="flex-1 px-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : searchQuery && searchResults.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <MessageCircle className="w-10 h-10 text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No messages found</p>
            </div>
          ) : searchQuery ? (
            <div className="py-3 space-y-4">
              {Object.values(groupedResults).map((group) => (
                <div key={group.friendId} className="space-y-2">
                  {/* Friend Header */}
                  <button
                    onClick={() => {
                      onSelectMessage(group.friendId);
                      onClose();
                    }}
                    className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-muted/50 transition-colors"
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarFallback>{getInitials(group.friendName)}</AvatarFallback>
                    </Avatar>
                    <span className="font-medium flex-1 text-left">{group.friendName}</span>
                    <span className="text-xs text-muted-foreground">
                      {group.messages.length} match{group.messages.length > 1 ? 'es' : ''}
                    </span>
                    <ArrowRight className="w-4 h-4 text-muted-foreground" />
                  </button>

                  {/* Message Previews */}
                  <div className="ml-11 space-y-1">
                    {group.messages.slice(0, 3).map((msg) => (
                      <button
                        key={msg.id}
                        onClick={() => {
                          onSelectMessage(msg.friend_id);
                          onClose();
                        }}
                        className="w-full text-left p-2 rounded-lg hover:bg-muted/30 transition-colors"
                      >
                        <div className="flex items-start gap-2">
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            {msg.is_sent ? 'You' : group.friendName.split(' ')[0]}:
                          </span>
                          <p className="text-sm text-foreground line-clamp-2 flex-1">
                            {highlightText(msg.content, searchQuery)}
                          </p>
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            {formatTime(msg.created_at)}
                          </span>
                        </div>
                      </button>
                    ))}
                    {group.messages.length > 3 && (
                      <button
                        onClick={() => {
                          onSelectMessage(group.friendId);
                          onClose();
                        }}
                        className="text-xs text-primary hover:underline ml-2"
                      >
                        +{group.messages.length - 3} more matches
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Search className="w-10 h-10 text-muted-foreground mb-3" />
              <p className="text-muted-foreground">Type to search across all your conversations</p>
              <p className="text-xs text-muted-foreground mt-1">
                Messages are encrypted and searched locally
              </p>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
