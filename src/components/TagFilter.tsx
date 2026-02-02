import { X, Tag, Filter } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface TagFilterProps {
  allTags: string[];
  selectedTags: string[];
  onTagSelect: (tag: string) => void;
  onTagRemove: (tag: string) => void;
  onClearAll: () => void;
}

export function TagFilter({
  allTags,
  selectedTags,
  onTagSelect,
  onTagRemove,
  onClearAll,
}: TagFilterProps) {
  // Get unique tags and sort by frequency
  const tagCounts = allTags.reduce((acc, tag) => {
    acc[tag] = (acc[tag] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const uniqueTags = Object.keys(tagCounts).sort((a, b) => tagCounts[b] - tagCounts[a]);

  if (uniqueTags.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs">
              <Filter className="w-3 h-3" />
              Filter
              {selectedTags.length > 0 && (
                <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                  {selectedTags.length}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-2" align="start">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground">Filter by tags</span>
              {selectedTags.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onClearAll}
                  className="h-6 text-xs px-2"
                >
                  Clear all
                </Button>
              )}
            </div>
            <ScrollArea className="h-48">
              <div className="flex flex-wrap gap-1.5">
                {uniqueTags.map((tag) => (
                  <Badge
                    key={tag}
                    variant={selectedTags.includes(tag) ? "default" : "outline"}
                    className={cn(
                      "cursor-pointer text-xs transition-colors",
                      selectedTags.includes(tag) 
                        ? "bg-primary text-primary-foreground" 
                        : "hover:bg-accent"
                    )}
                    onClick={() => {
                      if (selectedTags.includes(tag)) {
                        onTagRemove(tag);
                      } else {
                        onTagSelect(tag);
                      }
                    }}
                  >
                    <Tag className="w-2.5 h-2.5 mr-1" />
                    {tag}
                    <span className="ml-1 text-[10px] opacity-70">({tagCounts[tag]})</span>
                  </Badge>
                ))}
              </div>
            </ScrollArea>
          </PopoverContent>
        </Popover>
      </div>

      {/* Selected tags display */}
      {selectedTags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedTags.map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className="text-xs gap-1 pr-1"
            >
              {tag}
              <button
                onClick={() => onTagRemove(tag)}
                className="ml-0.5 hover:text-destructive"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
