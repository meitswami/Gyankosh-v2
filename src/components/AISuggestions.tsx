import { Button } from '@/components/ui/button';
import { Sparkles } from 'lucide-react';

interface AISuggestionsProps {
  suggestions: string[];
  onSelectSuggestion: (suggestion: string) => void;
  isLoading?: boolean;
}

export function AISuggestions({ suggestions, onSelectSuggestion, isLoading }: AISuggestionsProps) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/50">
        <Sparkles className="w-4 h-4 text-primary animate-pulse" />
        <span className="text-xs text-muted-foreground">Generating suggestions...</span>
      </div>
    );
  }

  if (!suggestions.length) return null;

  return (
    <div className="mt-4 pt-3 border-t border-border/50">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="w-4 h-4 text-primary" />
        <span className="text-xs font-medium text-muted-foreground">Related questions you might ask:</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((suggestion, index) => (
          <Button
            key={index}
            variant="outline"
            size="sm"
            onClick={() => onSelectSuggestion(suggestion)}
            className="text-xs h-auto py-1.5 px-3 whitespace-normal text-left hover:bg-primary/10 hover:border-primary/50"
          >
            {suggestion}
          </Button>
        ))}
      </div>
    </div>
  );
}

// Parse AI suggestions from response
export function parseAISuggestions(content: string): { cleanContent: string; suggestions: string[] } {
  // Look for suggestions in various formats
  const suggestionPatterns = [
    /\n*---\s*\n*\*\*(?:Related|Suggested|Follow-up)[^*]*\*\*:?\s*\n*([\s\S]*?)$/i,
    /\n*(?:Related|Suggested|Follow-up) (?:questions|queries)[^:]*:\s*\n*([\s\S]*?)$/i,
    /\n*💡\s*(?:You might also ask|Try asking)[^:]*:\s*\n*([\s\S]*?)$/i,
  ];

  let cleanContent = content;
  let suggestionsText = '';

  for (const pattern of suggestionPatterns) {
    const match = content.match(pattern);
    if (match) {
      cleanContent = content.replace(match[0], '').trim();
      suggestionsText = match[1];
      break;
    }
  }

  // Parse individual suggestions
  const suggestions: string[] = [];
  if (suggestionsText) {
    const lines = suggestionsText.split('\n');
    for (const line of lines) {
      const cleaned = line
        .replace(/^[-*•\d.)\]]+\s*/, '') // Remove bullets/numbers
        .replace(/^\s*["']|["']\s*$/g, '') // Remove quotes
        .trim();
      if (cleaned.length > 10 && cleaned.length < 150) {
        suggestions.push(cleaned);
      }
    }
  }

  return {
    cleanContent,
    suggestions: suggestions.slice(0, 3), // Max 3 suggestions
  };
}
