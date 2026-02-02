import { X, FileText, Maximize2, Minimize2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { Document } from '@/hooks/useDocuments';

interface DocumentPreviewProps {
  document: Document | null;
  onClose: () => void;
}

export function DocumentPreview({ document, onClose }: DocumentPreviewProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!document) return null;

  return (
    <div
      className={cn(
        "border-l border-border bg-card/50 flex flex-col transition-all duration-300",
        isExpanded ? "w-[600px]" : "w-[350px]"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="w-4 h-4 text-primary flex-shrink-0" />
          <div className="min-w-0">
            <h3 className="font-medium text-sm truncate">{document.alias}</h3>
            <p className="text-xs text-muted-foreground truncate">{document.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onClose}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Document Info */}
      <div className="px-4 py-3 border-b border-border bg-muted/30 space-y-2">
        {document.summary && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Summary</p>
            <p className="text-sm text-foreground">{document.summary}</p>
          </div>
        )}
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span>Type: {document.file_type.toUpperCase()}</span>
          {document.file_size && (
            <span>Size: {(document.file_size / 1024).toFixed(1)} KB</span>
          )}
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-4">
          <p className="text-xs font-medium text-muted-foreground mb-3">Document Content</p>
          <div className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
            {document.content_text || 'No content available'}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
