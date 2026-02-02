import { useState } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface DocumentSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function DocumentSearch({
  value,
  onChange,
  placeholder = 'Search documents...',
  className,
}: DocumentSearchProps) {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <div className={cn('relative', className)}>
      <Search className={cn(
        'absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors',
        isFocused ? 'text-primary' : 'text-muted-foreground'
      )} />
      <Input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        placeholder={placeholder}
        className="pl-8 pr-8 h-8 text-sm bg-sidebar-accent/50"
      />
      {value && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onChange('')}
          className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
        >
          <X className="w-3 h-3" />
        </Button>
      )}
    </div>
  );
}
