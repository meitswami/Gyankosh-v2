import { useState, useCallback, useRef, useEffect } from 'react';
import { FileSpreadsheet, Send, BarChart2, X, Loader2, FileText, Sparkles, Square, Bell, FolderOpen, Clock, Database, History, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { parseExcelFile, searchInExcel, type ParsedExcel, type CellReference } from '@/lib/excelParser';
import { ExcelViewer } from './ExcelViewer';
import { ExcelCharts } from './ExcelCharts';
import { exportExcelChatToDocx } from '@/lib/docxExport';
import { MarkdownRenderer } from './MarkdownRenderer';
import { Progress } from '@/components/ui/progress';
import { useDocuments, type Document } from '@/hooks/useDocuments';
import { buildExcelAiContext, estimateExcelAnalysisSeconds } from '@/lib/excelAiContext';
import { useExcelChatSession } from '@/hooks/useExcelChatSession';

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/excel-search`;

interface ExcelMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  cellReferences?: CellReference[];
}

interface ExcelSearchPanelProps {
  onClose: () => void;
}

// Request notification permission
const requestNotificationPermission = async () => {
  if ('Notification' in window && Notification.permission === 'default') {
    await Notification.requestPermission();
  }
};

// Send browser notification
const sendNotification = (title: string, body: string) => {
  if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
    new Notification(title, { body, icon: '/favicon.png', tag: 'excel-analysis' });
  }
};

// Parse stored Excel JSON back to ParsedExcel format
const parseStoredExcel = (doc: Document): ParsedExcel | null => {
  try {
    if (!doc.content_text) return null;
    const parsed = JSON.parse(doc.content_text);
    if (parsed.sheets && parsed.searchableContent) {
      return {
        fileName: doc.name,
        sheets: parsed.sheets,
        totalCells: parsed.totalCells || 0,
        searchableContent: parsed.searchableContent,
      };
    }
    return null;
  } catch {
    return null;
  }
};

export function ExcelSearchPanel({ onClose }: ExcelSearchPanelProps) {
  const [excel, setExcel] = useState<ParsedExcel | null>(null);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [localMessages, setLocalMessages] = useState<ExcelMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeVisualization, setActiveVisualization] = useState<{ sheetName: string; columns: number[] } | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [showKnowledgeBase, setShowKnowledgeBase] = useState(true);
  const [estimatedSeconds, setEstimatedSeconds] = useState<number | null>(null);
  const [analysisStage, setAnalysisStage] = useState<'preparing' | 'requesting' | 'streaming'>('preparing');
  const [timeToFirstToken, setTimeToFirstToken] = useState<number | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const currentAssistantIdRef = useRef<string | null>(null);
  const currentResponseRef = useRef<string>('');

  const { toast } = useToast();
  const { documents, uploadDocument, loading: docsLoading } = useDocuments();

  // Chat session persistence
  const {
    messages: dbMessages,
    loading: chatLoading,
    saveUserMessage,
    startAssistantMessage,
    updateAssistantContent,
    finalizeAssistantMessage,
    forceSaveProgress,
    shouldContinue,
    getContinueContext,
    updateSessionTitle,
  } = useExcelChatSession({ documentId: selectedDocId, excel });

  // Merge DB messages with local messages (DB takes priority for loaded sessions)
  const messages: ExcelMessage[] = dbMessages.length > 0
    ? dbMessages.map(m => ({ id: m.id, role: m.role, content: m.content }))
    : localMessages;

  // Filter only Excel documents
  const excelDocuments = documents.filter(doc =>
    doc.file_type?.includes('spreadsheet') ||
    doc.file_type?.includes('excel') ||
    doc.name?.endsWith('.xlsx') ||
    doc.name?.endsWith('.xls')
  );

  // Notification permission check
  useEffect(() => {
    if ('Notification' in window) {
      setNotificationsEnabled(Notification.permission === 'granted');
    }
  }, []);

  // Timer for elapsed time
  useEffect(() => {
    if (isLoading) {
      setElapsedTime(0);
      timerRef.current = setInterval(() => setElapsedTime(prev => prev + 1), 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isLoading]);

  // Auto-save on page unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (isLoading && currentResponseRef.current.length > 10) {
        forceSaveProgress();
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isLoading, forceSaveProgress]);

  const handleEnableNotifications = async () => {
    await requestNotificationPermission();
    setNotificationsEnabled(Notification.permission === 'granted');
    if (Notification.permission === 'granted') {
      toast({ title: 'Notifications enabled', description: "You'll be notified when analysis completes" });
    }
  };

  const handleStopAnalysis = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;

      // Save partial progress
      if (currentAssistantIdRef.current && currentResponseRef.current.length > 10) {
        await forceSaveProgress();
        // Update local state with the stopped message
        setLocalMessages(prev => prev.map(m =>
          m.id === currentAssistantIdRef.current
            ? { ...m, content: currentResponseRef.current + '\n\n⚠️ *Analysis stopped. Say "continue" to resume from here.*' }
            : m
        ));
      }

      setIsLoading(false);
      setAnalysisStage('preparing');
      setEstimatedSeconds(null);
      setTimeToFirstToken(null);
      currentAssistantIdRef.current = null;
      currentResponseRef.current = '';

      toast({ title: 'Analysis stopped & saved', description: 'Progress saved. Say "continue" to resume.' });
    }
  }, [toast, forceSaveProgress]);

  const handleLoadFromKnowledgeBase = useCallback((doc: Document) => {
    const parsed = parseStoredExcel(doc);
    if (parsed) {
      setExcel(parsed);
      setSelectedDocId(doc.id);
      setShowKnowledgeBase(false);
      setLocalMessages([]);

      // Welcome message only if no existing chat
      if (dbMessages.length === 0) {
        setLocalMessages([{
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `📊 **Loaded: ${parsed.fileName}**\n\n${parsed.sheets.length} sheet(s), ${parsed.totalCells.toLocaleString()} cells.\n\n**Sheets:** ${parsed.sheets.map(s => s.name).join(', ')}\n\nAsk me anything! I can analyze data, calculate formulas, and create visualizations.`,
        }]);
      }

      toast({ title: 'Excel loaded', description: `${parsed.sheets.length} sheets ready` });
    } else {
      toast({ title: 'Cannot load Excel', description: 'File may need to be re-uploaded', variant: 'destructive' });
    }
  }, [toast, dbMessages.length]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'];
    const isValid = validTypes.some(t => file.type.includes(t)) || file.name.endsWith('.xlsx') || file.name.endsWith('.xls');

    if (!isValid) {
      toast({ title: 'Invalid file', description: 'Please upload an Excel file (.xlsx or .xls)', variant: 'destructive' });
      return;
    }

    setIsParsing(true);
    try {
      const parsed = await parseExcelFile(file);
      setExcel(parsed);
      setShowKnowledgeBase(false);

      // Save to knowledge base
      setIsSaving(true);
      const contentForStorage = JSON.stringify({
        sheets: parsed.sheets,
        totalCells: parsed.totalCells,
        searchableContent: parsed.searchableContent,
      });

      const sheetSummary = parsed.sheets.map(s => `${s.name} (${s.rowCount}×${s.colCount})`).join(', ');

      const doc = await uploadDocument(file, contentForStorage, {
        documentType: 'Excel Spreadsheet',
        summary: `${parsed.sheets.length} sheets, ${parsed.totalCells.toLocaleString()} cells. Sheets: ${sheetSummary}`,
        alias: file.name.replace(/\.[^/.]+$/, ''),
      });

      if (doc) {
        setSelectedDocId(doc.id);
      }

      setLocalMessages([{
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `📊 **Excel loaded & saved: ${parsed.fileName}**\n\n✅ Saved to Knowledge Base!\n\n**${parsed.sheets.length} sheet(s)**, ${parsed.totalCells.toLocaleString()} cells.\n\n**Sheets:** ${parsed.sheets.map(s => `${s.name} (${s.rowCount}×${s.colCount})`).join(', ')}\n\nAsk me anything! Your chat will be saved automatically.`,
      }]);

      toast({ title: 'Excel loaded & saved!', description: `${parsed.sheets.length} sheets saved to Knowledge Base` });
    } catch (error) {
      console.error('Excel parse error:', error);
      toast({ title: 'Failed to parse Excel', description: 'Could not read the file.', variant: 'destructive' });
    } finally {
      setIsParsing(false);
      setIsSaving(false);
    }
  }, [toast, uploadDocument]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || !excel || isLoading) return;

    const userQuery = input.trim();
    abortControllerRef.current = new AbortController();
    setAnalysisStage('preparing');
    setTimeToFirstToken(null);

    // Check for "continue" intent
    const wantsContinue = shouldContinue(userQuery);
    const previousContext = wantsContinue ? getContinueContext() : null;

    // Check for local search matches
    const searchResults = searchInExcel(excel, userQuery);

    // Save user message
    const savedUserMsg = await saveUserMessage(userQuery);
    if (!savedUserMsg) {
      // Fallback to local state
      setLocalMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'user', content: userQuery }]);
    }

    setInput('');
    setIsLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const vizKeywords = ['chart', 'graph', 'visualize', 'plot', 'diagram', 'bar', 'line', 'pie'];
      const wantsViz = vizKeywords.some(kw => userQuery.toLowerCase().includes(kw));

      // Build query with continue context if needed
      let finalQuery = userQuery;
      if (wantsContinue && previousContext) {
        finalQuery = `The user wants to continue from where the previous analysis left off. Here's the last part of the previous response:\n\n---\n${previousContext}\n---\n\nPlease continue the analysis from this point. The user said: "${userQuery}"`;
      }

      const excelContext = buildExcelAiContext({ excel, query: finalQuery, searchResults });
      const eta = estimateExcelAnalysisSeconds({ contextChars: excelContext.length, sheetCount: excel.sheets.length });
      setEstimatedSeconds(eta);
      setAnalysisStage('requesting');

      // Start assistant message in DB
      const assistantMsgId = await startAssistantMessage();
      const localAssistantId = assistantMsgId || crypto.randomUUID();
      currentAssistantIdRef.current = localAssistantId;
      currentResponseRef.current = '';

      // Add to local state
      setLocalMessages(prev => [...prev, { id: localAssistantId, role: 'assistant', content: '', cellReferences: searchResults.slice(0, 10) }]);

      const requestStart = performance.now();

      const response = await fetch(CHAT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          query: finalQuery,
          excelContent: excelContext,
          excelMeta: {
            fileName: excel.fileName,
            sheets: excel.sheets.map(s => ({ name: s.name, index: s.index, headers: s.headers, rowCount: s.rowCount })),
          },
          searchResults: searchResults.slice(0, 20),
          wantsVisualization: wantsViz,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to get response');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let fullResponse = '';
      let buffer = '';
      let sawDone = false;
      let firstTokenSeen = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n');
        buffer = parts.pop() ?? '';

        for (const raw of parts) {
          const line = raw.trim();
          if (!line) continue;
          if (line === 'data: [DONE]') { sawDone = true; break; }
          if (!line.startsWith('data: ')) continue;

          try {
            const data = JSON.parse(line.slice(6));
            if (data.choices?.[0]?.finish_reason) sawDone = true;

            const content = data.choices?.[0]?.delta?.content;
            if (content) {
              if (!firstTokenSeen) {
                firstTokenSeen = true;
                setAnalysisStage('streaming');
                setTimeToFirstToken(Math.round((performance.now() - requestStart) / 100) / 10);
              }

              fullResponse += content;
              currentResponseRef.current = fullResponse;

              // Update local state
              setLocalMessages(prev => prev.map(m => m.id === localAssistantId ? { ...m, content: fullResponse } : m));

              // Update DB (will be batched by the hook)
              if (assistantMsgId) {
                updateAssistantContent(assistantMsgId, fullResponse);
              }
            }
          } catch { /* ignore malformed */ }

          if (sawDone) break;
        }

        if (sawDone) {
          try { await reader.cancel(); } catch { /* ignore */ }
          break;
        }
      }

      // Finalize in DB
      if (assistantMsgId) {
        await finalizeAssistantMessage(assistantMsgId, fullResponse);
      }

      // Update session title on first real exchange
      if (messages.length <= 2) {
        updateSessionTitle(`Excel: ${excel.fileName} - ${userQuery.slice(0, 30)}...`);
      }

      // Visualization
      if (wantsViz && excel.sheets.length > 0) {
        const firstSheet = excel.sheets[0];
        const numericCols = firstSheet.headers.map((_, idx) => idx).filter(idx => {
          const vals = firstSheet.data.slice(1, 10).map(row => row?.[idx]);
          return vals.some(v => typeof v === 'number');
        });
        if (numericCols.length > 0) {
          setActiveVisualization({ sheetName: firstSheet.name, columns: numericCols.slice(0, 3) });
        }
      }

      sendNotification('Analysis Complete', 'Your Excel analysis is ready!');
      currentAssistantIdRef.current = null;
      currentResponseRef.current = '';

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;

      console.error('Excel search error:', error);
      setLocalMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `❌ Error: ${error instanceof Error ? error.message : 'Failed to process your question'}`,
      }]);
      sendNotification('Analysis Error', 'There was an error processing your Excel query');
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
      setAnalysisStage('preparing');
    }
  }, [input, excel, isLoading, shouldContinue, getContinueContext, saveUserMessage, startAssistantMessage, updateAssistantContent, finalizeAssistantMessage, updateSessionTitle, messages.length]);

  const handleExportDocx = useCallback(async () => {
    if (!excel || messages.length < 2) return;
    try {
      await exportExcelChatToDocx(messages.map(m => ({ role: m.role, content: m.content })), excel.fileName, `${excel.fileName.replace(/\.[^/.]+$/, '')}-analysis`);
      toast({ title: 'Exported!', description: 'Your analysis has been downloaded as DOCX' });
    } catch (error) {
      console.error('Export error:', error);
      toast({ title: 'Export failed', description: 'Could not generate DOCX file', variant: 'destructive' });
    }
  }, [excel, messages, toast]);

  const handleVisualizationRequest = useCallback((sheetName: string, columns: number[]) => {
    setActiveVisualization({ sheetName, columns });
  }, []);

  const handleBackToKnowledgeBase = useCallback(() => {
    setExcel(null);
    setSelectedDocId(null);
    setLocalMessages([]);
    setShowKnowledgeBase(true);
    setActiveVisualization(null);
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col">
      {/* Header */}
      <header className="border-b border-border px-6 py-4 flex items-center justify-between bg-card">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
            <FileSpreadsheet className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h1 className="font-semibold text-lg">Excel Search</h1>
            <p className="text-xs text-muted-foreground">
              {excel ? `${excel.fileName} • ${excel.sheets.length} sheets` : 'Upload or select from Knowledge Base'}
              {chatLoading && ' • Loading chat...'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {excel && (
            <Button variant="outline" size="sm" onClick={handleBackToKnowledgeBase} className="gap-1.5">
              <Database className="w-4 h-4" />
              Knowledge Base
            </Button>
          )}
          {excel && (
            <Button
              variant={notificationsEnabled ? "secondary" : "outline"}
              size="sm"
              onClick={handleEnableNotifications}
              className="gap-1.5"
              title={notificationsEnabled ? "Notifications enabled" : "Enable notifications"}
            >
              <Bell className={`w-4 h-4 ${notificationsEnabled ? 'text-green-600' : ''}`} />
              {notificationsEnabled ? 'Notifying' : 'Notify me'}
            </Button>
          )}
          {excel && messages.length > 1 && (
            <Button variant="outline" size="sm" onClick={handleExportDocx} className="gap-1.5">
              <FileText className="w-4 h-4" />
              Export
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col">
          <ScrollArea className="flex-1 p-6">
            <div className="max-w-3xl mx-auto space-y-6">
              {!excel && showKnowledgeBase ? (
                <div className="space-y-6">
                  {/* Upload new file card */}
                  <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-8">
                      <FileSpreadsheet className="w-12 h-12 text-muted-foreground/50 mb-3" />
                      <h3 className="text-lg font-medium mb-2">Upload New Excel File</h3>
                      <p className="text-sm text-muted-foreground mb-4 text-center max-w-md">
                        Upload a new Excel file. It will be saved to your Knowledge Base with chat history.
                      </p>
                      <input
                        id="excel-file-input"
                        type="file"
                        accept=".xlsx,.xls"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                      <Button disabled={isParsing || isSaving} className="gap-2" onClick={() => document.getElementById('excel-file-input')?.click()}>
                        {isParsing || isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
                        {isParsing ? 'Parsing...' : isSaving ? 'Saving...' : 'Choose Excel File'}
                      </Button>
                    </CardContent>
                  </Card>

                  {/* Previously uploaded Excel files */}
                  {excelDocuments.length > 0 && (
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Database className="w-4 h-4" />
                          Your Excel Files
                          <Badge variant="secondary" className="ml-auto">{excelDocuments.length}</Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {docsLoading ? (
                          <div className="flex items-center justify-center py-4">
                            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                          </div>
                        ) : (
                          excelDocuments.map((doc) => (
                            <button
                              key={doc.id}
                              onClick={() => handleLoadFromKnowledgeBase(doc)}
                              className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors text-left"
                            >
                              <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center flex-shrink-0">
                                <FileSpreadsheet className="w-5 h-5 text-green-600" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm truncate">{doc.alias || doc.name}</p>
                                <p className="text-xs text-muted-foreground truncate">{doc.summary || doc.name}</p>
                              </div>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <MessageSquare className="w-3 h-3" />
                                <Clock className="w-3 h-3" />
                                {new Date(doc.created_at).toLocaleDateString()}
                              </div>
                            </button>
                          ))
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {!docsLoading && excelDocuments.length === 0 && (
                    <Card className="bg-muted/30">
                      <CardContent className="flex flex-col items-center justify-center py-8">
                        <FolderOpen className="w-10 h-10 text-muted-foreground/50 mb-3" />
                        <p className="text-sm text-muted-foreground text-center">
                          No Excel files in your Knowledge Base yet.<br />Upload one above to get started!
                        </p>
                      </CardContent>
                    </Card>
                  )}
                </div>
              ) : excel ? (
                <>
                  <ExcelViewer excel={excel} onRequestVisualization={handleVisualizationRequest} />

                  {/* Messages */}
                  {messages.map((msg) => (
                    <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${msg.role === 'user' ? 'bg-primary text-primary-foreground rounded-br-md' : 'bg-muted rounded-bl-md'}`}>
                        {msg.role === 'assistant' ? <MarkdownRenderer content={msg.content} /> : <p className="text-sm">{msg.content}</p>}
                        {msg.cellReferences && msg.cellReferences.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-border/50">
                            <p className="text-xs text-muted-foreground mb-1">📍 Found in:</p>
                            <div className="flex flex-wrap gap-1">
                              {msg.cellReferences.slice(0, 6).map((ref, idx) => (
                                <Badge key={idx} variant="secondary" className="text-[10px]">{ref.sheet}!{ref.cell}</Badge>
                              ))}
                              {msg.cellReferences.length > 6 && <Badge variant="outline" className="text-[10px]">+{msg.cellReferences.length - 6} more</Badge>}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}

                  {isLoading && (
                    <div className="flex justify-start">
                      <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3 min-w-[300px]">
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin text-primary" />
                            <div>
                              <span className="text-sm font-medium">
                                {analysisStage === 'requesting' ? 'Contacting AI…' : 'Analyzing…'}
                              </span>
                              <p className="text-xs text-muted-foreground">
                                {elapsedTime}s elapsed
                                {estimatedSeconds != null && <> • ETA ~{Math.max(0, estimatedSeconds - elapsedTime)}s</>}
                                {timeToFirstToken != null && <> • First token: {timeToFirstToken}s</>}
                              </p>
                              {estimatedSeconds != null && elapsedTime > estimatedSeconds * 2 && (
                                <p className="text-xs text-muted-foreground mt-1">Still running — progress is auto-saved.</p>
                              )}
                            </div>
                          </div>
                          <Button variant="destructive" size="sm" onClick={handleStopAnalysis} className="gap-1 h-7 px-2">
                            <Square className="w-3 h-3 fill-current" />
                            Stop
                          </Button>
                        </div>
                        <Progress value={estimatedSeconds != null ? Math.min((elapsedTime / Math.max(1, estimatedSeconds)) * 100, 95) : Math.min(elapsedTime * 3.3, 95)} className="mt-2 h-1" />
                      </div>
                    </div>
                  )}
                </>
              ) : null}
            </div>
          </ScrollArea>

          {/* Input */}
          {excel && (
            <div className="border-t border-border p-4 bg-card">
              <div className="max-w-3xl mx-auto flex gap-2">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                  placeholder="Ask about your Excel data... or say 'continue' to resume"
                  disabled={isLoading}
                  className="flex-1"
                />
                {isLoading ? (
                  <Button onClick={handleStopAnalysis} variant="destructive" className="gap-1.5">
                    <Square className="w-4 h-4 fill-current" />
                    Stop
                  </Button>
                ) : (
                  <Button onClick={handleSend} disabled={!input.trim()} className="gap-1.5">
                    <Send className="w-4 h-4" />
                    Ask
                  </Button>
                )}
              </div>
              <div className="max-w-3xl mx-auto mt-2 flex flex-wrap gap-2">
                <Badge variant="outline" className="text-xs cursor-pointer hover:bg-muted" onClick={() => setInput('Give me a complete summary of this data')}>
                  <Sparkles className="w-3 h-3 mr-1" />
                  Full summary
                </Badge>
                <Badge variant="outline" className="text-xs cursor-pointer hover:bg-muted" onClick={() => setInput('Show me a chart of the data')}>
                  <BarChart2 className="w-3 h-3 mr-1" />
                  Visualize
                </Badge>
                <Badge variant="outline" className="text-xs cursor-pointer hover:bg-muted" onClick={() => setInput('continue')}>
                  <History className="w-3 h-3 mr-1" />
                  Continue
                </Badge>
              </div>
            </div>
          )}
        </div>

        {/* Visualization Sidebar */}
        {activeVisualization && excel && (
          <div className="w-96 border-l border-border bg-card p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium flex items-center gap-2">
                <BarChart2 className="w-4 h-4" />
                Visualization
              </h3>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setActiveVisualization(null)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <ExcelCharts excel={excel} sheetName={activeVisualization.sheetName} valueColumns={activeVisualization.columns} />
          </div>
        )}
      </div>
    </div>
  );
}
