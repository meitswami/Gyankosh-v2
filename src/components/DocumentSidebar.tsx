import { useState, useMemo } from 'react';
import { FileText, Trash2, BookOpen, GitCompare, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import type { Document } from '@/hooks/useDocuments';
import { getFileIcon } from '@/lib/documentParser';
import { format } from 'date-fns';
import { TagFilter } from '@/components/TagFilter';
import { DocumentSearch } from '@/components/DocumentSearch';

interface DocumentSidebarProps {
  documents: Document[];
  selectedDocument: Document | null;
  onSelectDocument: (doc: Document | null) => void;
  onDeleteDocument: (id: string) => void;
  onCompareDocuments?: () => void;
  loading: boolean;
}

export function DocumentSidebar({
  documents,
  selectedDocument,
  onSelectDocument,
  onDeleteDocument,
  onCompareDocuments,
  loading,
}: DocumentSidebarProps) {
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Get all tags from documents
  const allTags = useMemo(() => {
    return documents.flatMap(doc => doc.tags || []);
  }, [documents]);

  // Filter documents by search query and selected tags
  const filteredDocuments = useMemo(() => {
    let result = documents;
    
    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(doc => 
        doc.alias.toLowerCase().includes(query) ||
        doc.name.toLowerCase().includes(query) ||
        doc.summary?.toLowerCase().includes(query) ||
        doc.content_text?.toLowerCase().includes(query) ||
        doc.tags?.some(tag => tag.toLowerCase().includes(query)) ||
        doc.category?.toLowerCase().includes(query)
      );
    }
    
    // Filter by selected tags
    if (selectedTags.length > 0) {
      result = result.filter(doc => 
        selectedTags.some(tag => doc.tags?.includes(tag))
      );
    }
    
    return result;
  }, [documents, selectedTags, searchQuery]);

  const handleTagSelect = (tag: string) => {
    setSelectedTags(prev => [...prev, tag]);
  };

  const handleTagRemove = (tag: string) => {
    setSelectedTags(prev => prev.filter(t => t !== tag));
  };

  const handleClearTags = () => {
    setSelectedTags([]);
  };

  return (
    <aside className="w-80 border-r border-border bg-sidebar flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="font-semibold text-lg text-sidebar-foreground">ज्ञानकोष</h1>
            <p className="text-xs text-muted-foreground">Knowledge Treasury</p>
          </div>
        </div>
      </div>

      {/* Documents List */}
      <div className="flex-1 overflow-hidden">
        <div className="p-3 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Knowledge Base ({filteredDocuments.length}/{documents.length})
            </h2>
            {documents.length >= 2 && onCompareDocuments && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onCompareDocuments}
                className="h-6 text-xs gap-1 px-2"
              >
                <GitCompare className="w-3 h-3" />
                Compare
              </Button>
            )}
          </div>
          
          {/* Search */}
          <DocumentSearch
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search by name, content, tags..."
          />
          
          {/* Tag Filter */}
          {allTags.length > 0 && (
            <TagFilter
              allTags={allTags}
              selectedTags={selectedTags}
              onTagSelect={handleTagSelect}
              onTagRemove={handleTagRemove}
              onClearAll={handleClearTags}
            />
          )}
        </div>
        
        <ScrollArea className="h-[calc(100vh-280px)]">
          <div className="px-3 pb-3 space-y-1">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filteredDocuments.length === 0 ? (
              <div className="text-center py-8 px-4">
                <FileText className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-sm text-muted-foreground">
                  {searchQuery ? 'No matching documents' : selectedTags.length > 0 ? 'No matching documents' : 'No documents yet'}
                </p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  {searchQuery ? 'Try a different search term' : selectedTags.length > 0 ? 'Try different tags' : 'Upload documents to build your knowledge base'}
                </p>
              </div>
            ) : (
              filteredDocuments.map((doc) => (
                <div
                  key={doc.id}
                  className={`
                    group relative rounded-lg p-3 cursor-pointer transition-all
                    ${selectedDocument?.id === doc.id 
                      ? 'bg-primary/10 border border-primary/20' 
                      : 'hover:bg-sidebar-accent border border-transparent'
                    }
                  `}
                  onClick={() => onSelectDocument(
                    selectedDocument?.id === doc.id ? null : doc
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-lg flex-shrink-0">
                      {getFileIcon(doc.file_type)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-sm text-sidebar-foreground truncate">
                        {doc.alias}
                      </h3>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {doc.name}
                      </p>
                      <p className="text-[10px] text-muted-foreground/60 mt-1">
                        Uploaded {format(new Date(doc.created_at), 'MMM d, yyyy • h:mm a')}
                      </p>
                      {doc.summary && (
                        <p className="text-xs text-muted-foreground/80 line-clamp-2 mt-1">
                          {doc.summary}
                        </p>
                      )}
                      {/* Tags display */}
                      {doc.tags && doc.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {doc.tags.slice(0, 3).map((tag) => (
                            <Badge
                              key={tag}
                              variant="secondary"
                              className="text-[9px] h-4 px-1.5"
                            >
                              {tag}
                            </Badge>
                          ))}
                          {doc.tags.length > 3 && (
                            <Badge variant="outline" className="text-[9px] h-4 px-1.5">
                              +{doc.tags.length - 3}
                            </Badge>
                          )}
                        </div>
                      )}
                      {/* Category badge */}
                      {doc.category && (
                        <Badge variant="outline" className="text-[9px] h-4 px-1.5 mt-1">
                          {doc.category}
                        </Badge>
                      )}
                    </div>
                  </div>
                  
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteDocument(doc.id);
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Footer hint */}
      <div className="p-3 border-t border-sidebar-border">
        <p className="text-xs text-muted-foreground text-center">
          Type <span className="font-mono bg-muted px-1 py-0.5 rounded">#</span> in chat to reference documents
        </p>
      </div>
    </aside>
  );
}
