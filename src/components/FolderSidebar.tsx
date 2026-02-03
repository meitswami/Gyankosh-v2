import { useState, useMemo, useCallback, DragEvent } from 'react';
import { 
  FileText, Trash2, BookOpen, GitCompare, FolderPlus, ChevronRight, ChevronDown,
  MoreHorizontal, Edit2, FolderOpen, Mic, GripVertical
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import type { Document } from '@/hooks/useDocuments';
import { useFolders, SYSTEM_FOLDERS, type Folder } from '@/hooks/useFolders';
import type { Recording } from '@/hooks/useRecordings';
import { getFileIcon } from '@/lib/documentParser';
import { format } from 'date-fns';
import { TagFilter } from '@/components/TagFilter';
import { DocumentSearch } from '@/components/DocumentSearch';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface FolderSidebarProps {
  documents: Document[];
  recordings: Recording[];
  selectedDocument: Document | null;
  onSelectDocument: (doc: Document | null) => void;
  onDeleteDocument: (id: string) => void;
  onMoveDocument?: (docId: string, folderId: string | null) => Promise<boolean>;
  onCompareDocuments?: () => void;
  onOpenRecorder?: () => void;
  onSelectRecording?: (recording: Recording) => void;
  loading: boolean;
}

export function FolderSidebar({
  documents,
  recordings,
  selectedDocument,
  onSelectDocument,
  onDeleteDocument,
  onMoveDocument,
  onCompareDocuments,
  onOpenRecorder,
  onSelectRecording,
  loading,
}: FolderSidebarProps) {
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['Documents', 'Recordings']));
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false);
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);
  const [draggedDocId, setDraggedDocId] = useState<string | null>(null);

  const { toast } = useToast();
  const { 
    customFolders, 
    createFolder, 
    deleteFolder, 
    organizeByType,
    getFileCategory,
    moveDocumentToFolder,
  } = useFolders();

  // Organize documents by type
  const organizedDocs = useMemo(() => organizeByType(documents), [documents, organizeByType]);

  // Get documents in custom folders
  const docsInCustomFolders = useMemo(() => {
    const result: Record<string, Document[]> = {};
    customFolders.forEach(folder => {
      result[folder.id] = documents.filter(d => d.folder_id === folder.id);
    });
    return result;
  }, [documents, customFolders]);

  // Get all tags from documents
  const allTags = useMemo(() => {
    return documents.flatMap(doc => doc.tags || []);
  }, [documents]);

  // Filter documents by search query and selected tags
  const filteredDocuments = useMemo(() => {
    let result = documents;
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(doc => 
        doc.alias.toLowerCase().includes(query) ||
        doc.name.toLowerCase().includes(query) ||
        doc.summary?.toLowerCase().includes(query) ||
        doc.tags?.some(tag => tag.toLowerCase().includes(query))
      );
    }
    
    if (selectedTags.length > 0) {
      result = result.filter(doc => 
        selectedTags.some(tag => doc.tags?.includes(tag))
      );
    }
    
    return result;
  }, [documents, selectedTags, searchQuery]);

  const toggleFolder = (folderName: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderName)) {
        next.delete(folderName);
      } else {
        next.add(folderName);
      }
      return next;
    });
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    const result = await createFolder(newFolderName.trim());
    if (result) {
      setNewFolderName('');
      setShowNewFolderDialog(false);
    }
  };

  // Drag and Drop handlers
  const handleDragStart = useCallback((e: DragEvent<HTMLDivElement>, docId: string) => {
    e.dataTransfer.setData('text/plain', docId);
    e.dataTransfer.effectAllowed = 'move';
    setDraggedDocId(docId);
  }, []);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>, folderId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverFolder(folderId);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverFolder(null);
  }, []);

  const handleDrop = useCallback(async (e: DragEvent<HTMLDivElement>, folderId: string) => {
    e.preventDefault();
    const docId = e.dataTransfer.getData('text/plain');
    setDragOverFolder(null);
    setDraggedDocId(null);

    if (!docId) return;

    // Use the prop callback if provided, otherwise use hook
    if (onMoveDocument) {
      const success = await onMoveDocument(docId, folderId);
      if (success) {
        toast({ title: 'File moved', description: 'Document moved to folder' });
      }
    } else {
      const success = await moveDocumentToFolder(docId, folderId);
      if (success) {
        toast({ title: 'File moved', description: 'Document moved to folder' });
      }
    }
  }, [onMoveDocument, moveDocumentToFolder, toast]);

  const handleRemoveFromFolder = useCallback(async (docId: string) => {
    if (onMoveDocument) {
      await onMoveDocument(docId, null);
    } else {
      await moveDocumentToFolder(docId, null);
    }
    toast({ title: 'File removed from folder' });
  }, [onMoveDocument, moveDocumentToFolder, toast]);

  const renderDocumentItem = (doc: Document, inCustomFolder = false) => (
    <div
      key={doc.id}
      draggable
      onDragStart={(e) => handleDragStart(e, doc.id)}
      className={cn(
        "group relative rounded-lg p-2.5 cursor-pointer transition-all ml-4",
        selectedDocument?.id === doc.id 
          ? 'bg-primary/10 border border-primary/20' 
          : 'hover:bg-sidebar-accent border border-transparent',
        draggedDocId === doc.id && 'opacity-50'
      )}
      onClick={() => onSelectDocument(selectedDocument?.id === doc.id ? null : doc)}
    >
      <div className="flex items-start gap-2">
        <GripVertical className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 cursor-grab mt-0.5" />
        <span className="text-base flex-shrink-0">
          {getFileIcon(doc.file_type)}
        </span>
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-xs text-sidebar-foreground truncate">
            {doc.alias}
          </h3>
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">
            {format(new Date(doc.created_at), 'MMM d, h:mm a')}
          </p>
        </div>
      </div>
      
      <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100">
        {inCustomFolder && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              handleRemoveFromFolder(doc.id);
            }}
            title="Remove from folder"
          >
            <FolderOpen className="w-3 h-3" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-destructive"
          onClick={(e) => {
            e.stopPropagation();
            onDeleteDocument(doc.id);
          }}
        >
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );

  const renderRecordingItem = (recording: Recording) => (
    <div
      key={recording.id}
      className="group relative rounded-lg p-2.5 cursor-pointer transition-all ml-4 hover:bg-sidebar-accent border border-transparent"
      onClick={() => onSelectRecording?.(recording)}
    >
      <div className="flex items-start gap-2">
        <span className="text-base flex-shrink-0">🎙️</span>
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-xs text-sidebar-foreground truncate">
            {recording.name}
          </h3>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-[10px] text-muted-foreground/60">
              {format(new Date(recording.created_at), 'MMM d, h:mm a')}
            </p>
            {recording.duration_seconds && (
              <Badge variant="outline" className="text-[8px] h-4 px-1">
                {Math.floor(recording.duration_seconds / 60)}:{String(Math.floor(recording.duration_seconds % 60)).padStart(2, '0')}
              </Badge>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <aside className="w-80 border-r border-border bg-sidebar flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="font-semibold text-lg text-sidebar-foreground">ज्ञानकोष 2.0</h1>
            <p className="text-xs text-muted-foreground">Knowledge Treasury</p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="p-3 space-y-2 border-b border-sidebar-border">
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenRecorder}
            className="flex-1 gap-1"
          >
            <Mic className="w-4 h-4" />
            Record
          </Button>
          
          <Dialog open={showNewFolderDialog} onOpenChange={setShowNewFolderDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1">
                <FolderPlus className="w-4 h-4" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Folder</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <Input
                  placeholder="Folder name..."
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleCreateFolder();
                    }
                  }}
                  autoFocus
                />
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setShowNewFolderDialog(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreateFolder} disabled={!newFolderName.trim()}>
                    Create
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {documents.length >= 2 && onCompareDocuments && (
            <Button variant="outline" size="sm" onClick={onCompareDocuments} className="gap-1">
              <GitCompare className="w-4 h-4" />
            </Button>
          )}
        </div>

        {/* Search */}
        <DocumentSearch
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search files..."
        />
        
        {/* Tag Filter */}
        {allTags.length > 0 && (
          <TagFilter
            allTags={allTags}
            selectedTags={selectedTags}
            onTagSelect={(tag) => setSelectedTags(prev => [...prev, tag])}
            onTagRemove={(tag) => setSelectedTags(prev => prev.filter(t => t !== tag))}
            onClearAll={() => setSelectedTags([])}
          />
        )}
      </div>

      {/* Folder Tree */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* System Folders (auto-categorized by type) */}
              {SYSTEM_FOLDERS.map((folder) => {
                const docsInFolder = searchQuery || selectedTags.length > 0
                  ? filteredDocuments.filter(d => getFileCategory(d.file_type) === folder.name)
                  : organizedDocs[folder.name] || [];
                
                // For recordings folder, show recordings
                const isRecordingsFolder = folder.name === 'Recordings';
                const recordingsInFolder = isRecordingsFolder ? recordings : [];
                
                const itemCount = isRecordingsFolder ? recordingsInFolder.length : docsInFolder.length;
                if (itemCount === 0) return null;

                return (
                  <Collapsible
                    key={folder.name}
                    open={expandedFolders.has(folder.name)}
                    onOpenChange={() => toggleFolder(folder.name)}
                  >
                    <CollapsibleTrigger asChild>
                      <Button
                        variant="ghost"
                        className="w-full justify-start gap-2 h-9 px-2"
                      >
                        {expandedFolders.has(folder.name) ? (
                          <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        )}
                        <span>{folder.icon}</span>
                        <span className="flex-1 text-left text-sm">{folder.name}</span>
                        <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                          {itemCount}
                        </Badge>
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="space-y-0.5 py-1">
                        {isRecordingsFolder
                          ? recordingsInFolder.map(renderRecordingItem)
                          : docsInFolder.map(doc => renderDocumentItem(doc))
                        }
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}

              {/* Custom Folders */}
              {customFolders.length > 0 && (
                <div className="pt-2 border-t border-sidebar-border mt-2">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-2 py-1">
                    My Folders
                  </p>
                  {customFolders.map((folder) => {
                    const folderDocs = docsInCustomFolders[folder.id] || [];
                    const isDropTarget = dragOverFolder === folder.id;
                    
                    return (
                      <Collapsible
                        key={folder.id}
                        open={expandedFolders.has(folder.id)}
                        onOpenChange={() => toggleFolder(folder.id)}
                      >
                        <div 
                          className={cn(
                            "flex items-center group rounded-md transition-colors",
                            isDropTarget && "bg-primary/20 ring-2 ring-primary/50"
                          )}
                          onDragOver={(e) => handleDragOver(e, folder.id)}
                          onDragLeave={handleDragLeave}
                          onDrop={(e) => handleDrop(e, folder.id)}
                        >
                          <CollapsibleTrigger asChild>
                            <Button
                              variant="ghost"
                              className="flex-1 justify-start gap-2 h-9 px-2"
                            >
                              {expandedFolders.has(folder.id) ? (
                                <FolderOpen className="w-4 h-4 text-primary" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-muted-foreground" />
                              )}
                              <span>{folder.icon || '📁'}</span>
                              <span className="flex-1 text-left text-sm">{folder.name}</span>
                              {folderDocs.length > 0 && (
                                <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                                  {folderDocs.length}
                                </Badge>
                              )}
                            </Button>
                          </CollapsibleTrigger>
                          
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 opacity-0 group-hover:opacity-100"
                              >
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem>
                                <Edit2 className="w-4 h-4 mr-2" />
                                Rename
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => deleteFolder(folder.id)}
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        <CollapsibleContent>
                          <div className="space-y-0.5 py-1">
                            {folderDocs.length > 0 ? (
                              folderDocs.map(doc => renderDocumentItem(doc, true))
                            ) : (
                              <div 
                                className={cn(
                                  "ml-6 py-3 text-xs text-muted-foreground text-center rounded-md border-2 border-dashed transition-colors",
                                  isDropTarget ? "border-primary bg-primary/10" : "border-transparent"
                                )}
                                onDragOver={(e) => handleDragOver(e, folder.id)}
                                onDragLeave={handleDragLeave}
                                onDrop={(e) => handleDrop(e, folder.id)}
                              >
                                {isDropTarget ? 'Drop here' : 'Drag files here'}
                              </div>
                            )}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    );
                  })}
                </div>
              )}

              {/* Empty state */}
              {documents.length === 0 && recordings.length === 0 && (
                <div className="text-center py-8 px-4">
                  <FileText className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
                  <p className="text-sm text-muted-foreground">No files yet</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    Upload documents or start recording
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </ScrollArea>

      {/* Footer hint */}
      <div className="p-3 border-t border-sidebar-border">
        <p className="text-xs text-muted-foreground text-center">
          Drag files to custom folders • Type <span className="font-mono bg-muted px-1 py-0.5 rounded">#</span> in chat to reference
        </p>
      </div>
    </aside>
  );
}
