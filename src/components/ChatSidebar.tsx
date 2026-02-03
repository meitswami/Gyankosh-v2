import { useState, useMemo, useEffect } from 'react';
import { MessageSquare, Plus, Trash2, BookOpen, ChevronDown, ChevronUp, LogOut, GitCompare, Share2, Search, Video, PanelLeftClose, PanelLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import type { ChatSession } from '@/hooks/useChatSessions';
import type { Document } from '@/hooks/useDocuments';
import { getFileIcon } from '@/lib/documentParser';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { DocumentSearch } from '@/components/DocumentSearch';
import { DocumentShare } from '@/components/DocumentShare';
import { DocumentViewerModal } from '@/components/DocumentViewerModal';
import { highlightText, getMatchContext } from '@/lib/highlightText';
import { supabase } from '@/integrations/supabase/client';
import Swal from 'sweetalert2';
import { SessionTimer } from '@/components/SessionTimer';

// Helper to check if session is a video chat
function isVideoSession(title: string): boolean {
  return title.startsWith('🎥');
}

// Cache for video thumbnails fetched from first message
const thumbnailCache: Record<string, string> = {};

interface ChatSidebarProps {
  sessions: ChatSession[];
  currentSessionId: string | null;
  onSelectSession: (id: string | null) => void;
  onNewChat: () => void;
  onDeleteSession: (id: string) => void;
  documents: Document[];
  onDeleteDocument: (id: string) => void;
  onCompareDocuments?: () => void;
  onToggleKnowledgeBase?: () => void;
  loading: boolean;
  // New props for user info and collapse
  userName?: string;
  userEmail?: string;
  loginTime?: Date;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export function ChatSidebar({
  sessions,
  currentSessionId,
  onSelectSession,
  onNewChat,
  onDeleteSession,
  documents,
  onDeleteDocument,
  onCompareDocuments,
  onToggleKnowledgeBase,
  loading,
  userName,
  userEmail,
  loginTime,
  isCollapsed = false,
  onToggleCollapse,
}: ChatSidebarProps) {
  const [knowledgeBaseOpen, setKnowledgeBaseOpen] = useState(false);
  const [docSearchQuery, setDocSearchQuery] = useState('');
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const [shareDocument, setShareDocument] = useState<Document | null>(null);
  const [viewDocument, setViewDocument] = useState<Document | null>(null);
  const [videoThumbnails, setVideoThumbnails] = useState<Record<string, string>>({});
  const navigate = useNavigate();

  // Fetch video thumbnails for video sessions
  useEffect(() => {
    const fetchThumbnails = async () => {
      const videoSessions = sessions.filter(s => isVideoSession(s.title));
      
      for (const session of videoSessions) {
        // Skip if already cached
        if (thumbnailCache[session.id] || videoThumbnails[session.id]) continue;
        
        try {
          // Fetch first message to get YouTube URL
          const { data: messages } = await supabase
            .from('chat_messages')
            .select('content')
            .eq('session_id', session.id)
            .eq('role', 'user')
            .order('created_at', { ascending: true })
            .limit(1);
          
          if (messages && messages.length > 0) {
            const content = messages[0].content;
            // Extract YouTube video ID
            const match = content.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]+)/);
            if (match) {
              const videoId = match[1];
              const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
              thumbnailCache[session.id] = thumbnailUrl;
              setVideoThumbnails(prev => ({ ...prev, [session.id]: thumbnailUrl }));
            }
          }
        } catch (err) {
          console.error('Error fetching thumbnail for session:', session.id, err);
        }
      }
    };
    
    if (sessions.length > 0) {
      fetchThumbnails();
    }
  }, [sessions]);

  // Filter documents by search query
  const filteredDocuments = useMemo(() => {
    if (!docSearchQuery.trim()) return documents;
    const query = docSearchQuery.toLowerCase();
    return documents.filter(doc =>
      doc.alias.toLowerCase().includes(query) ||
      doc.name.toLowerCase().includes(query) ||
      doc.summary?.toLowerCase().includes(query) ||
      doc.tags?.some(tag => tag.toLowerCase().includes(query)) ||
      doc.category?.toLowerCase().includes(query)
    );
  }, [documents, docSearchQuery]);

  // Filter chat sessions by search query
  const filteredSessions = useMemo(() => {
    if (!chatSearchQuery.trim()) return sessions;
    const query = chatSearchQuery.toLowerCase();
    return sessions.filter(session =>
      session.title.toLowerCase().includes(query)
    );
  }, [sessions, chatSearchQuery]);

  const handleLogout = async () => {
    try {
      const result = await Swal.fire({
        title: 'Logout Confirmation',
        text: 'Are you sure you want to logout from ज्ञानकोष 2.0?',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#f97316',
        cancelButtonColor: '#6b7280',
        confirmButtonText: 'Yes, Logout',
        cancelButtonText: 'Cancel',
        background: '#ffffff',
        color: '#1f2937',
      });

      if (result.isConfirmed) {
        // Clear all local storage items
        localStorage.removeItem('gyaankosh_logged_in');
        localStorage.removeItem('gyaankosh_user');
        localStorage.removeItem('privateKey');
        localStorage.removeItem('gyaankosh_login_time');
        
        // Sign out from Supabase - this terminates the session
        const { error } = await supabase.auth.signOut({ scope: 'global' });
        
        if (error) {
          console.error('Supabase signOut error:', error);
        }
        
        await Swal.fire({
          title: 'Logged Out!',
          text: 'You have been successfully logged out.',
          icon: 'success',
          timer: 1500,
          showConfirmButton: false,
          background: '#ffffff',
          color: '#1f2937',
        });
        
        // Force hard redirect to ensure complete session cleanup
        window.location.href = '/auth';
      }
    } catch (error) {
      console.error('Logout error:', error);
      // Fallback: still logout even if SweetAlert fails
      localStorage.clear();
      await supabase.auth.signOut({ scope: 'global' });
      window.location.href = '/auth';
    }
  };

  const handleDeleteChat = async (e: React.MouseEvent, sessionId: string, sessionTitle: string) => {
    e.stopPropagation();
    
    try {
      const result = await Swal.fire({
        title: 'Delete Chat?',
        html: `<p>Are you sure you want to delete this chat?</p><p class="text-sm text-gray-500 mt-2">"${sessionTitle.slice(0, 50)}${sessionTitle.length > 50 ? '...' : ''}"</p>`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#6b7280',
        confirmButtonText: 'Yes, Delete',
        cancelButtonText: 'Cancel',
        background: '#ffffff',
        color: '#1f2937',
      });

      if (result.isConfirmed) {
        onDeleteSession(sessionId);
        
        await Swal.fire({
          title: 'Deleted!',
          text: 'Chat has been deleted successfully.',
          icon: 'success',
          timer: 1500,
          showConfirmButton: false,
          background: '#ffffff',
          color: '#1f2937',
        });
      }
    } catch (error) {
      console.error('Delete chat error:', error);
      onDeleteSession(sessionId);
    }
  };

  const handleDeleteDocument = async (e: React.MouseEvent, docId: string, docName: string) => {
    e.stopPropagation();
    
    try {
      const result = await Swal.fire({
        title: 'Delete Document?',
        html: `<p>Are you sure you want to delete this document from Knowledge Base?</p><p class="text-sm text-gray-500 mt-2">"${docName.slice(0, 50)}${docName.length > 50 ? '...' : ''}"</p>`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#6b7280',
        confirmButtonText: 'Yes, Delete',
        cancelButtonText: 'Cancel',
        background: '#ffffff',
        color: '#1f2937',
      });

      if (result.isConfirmed) {
        onDeleteDocument(docId);
        
        await Swal.fire({
          title: 'Deleted!',
          text: 'Document has been removed from Knowledge Base.',
          icon: 'success',
          timer: 1500,
          showConfirmButton: false,
          background: '#ffffff',
          color: '#1f2937',
        });
      }
    } catch (error) {
      console.error('Delete document error:', error);
      onDeleteDocument(docId);
    }
  };

  // If collapsed, show minimal sidebar
  if (isCollapsed) {
    return (
      <aside className="w-14 border-r border-border bg-sidebar flex flex-col h-full items-center py-4">
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onToggleCollapse}
                className="h-10 w-10 mb-4"
              >
                <PanelLeft className="w-5 h-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Expand sidebar</TooltipContent>
          </Tooltip>
          
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
            <BookOpen className="w-5 h-5 text-primary" />
          </div>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={onNewChat} className="h-9 w-9 mb-2">
                <Plus className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">New Chat</TooltipContent>
          </Tooltip>
          
          <div className="flex-1" />
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={handleLogout} className="h-9 w-9">
                <LogOut className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Logout</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </aside>
    );
  }

  return (
    <aside className="w-72 border-r border-border bg-sidebar flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-sidebar-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="font-semibold text-lg text-sidebar-foreground">ज्ञानकोष 2.0</h1>
              <p className="text-[10px] text-muted-foreground/60">Treasury of Knowledge</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {onToggleCollapse && (
              <Button variant="ghost" size="icon" onClick={onToggleCollapse} className="h-8 w-8">
                <PanelLeftClose className="w-4 h-4" />
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={handleLogout} className="h-8 w-8">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Knowledge Base Toggle */}
      <Collapsible open={knowledgeBaseOpen} onOpenChange={setKnowledgeBaseOpen}>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="w-full justify-between px-4 py-3 h-auto rounded-none border-b border-sidebar-border"
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              <BookOpen className="w-4 h-4" />
              Knowledge Base ({documents.length})
            </span>
            {knowledgeBaseOpen ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="max-h-64 overflow-y-auto bg-muted/30">
            {/* Search and Compare */}
            <div className="p-2 space-y-2 border-b border-border/50">
              <DocumentSearch
                value={docSearchQuery}
                onChange={setDocSearchQuery}
                placeholder="Search documents..."
              />
              {documents.length >= 2 && onCompareDocuments && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onCompareDocuments}
                  className="w-full gap-2 h-7 text-xs"
                >
                  <GitCompare className="w-3 h-3" />
                  Compare Documents
                </Button>
              )}
            </div>
            
            {filteredDocuments.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                {docSearchQuery ? 'No matching documents' : 'No documents uploaded yet'}
              </p>
            ) : (
              <div className="p-2 space-y-1">
                {filteredDocuments.map((doc) => (
                  <div
                    key={doc.id}
                    className="group flex items-start gap-2 p-2 rounded-md hover:bg-sidebar-accent text-sm cursor-pointer"
                    onClick={() => setViewDocument(doc)}
                  >
                    <span className="mt-0.5">{getFileIcon(doc.file_type)}</span>
                    <div className="flex-1 min-w-0">
                      <span className="truncate text-sidebar-foreground block">
                        {docSearchQuery ? highlightText(doc.alias, docSearchQuery) : doc.alias}
                      </span>
                      <span className="text-[10px] text-muted-foreground/60">
                        {format(new Date(doc.created_at), 'MMM d, yyyy')} • {doc.file_size ? formatFileSize(doc.file_size) : 'N/A'}
                      </span>
                      {/* Show matching summary context when searching */}
                      {docSearchQuery && doc.summary?.toLowerCase().includes(docSearchQuery.toLowerCase()) && (
                        <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2">
                          {highlightText(getMatchContext(doc.summary, docSearchQuery, 40), docSearchQuery)}
                        </p>
                      )}
                      {/* Show tags */}
                      {doc.tags && doc.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {doc.tags.slice(0, 2).map((tag) => (
                            <Badge key={tag} variant="secondary" className="text-[8px] h-3 px-1">
                              {tag}
                            </Badge>
                          ))}
                          {doc.tags.length > 2 && (
                            <Badge variant="outline" className="text-[8px] h-3 px-1">
                              +{doc.tags.length - 2}
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShareDocument(doc);
                        }}
                      >
                        <Share2 className="w-3 h-3 text-muted-foreground hover:text-primary" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100"
                        onClick={(e) => handleDeleteDocument(e, doc.id, doc.alias)}
                      >
                        <Trash2 className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* New Chat Button + Chat Search */}
      <div className="p-3 space-y-2">
        <Button onClick={onNewChat} className="w-full gap-2" variant="outline">
          <Plus className="w-4 h-4" />
          New Chat
        </Button>
        {sessions.length > 3 && (
          <DocumentSearch
            value={chatSearchQuery}
            onChange={setChatSearchQuery}
            placeholder="Search chats..."
          />
        )}
      </div>

      {/* Chat Sessions List */}
      <ScrollArea className="flex-1">
        <div className="px-3 pb-3 space-y-1">
        {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredSessions.length === 0 ? (
            <div className="text-center py-8 px-4">
              <MessageSquare className="w-8 h-8 mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">
                {chatSearchQuery ? 'No matching chats' : 'No chats yet'}
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                {chatSearchQuery ? 'Try a different search term' : 'Start a new conversation'}
              </p>
            </div>
          ) : (
            <TooltipProvider delayDuration={300}>
              {filteredSessions.map((session) => {
                const isVideo = isVideoSession(session.title);
                const thumbnail = videoThumbnails[session.id] || thumbnailCache[session.id];
                
                return (
                <Tooltip key={session.id}>
                  <TooltipTrigger asChild>
                    <div
                      className={`
                        group relative rounded-lg p-3 cursor-pointer transition-all
                        ${currentSessionId === session.id
                          ? 'bg-primary/10 border border-primary/20'
                          : 'hover:bg-sidebar-accent border border-transparent'
                        }
                      `}
                      onClick={() => onSelectSession(session.id)}
                    >
                      <div className="flex items-start gap-3">
                        {/* Video thumbnail or icon */}
                        {isVideo && thumbnail ? (
                          <div className="w-12 h-8 rounded overflow-hidden flex-shrink-0 bg-muted">
                            <img 
                              src={thumbnail} 
                              alt="Video thumbnail" 
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                          </div>
                        ) : isVideo ? (
                          <div className="w-8 h-8 rounded bg-red-500/10 flex items-center justify-center flex-shrink-0">
                            <Video className="w-4 h-4 text-red-500" />
                          </div>
                        ) : (
                          <MessageSquare className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1 min-w-0">
                          <span className="text-sm text-sidebar-foreground truncate block">
                            {chatSearchQuery ? highlightText(session.title, chatSearchQuery) : session.title}
                          </span>
                          {currentSessionId === session.id && (
                            <span className="text-[10px] text-muted-foreground/60">
                              {format(new Date(session.created_at), 'MMM d, yyyy • h:mm a')}
                            </span>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute top-2 right-2 opacity-100 h-6 w-6"
                        onClick={(e) => handleDeleteChat(e, session.id, session.title)}
                        aria-label={`Delete chat: ${session.title}`}
                      >
                        <Trash2 className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                      </Button>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="text-xs">
                    Started: {format(new Date(session.created_at), 'MMM d, yyyy • h:mm a')}
                  </TooltipContent>
                </Tooltip>
              );
              })}
            </TooltipProvider>
          )}
        </div>
      </ScrollArea>

      {/* Footer with session info */}
      <div className="p-3 border-t border-sidebar-border space-y-2">
        {/* Session Timer and User Name */}
        {loginTime && (
          <SessionTimer 
            loginTime={loginTime} 
            userName={userName} 
            userEmail={userEmail} 
          />
        )}
        <p className="text-xs text-muted-foreground text-center">
          Type <span className="font-mono bg-muted px-1 py-0.5 rounded">#</span> to reference documents
        </p>
        <p className="text-[10px] text-muted-foreground/50 text-center">
          Gyankosh 2.0 supports Hindi, English & Hinglish
        </p>
      </div>

      {/* Document Share Modal */}
      {shareDocument && (
        <DocumentShare
          document={shareDocument}
          onClose={() => setShareDocument(null)}
        />
      )}

      {/* Document Viewer Modal */}
      <DocumentViewerModal
        document={viewDocument}
        isOpen={!!viewDocument}
        onClose={() => setViewDocument(null)}
      />
    </aside>
  );
}
