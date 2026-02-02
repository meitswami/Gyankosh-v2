import { useState, useCallback, useEffect, useRef, startTransition } from 'react';
import { Eye, LogOut, FileSpreadsheet, Bell, Upload, Settings, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useDocuments, type Document } from '@/hooks/useDocuments';
import { useChat } from '@/hooks/useChat';
import { useChatSessions } from '@/hooks/useChatSessions';
import { useAuth } from '@/hooks/useAuth';
import { useViewNotifications } from '@/hooks/useViewNotifications';
import { useBatchUpload } from '@/hooks/useBatchUpload';
import { useUserPresence } from '@/hooks/useUserPresence';
import { useApiIntegrations } from '@/hooks/useApiIntegrations';
import { useWebSearch } from '@/hooks/useWebSearch';
import { extractTextFromFile } from '@/lib/documentParser';
import { ChatSidebar } from '@/components/ChatSidebar';
import { ChatArea } from '@/components/ChatArea';
import { ChatInput } from '@/components/ChatInput';
import { ThemeToggle } from '@/components/ThemeToggle';
import { DocumentPreview } from '@/components/DocumentPreview';
import { UploadProgress, type UploadStage } from '@/components/UploadProgress';
import { BatchUploadProgress } from '@/components/BatchUploadProgress';
import { DocumentComparison } from '@/components/DocumentComparison';
import { ChatExport } from '@/components/ChatExport';
import { KeyboardShortcuts } from '@/components/KeyboardShortcuts';
import { ExcelSearchPanel } from '@/components/ExcelSearchPanel';
import { ChatWidget } from '@/components/ChatWidget';
import { UserSettingsModal } from '@/components/UserSettingsModal';
import { GroupChatPanel } from '@/components/GroupChatPanel';
import { OnboardingTour, useOnboardingTour } from '@/components/OnboardingTour';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';

