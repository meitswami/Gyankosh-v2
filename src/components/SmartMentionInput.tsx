import { useState, useRef, useEffect, KeyboardEvent, useCallback } from 'react';
import { Send, AtSign, Hash, Zap, Search, Loader2, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Document } from '@/hooks/useDocuments';
import type { ApiIntegration } from '@/hooks/useApiIntegrations';

interface Friend {
  friend_id: string;
  display_name?: string;
  email?: string;
}

interface MentionSuggestion {
  type: 'user' | 'document' | 'api' | 'search';
  id: string;
  label: string;
  sublabel?: string;
  icon: string;
}

interface SmartMentionInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  documents: Document[];
  friends: Friend[];
  integrations: ApiIntegration[];
  isLoading: boolean;
  placeholder?: string;
  onMention?: (type: string, id: string) => void;
}

export function SmartMentionInput({
  value,
  onChange,
  onSend,
  documents,
  friends,
  integrations,
  isLoading,
  placeholder,
  onMention,
}: SmartMentionInputProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<MentionSuggestion[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mentionType, setMentionType] = useState<'@' | '#' | '!' | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [mentions, setMentions] = useState<{ type: string; id: string; label: string }[]>([]);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Detect mention triggers
  useEffect(() => {
    const lastChar = value.slice(-1);
    const lastWord = value.split(/\s/).pop() || '';
    
    // Check for trigger characters
    if (lastChar === '@') {
      setMentionType('@');
      setSearchTerm('');
      setShowSuggestions(true);
    } else if (lastChar === '#') {
      setMentionType('#');
      setSearchTerm('');
      setShowSuggestions(true);
    } else if (lastChar === '!') {
      setMentionType('!');
      setSearchTerm('');
      setShowSuggestions(true);
    } else if (mentionType && !lastWord.startsWith(mentionType)) {
      setShowSuggestions(false);
      setMentionType(null);
    } else if (mentionType) {
      // Extract search term after trigger
      const triggerIndex = lastWord.indexOf(mentionType);
      if (triggerIndex !== -1) {
        setSearchTerm(lastWord.slice(triggerIndex + 1).toLowerCase());
      }
    }
  }, [value, mentionType]);

  // Build suggestions based on mention type
  useEffect(() => {
    if (!mentionType) {
      setSuggestions([]);
      return;
    }

    let newSuggestions: MentionSuggestion[] = [];

    if (mentionType === '@') {
      // User mentions
      newSuggestions = friends
        .filter(f => 
          (f.display_name?.toLowerCase().includes(searchTerm) || 
           f.email?.toLowerCase().includes(searchTerm) ||
           f.friend_id.toLowerCase().includes(searchTerm))
        )
        .slice(0, 5)
        .map(f => ({
          type: 'user' as const,
          id: f.friend_id,
          label: f.display_name || f.email || f.friend_id.slice(0, 8),
          sublabel: f.email,
          icon: '👤',
        }));
    } else if (mentionType === '#') {
      // Document mentions
      newSuggestions = documents
        .filter(d => 
          d.alias.toLowerCase().includes(searchTerm) ||
          d.name.toLowerCase().includes(searchTerm)
        )
        .slice(0, 5)
        .map(d => ({
          type: 'document' as const,
          id: d.id,
          label: d.alias,
          sublabel: d.category || undefined,
          icon: '📄',
        }));
    } else if (mentionType === '!') {
      // API/Integration mentions + Search engines
      const apiSuggestions = integrations
        .filter(i => 
          i.is_active &&
          (i.name.toLowerCase().includes(searchTerm) ||
           i.description?.toLowerCase().includes(searchTerm))
        )
        .slice(0, 3)
        .map(i => ({
          type: 'api' as const,
          id: i.id,
          label: i.name,
          sublabel: i.description || i.base_url,
          icon: i.icon,
        }));

      // Add search engine options
      const searchEngines: MentionSuggestion[] = [
        { type: 'search' as const, id: 'google', label: 'Google Search', sublabel: 'Search the web', icon: '🔍' },
        { type: 'search' as const, id: 'bing', label: 'Bing Search', sublabel: 'Microsoft search engine', icon: '🌐' },
      ].filter(s => s.label.toLowerCase().includes(searchTerm));

      newSuggestions = [...apiSuggestions, ...searchEngines].slice(0, 5);
    }

    setSuggestions(newSuggestions);
    setSelectedIndex(0);
  }, [mentionType, searchTerm, friends, documents, integrations]);

  const selectSuggestion = useCallback((suggestion: MentionSuggestion) => {
    // Replace the trigger + search term with the mention
    const triggerIndex = value.lastIndexOf(mentionType!);
    const newValue = value.slice(0, triggerIndex) + 
      `${mentionType}${suggestion.label} `;
    
    onChange(newValue);
    setMentions(prev => [...prev, { type: suggestion.type, id: suggestion.id, label: suggestion.label }]);
    setShowSuggestions(false);
    setMentionType(null);
    
    onMention?.(suggestion.type, suggestion.id);
    textareaRef.current?.focus();
  }, [value, mentionType, onChange, onMention]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(i => (i + 1) % suggestions.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(i => (i - 1 + suggestions.length) % suggestions.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        selectSuggestion(suggestions[selectedIndex]);
      } else if (e.key === 'Escape') {
        setShowSuggestions(false);
        setMentionType(null);
      }
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const removeMention = (index: number) => {
    setMentions(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="relative">
      {/* Active mentions display */}
      {mentions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {mentions.map((m, i) => (
            <Badge 
              key={i} 
              variant="secondary" 
              className="gap-1 cursor-pointer hover:bg-destructive/20"
              onClick={() => removeMention(i)}
            >
              {m.type === 'user' && <AtSign className="w-3 h-3" />}
              {m.type === 'document' && <Hash className="w-3 h-3" />}
              {(m.type === 'api' || m.type === 'search') && <Zap className="w-3 h-3" />}
              {m.label}
            </Badge>
          ))}
        </div>
      )}

      {/* Suggestions dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute bottom-full left-0 right-0 mb-2 bg-popover border border-border rounded-lg shadow-lg overflow-hidden z-50 animate-fade-in">
          <div className="p-2 border-b border-border bg-muted/50">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {mentionType === '@' && (
                <>
                  <AtSign className="w-3 h-3" />
                  <span>Mention a user</span>
                </>
              )}
              {mentionType === '#' && (
                <>
                  <Hash className="w-3 h-3" />
                  <span>Reference a document</span>
                </>
              )}
              {mentionType === '!' && (
                <>
                  <Zap className="w-3 h-3" />
                  <span>Use API or search engine</span>
                </>
              )}
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {suggestions.map((s, i) => (
              <button
                key={`${s.type}-${s.id}`}
                className={cn(
                  "w-full text-left px-3 py-2 flex items-center gap-2 transition-colors",
                  i === selectedIndex ? "bg-accent" : "hover:bg-muted/50"
                )}
                onClick={() => selectSuggestion(s)}
              >
                <span className="text-lg">{s.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{s.label}</p>
                  {s.sublabel && (
                    <p className="text-xs text-muted-foreground truncate">{s.sublabel}</p>
                  )}
                </div>
                {s.type === 'search' && <Globe className="w-4 h-4 text-muted-foreground" />}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input area */}
      <div className="flex gap-2 items-end">
        <div className="flex-1 relative">
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={e => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder || "Type @ for users, # for documents, ! for APIs..."}
            className="min-h-[44px] max-h-32 resize-none pr-12"
            rows={1}
          />
        </div>

        <Button
          onClick={onSend}
          disabled={!value.trim() || isLoading}
          className="flex-shrink-0 h-10 w-10"
          size="icon"
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </Button>
      </div>

      {/* Hint */}
      <p className="text-xs text-muted-foreground mt-2 text-center">
        <span className="font-mono text-primary">@</span> users • 
        <span className="font-mono text-primary ml-2">#</span> documents • 
        <span className="font-mono text-primary ml-2">!</span> APIs & web search
      </p>
    </div>
  );
}