const PARSE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-document`;
const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-with-document`;
const EMBEDDING_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-embedding`;
const SEMANTIC_SEARCH_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-embedding`;
const WEB_SEARCH_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/web-search`;

const Index = () => {
  const { isLoggedIn, loading: authLoading, logout, user } = useAuth();
  const { toast } = useToast();
  const { documents, loading: docsLoading, uploadDocument, deleteDocument, refetch } = useDocuments();
  const { messages, isLoading, sendMessage, clearMessages, setMessages } = useChat();
  const {
    sessions,
    currentSessionId,
    setCurrentSessionId,
    loading: sessionsLoading,
    createSession,
    updateSessionTitle,
    deleteSession,
    generateTitle,
  } = useChatSessions();

  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStage, setUploadStage] = useState<UploadStage>('uploading');
  const [uploadFileName, setUploadFileName] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  const [showExcelSearch, setShowExcelSearch] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [showBatchProgress, setShowBatchProgress] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showGroupChat, setShowGroupChat] = useState(false);
  const [activeMentions, setActiveMentions] = useState<{ type: string; id: string; label: string }[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);

  // User presence and friends
  const { friends, currentUser } = useUserPresence();

  // API integrations
  const { integrations, callApi } = useApiIntegrations(user?.id || null);

  // Web search
  const { search: webSearch, isSearching } = useWebSearch();

  // Onboarding tour
  const { showTour, completeTour } = useOnboardingTour();

  // Batch upload hook
  const { uploads, isUploading: isBatchUploading, uploadFiles, clearCompleted, cancelUpload } = useBatchUpload({
    maxConcurrent: 3,
    onComplete: () => refetch(),
  });

  // Realtime view notifications
  const { notifications } = useViewNotifications(user?.id);

  // Refs for keyboard shortcuts
  const speechButtonRef = useRef<HTMLButtonElement>(null);
  const exportButtonRef = useRef<HTMLButtonElement>(null);
  const loadingSessionRef = useRef<string | null>(null);

  // Load messages when session changes
  useEffect(() => {
    // Clear loading ref if session is cleared
    if (!currentSessionId) {
      loadingSessionRef.current = null;
      setIsLoadingMessages(false);
      clearMessages();
      return;
    }

    // Prevent loading if already loading this session
    if (loadingSessionRef.current === currentSessionId) {
      return;
    }

    // Mark this session as loading
    loadingSessionRef.current = currentSessionId;
    setIsLoadingMessages(true);

    const loadMessages = async () => {
      // Double-check we're still loading the correct session
      if (loadingSessionRef.current !== currentSessionId) {
        // Clear loading state if we're no longer loading this session
        setIsLoadingMessages(false);
        return;
      }

      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('session_id', currentSessionId)
        .order('created_at', { ascending: true });

      // Check again after async operation to prevent race conditions
      if (loadingSessionRef.current !== currentSessionId) {
        // Clear loading state if we're no longer loading this session
        setIsLoadingMessages(false);
        return;
      }

      // Always clear loading state synchronously, regardless of result
      setIsLoadingMessages(false);
      loadingSessionRef.current = null;

      if (error) {
        console.error('Error loading messages:', error);
        setMessages([]);
        return;
      }

      // Update messages in a single batch to prevent flickering
      const newMessages = data ? data.map(msg => ({
        id: msg.id,
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
        documentId: msg.document_id || undefined,
        createdAt: new Date(msg.created_at),
      })) : [];

      // Use startTransition only for messages update to reduce flicker
      // Loading state is already cleared synchronously above
      startTransition(() => {
        setMessages(newMessages);
      });
    };

    loadMessages();
  }, [currentSessionId, clearMessages, setMessages]);

  const handleFileUpload = useCallback(async (file: File) => {
    setIsUploading(true);
    setUploadFileName(file.name);
    setUploadStage('uploading');
    const startTime = Date.now();

    try {
      let contentText = '';

      // Stage 1: Uploading / Initial check
      const clientText = await extractTextFromFile(file);

      // Stage 2: Extracting text
      setUploadStage('extracting');

      if (clientText === 'REQUIRES_SERVER_PARSING') {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;

        if (!token) {
          throw new Error('Not authenticated. Please log in.');
        }

        const formData = new FormData();
        formData.append('file', file);

        const parseResponse = await fetch(PARSE_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        });

        const parseResult = await parseResponse.json();

        if (!parseResult.success) {
          throw new Error(parseResult.error || 'Failed to parse document');
        }

        contentText = parseResult.content;
      } else {
        contentText = clientText;
      }

      if (!contentText || contentText.length < 20) {
        throw new Error('Could not extract meaningful text from the document');
      }

      // Stage 3: AI Analysis
      setUploadStage('analyzing');

      // Get fresh token for chat call
      const { data: { session: chatSession } } = await supabase.auth.getSession();
      const chatToken = chatSession?.access_token;

      if (!chatToken) {
        throw new Error('Not authenticated. Please log in.');
      }

      const response = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${chatToken}`,
        },
        body: JSON.stringify({
          documentContent: contentText.slice(0, 10000),
          action: 'summarize',
        }),
      });

      if (!response.ok) throw new Error('Failed to analyze document');

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response');

      const decoder = new TextDecoder();
      let fullResponse = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ') && line !== 'data: [DONE]') {
            try {
              const data = JSON.parse(line.slice(6));
              const content = data.choices?.[0]?.delta?.content;
              if (content) fullResponse += content;
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }

      let summary;
      try {
        // Try to find and parse JSON in the response
        const jsonMatch = fullResponse.match(/\{[\s\S]*?\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          summary = {
            documentType: parsed.documentType || 'Document',
            summary: parsed.summary || fullResponse.slice(0, 200).replace(/```json|```/g, '').trim(),
            alias: parsed.alias || file.name.replace(/\.[^/.]+$/, '').slice(0, 30),
          };
        } else {
          throw new Error('No JSON found');
        }
      } catch {
        // Fallback: extract text without JSON formatting
        const cleanedResponse = fullResponse
          .replace(/```json|```/g, '')
          .replace(/\{[\s\S]*?\}/g, '')
          .trim();
        summary = {
          documentType: 'Document',
          summary: cleanedResponse.slice(0, 200) || 'Document uploaded successfully',
          alias: file.name.replace(/\.[^/.]+$/, '').slice(0, 30),
        };
      }

      // Validate summary fields aren't JSON-like strings
      if (summary.summary.startsWith('```') || summary.summary.startsWith('{')) {
        summary.summary = 'Document ready for queries';
      }

      const savedDoc = await uploadDocument(file, contentText, summary);

      if (savedDoc) {
        setUploadStage('complete');
        setSelectedDocument(savedDoc);
        const processingTime = ((Date.now() - startTime) / 1000).toFixed(1);

        // Generate embeddings and tags in background
        (async () => {
          try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;
            if (token) {
              const embedResponse = await fetch(EMBEDDING_URL, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                  action: 'embed_document',
                  documentId: savedDoc.id,
                }),
              });

              if (embedResponse.ok) {
                const embedResult = await embedResponse.json();
                console.log('Document embedded with tags:', embedResult.tags);
                // Refetch to get updated tags
                await refetch();
              }
            }
          } catch (err) {
            console.error('Background embedding failed:', err);
          }
        })();

        // Brief delay to show complete state
        setTimeout(() => {
          setIsUploading(false);
          toast({
            title: '✅ Document Added!',
            description: `"${summary.alias}" processed in ${processingTime}s`,
          });
        }, 500);
      } else {
        setIsUploading(false);
      }
    } catch (error) {
      console.error('Upload error:', error);
      setIsUploading(false);
      toast({
        title: 'Upload Failed',
        description: error instanceof Error ? error.message : 'Could not process document',
        variant: 'destructive',
      });
    }
  }, [toast, uploadDocument]);

  const handleSendMessage = useCallback(async (message: string, mentions?: { type: string; id: string; label: string }[]) => {
    // Check for web search mentions first
    const searchMention = mentions?.find(m => m.type === 'search');
    if (searchMention) {
      // Handle web search
      let sessionId = currentSessionId;
      if (!sessionId) {
        const newSession = await createSession(`🌐 ${searchMention.label}: ${generateTitle(message)}`);
        if (!newSession) return;
        sessionId = newSession.id;
      }

      // Save user message
      await supabase.from('chat_messages').insert({
        session_id: sessionId,
        role: 'user',
        content: `!${searchMention.label} ${message}`,
        document_id: null,
      });

      // Add user message to UI
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'user' as const,
        content: `🌐 Searching ${searchMention.label}: ${message}`,
        createdAt: new Date(),
      }]);

      // Perform web search
      try {
        const engine = searchMention.id === 'bing' ? 'bing' : 'google';
        let searchResult = '';

        await webSearch(message, engine as 'google' | 'bing', (chunk) => {
          searchResult += chunk;
          // Update message in real-time
          setMessages(prev => {
            const last = prev[prev.length - 1];
            if (last?.role === 'assistant') {
              return [...prev.slice(0, -1), { ...last, content: searchResult }];
            }
            return [...prev, {
              id: crypto.randomUUID(),
              role: 'assistant' as const,
              content: searchResult,
              createdAt: new Date(),
            }];
          });
        });

        // Save final response
        await supabase.from('chat_messages').insert({
          session_id: sessionId,
          role: 'assistant',
          content: searchResult,
          document_id: null,
        });
      } catch (error) {
        toast({
          title: 'Search Failed',
          description: error instanceof Error ? error.message : 'Could not perform web search',
          variant: 'destructive',
        });
      }
      return;
    }

    // Check for API mentions
    const apiMention = mentions?.find(m => m.type === 'api');
    if (apiMention) {
      toast({
        title: 'API Integration',
        description: `Querying ${apiMention.label}...`,
      });
      // API call would be handled here with callApi
    }

    // Allow global search when no document is selected (searches all documents)
    const isGlobalSearch = !selectedDocument;

    let sessionId = currentSessionId;

    // Create new session if needed
    if (!sessionId) {
      const title = isGlobalSearch
        ? `🔍 ${generateTitle(message)}`
        : generateTitle(message);
      const newSession = await createSession(title);
      if (!newSession) return;
      sessionId = newSession.id;
    } else if (messages.length === 0) {
      // Update title with first message
      const title = isGlobalSearch
        ? `🔍 ${generateTitle(message)}`
        : generateTitle(message);
      await updateSessionTitle(sessionId, title);
    }

    // Save user message to DB
    await supabase.from('chat_messages').insert({
      session_id: sessionId,
      role: 'user',
      content: message,
      document_id: selectedDocument?.id || null,
    });

    // For global search, use semantic search for faster results
    let response: string | null;
    if (isGlobalSearch && documents.length > 0) {
      // Try semantic search first for faster results
      let relevantDocs = '';
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;

        if (token) {
          const searchResponse = await fetch(SEMANTIC_SEARCH_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              action: 'search',
              query: message,
            }),
          });

          if (searchResponse.ok) {
            const { results } = await searchResponse.json();
            if (results && results.length > 0) {
              // Use semantically similar documents
              relevantDocs = results
                .map((doc: { alias: string; content_text: string; similarity: number }) =>
                  `--- Document: ${doc.alias} (relevance: ${(doc.similarity * 100).toFixed(0)}%) ---\n${doc.content_text?.slice(0, 4000) || ''}`
                )
                .join('\n\n');
              console.log(`Semantic search found ${results.length} relevant documents`);
            }
          }
        }
      } catch (err) {
        console.error('Semantic search failed, falling back to full search:', err);
      }

      // Fallback to combining all docs if semantic search didn't work
      if (!relevantDocs) {
        relevantDocs = documents
          .filter(doc => doc.content_text)
          .map(doc => `--- Document: ${doc.alias} ---\n${doc.content_text?.slice(0, 3000) || ''}`)
          .join('\n\n');
      }

      response = await sendMessage(message, {
        id: 'global',
        name: 'All Documents',
        alias: 'Knowledge Base',
        content_text: relevantDocs,
        file_path: '',
        file_type: '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user_id: null,
        tags: null,
        category: null,
      } as Document);
    } else if (selectedDocument) {
      response = await sendMessage(message, selectedDocument);
    } else {
      // No documents - allow general chat without document context
      response = await sendMessage(message, null);
    }

    // Save assistant response to DB
    if (response) {
      await supabase.from('chat_messages').insert({
        session_id: sessionId,
        role: 'assistant',
        content: response,
        document_id: selectedDocument?.id || null,
      });
    }
  }, [selectedDocument, documents, sendMessage, toast, currentSessionId, createSession, updateSessionTitle, generateTitle, messages.length]);

  const handleGenerateFaq = useCallback(async (count: number) => {
    if (!selectedDocument) return;

    let sessionId = currentSessionId;

    // Create new session if needed
    if (!sessionId) {
      const newSession = await createSession(`FAQs: ${selectedDocument.alias}`);
      if (!newSession) return;
      sessionId = newSession.id;
    }

    const userContent = `Generate ${count} FAQs from "${selectedDocument.alias}"`;

    // Save user message to DB
    await supabase.from('chat_messages').insert({
      session_id: sessionId,
      role: 'user',
      content: userContent,
      document_id: selectedDocument.id,
    });

    // Add user message to UI
    setMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      role: 'user' as const,
      content: userContent,
      documentId: selectedDocument.id,
      createdAt: new Date(),
    }]);

    const response = await sendMessage('', selectedDocument, 'generateFaq', count);

    // Save assistant response to DB
    if (response) {
      await supabase.from('chat_messages').insert({
        session_id: sessionId,
        role: 'assistant',
        content: response,
        document_id: selectedDocument.id,
      });

      toast({
        title: 'FAQs Generated',
        description: `Created ${count} FAQs from ${selectedDocument.alias}`,
      });
    }
  }, [selectedDocument, sendMessage, toast, currentSessionId, createSession, setMessages]);

  const handleNewChat = useCallback(() => {
    setCurrentSessionId(null);
    clearMessages();
    setSelectedDocument(null);
  }, [setCurrentSessionId, clearMessages]);

  const handleToolAction = useCallback(async (
    action: 'paraphrase' | 'grammar' | 'translate' | 'email' | 'letter',
    content: string,
    language?: string
  ) => {
    let sessionId = currentSessionId;
    if (!sessionId) {
      const title = `🪄 ${action.charAt(0).toUpperCase() + action.slice(1)}`;
      const newSession = await createSession(title);
      if (!newSession) return;
      sessionId = newSession.id;
    }

    await sendMessage(content, selectedDocument, action, undefined, language);

    toast({
      title: `AI ${action.charAt(0).toUpperCase() + action.slice(1)}`,
      description: 'Request processed successfully',
    });
  }, [currentSessionId, createSession, sendMessage, selectedDocument, toast]);

  const handleSelectSession = useCallback((id: string | null) => {
    setCurrentSessionId(id);
  }, [setCurrentSessionId]);

  if (authLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isLoggedIn) {
    return null;
  }

  return (
    <div className="h-screen flex bg-background">
      {/* Sidebar with Chat History */}
      <ChatSidebar
        sessions={sessions}
        currentSessionId={currentSessionId}
        onSelectSession={handleSelectSession}
        onNewChat={handleNewChat}
        onDeleteSession={deleteSession}
        documents={documents}
        onDeleteDocument={deleteDocument}
        onCompareDocuments={() => setShowComparison(true)}
        loading={sessionsLoading || docsLoading}
      />

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Header */}
        <header className="border-b border-border bg-card/50 px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <h2 className="font-medium text-foreground truncate">
                {selectedDocument
                  ? `Chatting with: ${selectedDocument.alias}`
                  : documents.length > 0
                    ? '🔍 Searching across all documents'
                    : '💬 Ask me anything'
                }
              </h2>
              {selectedDocument?.summary && (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                  {selectedDocument.summary}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 ml-4">
              {messages.length > 0 && (
                <ChatExport
                  messages={messages}
                  sessionId={currentSessionId}
                  sessionTitle={sessions.find(s => s.id === currentSessionId)?.title}
                />
              )}
              {selectedDocument && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowPreview(!showPreview)}
                  className="gap-1.5"
                >
                  <Eye className="w-4 h-4" />
                  <span className="hidden sm:inline">{showPreview ? 'Hide' : 'Preview'}</span>
                </Button>
              )}
              <KeyboardShortcuts
                onNewChat={handleNewChat}
                onToggleSearch={() => setSearchFocused(prev => !prev)}
                onToggleVoice={() => speechButtonRef.current?.click()}
                onTogglePreview={() => selectedDocument && setShowPreview(prev => !prev)}
                onExport={() => exportButtonRef.current?.click()}
                onToggleKnowledgeBase={() => { }}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowExcelSearch(true)}
                className="gap-1.5"
                title="Excel Search - AI-powered Excel analysis"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span className="hidden sm:inline">Excel</span>
              </Button>
              <Button
                variant={showGroupChat ? "default" : "outline"}
                size="sm"
                onClick={() => setShowGroupChat(prev => !prev)}
                className="gap-1.5"
                title="Group Chat - E2E Encrypted"
              >
                <Users className="w-4 h-4" />
                <span className="hidden sm:inline">Groups</span>
              </Button>
              {notifications.length > 0 && (
                <Badge variant="secondary" className="gap-1">
                  <Bell className="w-3 h-3" />
                  {notifications.length}
                </Badge>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowSettings(true)}
                className="text-muted-foreground hover:text-foreground"
                title="Settings"
              >
                <Settings className="w-4 h-4" />
              </Button>
              <ThemeToggle />
              <Button
                variant="ghost"
                size="sm"
                onClick={logout}
                className="gap-1.5 text-muted-foreground hover:text-foreground"
                title={user?.email || 'Logout'}
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Logout</span>
              </Button>
            </div>
          </div>
        </header>

        {/* Chat Messages */}
        <ChatArea
          messages={messages}
          isLoading={isLoading || isLoadingMessages}
          hasDocuments={documents.length > 0}
          onSendMessage={handleSendMessage}
        />

        {/* Input */}
        <ChatInput
          documents={documents}
          selectedDocument={selectedDocument}
          onSelectDocument={setSelectedDocument}
          onSendMessage={handleSendMessage}
          onUploadFile={handleFileUpload}
          onGenerateFaq={handleGenerateFaq}
          onToolAction={handleToolAction}
          isLoading={isLoading || isSearching}
          isUploading={isUploading}
          speechButtonRef={speechButtonRef}
          focusSearch={searchFocused}
          onSearchFocusHandled={() => setSearchFocused(false)}
          friends={friends.map(f => ({
            friend_id: f.user_id,
            display_name: f.display_name || undefined,
            email: undefined
          }))}
          integrations={integrations}
          onMention={(type, id) => {
            console.log(`Mention: ${type} - ${id}`);
          }}
        />
      </main>

      {/* Document Preview Panel */}
      {showPreview && (
        <DocumentPreview
          document={selectedDocument}
          onClose={() => setShowPreview(false)}
        />
      )}

      {/* Upload Progress Overlay */}
      {isUploading && (
        <UploadProgress stage={uploadStage} fileName={uploadFileName} />
      )}

      {/* Document Comparison Modal */}
      {showComparison && (
        <DocumentComparison
          documents={documents}
          onClose={() => setShowComparison(false)}
        />
      )}

      {/* Excel Search Panel */}
      {showExcelSearch && (
        <ExcelSearchPanel onClose={() => setShowExcelSearch(false)} />
      )}

      {/* Batch Upload Progress */}
      {uploads.length > 0 && (
        <BatchUploadProgress
          uploads={uploads}
          onClose={() => setShowBatchProgress(false)}
          onClear={clearCompleted}
          onCancel={cancelUpload}
        />
      )}

      {/* Chat Widget for User-to-User messaging */}
      <ChatWidget documents={documents} />

      {/* Group Chat Panel */}
      {showGroupChat && (
        <GroupChatPanel
          userId={user?.id || null}
          onClose={() => setShowGroupChat(false)}
        />
      )}

      {/* User Settings Modal */}
      <UserSettingsModal
        open={showSettings}
        onOpenChange={setShowSettings}
        userId={user?.id || ''}
        userEmail={user?.email}
        userCreatedAt={user?.created_at}
      />

      {/* Onboarding Tour */}
      {showTour && <OnboardingTour onComplete={completeTour} />}
    </div>
  );
};

export default Index;
