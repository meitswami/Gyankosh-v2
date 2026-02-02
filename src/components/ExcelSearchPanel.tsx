import { useState, useCallback, useRef, useEffect } from 'react';
import { FileSpreadsheet, Send, Download, BarChart2, X, Loader2, FileText, Sparkles, Square, Bell, FolderOpen, Clock, Database } from 'lucide-react';
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

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/excel-search`;

interface ExcelMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  cellReferences?: CellReference[];
  visualization?: {
    sheetName: string;
    columns: number[];
  };
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
    new Notification(title, {
      body,
      icon: '/favicon.png',
      tag: 'excel-analysis',
    });
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
  const [messages, setMessages] = useState<ExcelMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeVisualization, setActiveVisualization] = useState<{
    sheetName: string;
    columns: number[];
  } | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [showKnowledgeBase, setShowKnowledgeBase] = useState(true);
  const [estimatedSeconds, setEstimatedSeconds] = useState<number | null>(null);
  const [analysisStage, setAnalysisStage] = useState<'preparing' | 'requesting' | 'streaming'>('preparing');
  const [timeToFirstToken, setTimeToFirstToken] = useState<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();
  const { documents, uploadDocument, loading: docsLoading } = useDocuments();

  // Filter only Excel documents from knowledge base
  const excelDocuments = documents.filter(doc => 
    doc.file_type?.includes('spreadsheet') || 
    doc.file_type?.includes('excel') ||
    doc.name?.endsWith('.xlsx') ||
    doc.name?.endsWith('.xls')
  );

  // Check notification permission on mount
  useEffect(() => {
    if ('Notification' in window) {
      setNotificationsEnabled(Notification.permission === 'granted');
    }
  }, []);

  // Timer for elapsed time
  useEffect(() => {
    if (isLoading) {
      setElapsedTime(0);
      timerRef.current = setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isLoading]);

  const handleEnableNotifications = async () => {
    await requestNotificationPermission();
    setNotificationsEnabled(Notification.permission === 'granted');
    if (Notification.permission === 'granted') {
      toast({
        title: 'Notifications enabled',
        description: "You'll be notified when analysis completes",
      });
    }
  };

  const handleStopAnalysis = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
      setAnalysisStage('preparing');
      setEstimatedSeconds(null);
      setTimeToFirstToken(null);
      toast({
        title: 'Analysis stopped',
        description: 'The analysis was cancelled',
      });
    }
  }, [toast]);

  // Load Excel from knowledge base
  const handleLoadFromKnowledgeBase = useCallback((doc: Document) => {
    const parsed = parseStoredExcel(doc);
    if (parsed) {
      setExcel(parsed);
      setShowKnowledgeBase(false);
      setMessages([{
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `📊 **Loaded from Knowledge Base: ${parsed.fileName}**\n\nI found **${parsed.sheets.length} sheet(s)** with **${parsed.totalCells.toLocaleString()} cells** total.\n\n**Sheets:**\n${parsed.sheets.map(s => `- ${s.name} (${s.rowCount} rows × ${s.colCount} cols)`).join('\n')}\n\nAsk me anything about this data! I can:\n- Find specific values across all sheets\n- Calculate formulas (SUM, AVG, COUNT, etc.)\n- Create visualizations\n- Export answers to DOCX`,
      }]);
      toast({
        title: 'Excel loaded from Knowledge Base',
        description: `${parsed.sheets.length} sheets ready to analyze`,
      });
    } else {
      toast({
        title: 'Cannot load Excel',
        description: 'This file may need to be re-uploaded',
        variant: 'destructive',
      });
    }
  }, [toast]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      '.xlsx', '.xls'
    ];
    const isValid = validTypes.some(t => file.type.includes(t) || file.name.endsWith('.xlsx') || file.name.endsWith('.xls'));
    
    if (!isValid) {
      toast({
        title: 'Invalid file',
        description: 'Please upload an Excel file (.xlsx or .xls)',
        variant: 'destructive',
      });
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
      
      // Generate summary
      const sheetSummary = parsed.sheets.map(s => `${s.name} (${s.rowCount}×${s.colCount})`).join(', ');
      
      await uploadDocument(file, contentForStorage, {
        documentType: 'Excel Spreadsheet',
        summary: `${parsed.sheets.length} sheets, ${parsed.totalCells.toLocaleString()} cells. Sheets: ${sheetSummary}`,
        alias: file.name.replace(/\.[^/.]+$/, ''),
      });
      
      setMessages([{
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `📊 **Excel loaded & saved: ${parsed.fileName}**\n\n✅ **Saved to Knowledge Base** - You can access this file anytime!\n\nI found **${parsed.sheets.length} sheet(s)** with **${parsed.totalCells.toLocaleString()} cells** total.\n\n**Sheets:**\n${parsed.sheets.map(s => `- ${s.name} (${s.rowCount} rows × ${s.colCount} cols)`).join('\n')}\n\nAsk me anything about this data! I can:\n- Find specific values across all sheets\n- Calculate formulas (SUM, AVG, COUNT, etc.)\n- Create visualizations\n- Export answers to DOCX`,
      }]);
      
      toast({
        title: 'Excel loaded & saved!',
        description: `${parsed.sheets.length} sheets saved to Knowledge Base`,
      });
    } catch (error) {
      console.error('Excel parse error:', error);
      toast({
        title: 'Failed to parse Excel',
        description: 'Could not read the file. Please try a different file.',
        variant: 'destructive',
      });
    } finally {
      setIsParsing(false);
      setIsSaving(false);
    }
  }, [toast, uploadDocument]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || !excel || isLoading) return;

    // Create abort controller for this request
    abortControllerRef.current = new AbortController();

    // Reset per-request UI state
    setAnalysisStage('preparing');
    setTimeToFirstToken(null);

    const userMessage: ExcelMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input,
    };

    // Check for local search matches
    const searchResults = searchInExcel(excel, input);
    if (searchResults.length > 0) {
      userMessage.cellReferences = searchResults.slice(0, 10);
    }

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) {
        throw new Error('Not authenticated');
      }

      // Check for visualization requests
      const vizKeywords = ['chart', 'graph', 'visualize', 'plot', 'diagram', 'bar', 'line', 'pie'];
      const wantsViz = vizKeywords.some(kw => input.toLowerCase().includes(kw));

      // Build a compact context (major speed improvement vs sending the entire workbook)
      const excelContext = buildExcelAiContext({
        excel,
        query: input,
        searchResults,
      });

      const eta = estimateExcelAnalysisSeconds({
        contextChars: excelContext.length,
        sheetCount: excel.sheets.length,
      });
      setEstimatedSeconds(eta);
      setAnalysisStage('requesting');

      const requestStart = performance.now();

      const response = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          query: input,
          excelContent: excelContext,
          excelMeta: {
            fileName: excel.fileName,
            sheets: excel.sheets.map(s => ({
              name: s.name,
              index: s.index,
              headers: s.headers,
              rowCount: s.rowCount,
            })),
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

      // Stream the response
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let fullResponse = '';
      let assistantId = crypto.randomUUID();
      let buffer = '';
      let sawDone = false;
      let firstTokenSeen = false;

      // Add empty assistant message
      setMessages(prev => [...prev, {
        id: assistantId,
        role: 'assistant',
        content: '',
        cellReferences: searchResults.slice(0, 10),
      }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n');
        buffer = parts.pop() ?? '';

        for (const raw of parts) {
          const line = raw.trim();
          if (!line) continue;

          if (line === 'data: [DONE]') {
            sawDone = true;
            break;
          }

          if (!line.startsWith('data: ')) continue;

          try {
            const data = JSON.parse(line.slice(6));

            const finishReason = data.choices?.[0]?.finish_reason;
            if (finishReason) {
              sawDone = true;
            }

            const content = data.choices?.[0]?.delta?.content;
            if (content) {
              if (!firstTokenSeen) {
                firstTokenSeen = true;
                setAnalysisStage('streaming');
                setTimeToFirstToken(Math.round((performance.now() - requestStart) / 100) / 10);
              }

              fullResponse += content;
              setMessages(prev => prev.map(m =>
                m.id === assistantId
                  ? { ...m, content: fullResponse }
                  : m
              ));
            }
          } catch {
            // ignore malformed chunk
          }

          if (sawDone) break;
        }

        if (sawDone) {
          try {
            await reader.cancel();
          } catch {
            // ignore
          }
          break;
        }
      }

      // Check if response suggests visualization
      if (wantsViz && excel.sheets.length > 0) {
        const firstSheet = excel.sheets[0];
        const numericCols = firstSheet.headers
          .map((_, idx) => idx)
          .filter(idx => {
            const vals = firstSheet.data.slice(1, 10).map(row => row?.[idx]);
            return vals.some(v => typeof v === 'number');
          });

        if (numericCols.length > 0) {
          setActiveVisualization({
            sheetName: firstSheet.name,
            columns: numericCols.slice(0, 3),
          });
        }
      }

      // Send notification when complete
      sendNotification('Analysis Complete', 'Your Excel analysis is ready!');

    } catch (error) {
      // Don't show error for aborted requests
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }
      console.error('Excel search error:', error);
      setMessages(prev => [...prev, {
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
  }, [input, excel, isLoading]);

  const handleExportDocx = useCallback(async () => {
    if (!excel || messages.length < 2) return;

    try {
      await exportExcelChatToDocx(
        messages.map(m => ({ role: m.role, content: m.content })),
        excel.fileName,
        `${excel.fileName.replace(/\.[^/.]+$/, '')}-analysis`
      );
      
      toast({
        title: 'Exported!',
        description: 'Your analysis has been downloaded as DOCX',
      });
    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: 'Export failed',
        description: 'Could not generate DOCX file',
        variant: 'destructive',
      });
    }
  }, [excel, messages, toast]);

  const handleVisualizationRequest = useCallback((sheetName: string, columns: number[]) => {
    setActiveVisualization({ sheetName, columns });
  }, []);

  const handleBackToKnowledgeBase = useCallback(() => {
    setExcel(null);
    setMessages([]);
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
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {excel && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleBackToKnowledgeBase}
              className="gap-1.5"
            >
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
              Export to DOCX
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
                        Upload a new Excel file to analyze. It will be saved to your Knowledge Base for future access.
                      </p>
                      <>
                        <input
                          id="excel-file-input"
                          type="file"
                          accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                        <Button 
                          disabled={isParsing || isSaving} 
                          className="gap-2"
                          onClick={() => window.document.getElementById('excel-file-input')?.click()}
                        >
                          {isParsing || isSaving ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <FileSpreadsheet className="w-4 h-4" />
                          )}
                          {isParsing ? 'Parsing...' : isSaving ? 'Saving...' : 'Choose Excel File'}
                        </Button>
                      </>
                    </CardContent>
                  </Card>

                  {/* Previously uploaded Excel files */}
                  {excelDocuments.length > 0 && (
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Database className="w-4 h-4" />
                          Your Excel Files in Knowledge Base
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
                                <p className="text-xs text-muted-foreground truncate">
                                  {doc.summary || doc.name}
                                </p>
                              </div>
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Clock className="w-3 h-3" />
                                {new Date(doc.created_at).toLocaleDateString()}
                              </div>
                            </button>
                          ))
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {/* Empty state if no Excel files */}
                  {!docsLoading && excelDocuments.length === 0 && (
                    <Card className="bg-muted/30">
                      <CardContent className="flex flex-col items-center justify-center py-8">
                        <FolderOpen className="w-10 h-10 text-muted-foreground/50 mb-3" />
                        <p className="text-sm text-muted-foreground text-center">
                          No Excel files in your Knowledge Base yet.<br />
                          Upload one above to get started!
                        </p>
                      </CardContent>
                    </Card>
                  )}
                </div>
              ) : excel ? (
                <>
                  {/* Excel Viewer */}
                  <ExcelViewer 
                    excel={excel} 
                    onRequestVisualization={handleVisualizationRequest}
                  />

                  {/* Messages */}
                  {messages.map((msg) => (
                    <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`
                        max-w-[85%] rounded-2xl px-4 py-3
                        ${msg.role === 'user' 
                          ? 'bg-primary text-primary-foreground rounded-br-md' 
                          : 'bg-muted rounded-bl-md'
                        }
                      `}>
                        {msg.role === 'assistant' ? (
                          <MarkdownRenderer content={msg.content} />
                        ) : (
                          <p className="text-sm">{msg.content}</p>
                        )}
                        
                        {/* Cell References */}
                        {msg.cellReferences && msg.cellReferences.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-border/50">
                            <p className="text-xs text-muted-foreground mb-1">📍 Found in:</p>
                            <div className="flex flex-wrap gap-1">
                              {msg.cellReferences.slice(0, 6).map((ref, idx) => (
                                <Badge key={idx} variant="secondary" className="text-[10px]">
                                  {ref.sheet}!{ref.cell}
                                </Badge>
                              ))}
                              {msg.cellReferences.length > 6 && (
                                <Badge variant="outline" className="text-[10px]">
                                  +{msg.cellReferences.length - 6} more
                                </Badge>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}

                  {isLoading && (
                    <div className="flex justify-start">
                      <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3 min-w-[280px]">
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin text-primary" />
                            <div>
                              <span className="text-sm font-medium">
                                {analysisStage === 'requesting' ? 'Contacting AI…' : 'Analyzing…'}
                              </span>
                              <p className="text-xs text-muted-foreground">
                                {elapsedTime}s elapsed
                                {estimatedSeconds != null && (
                                  <> • ETA ~{Math.max(0, estimatedSeconds - elapsedTime)}s</>
                                )}
                                {timeToFirstToken != null && (
                                  <> • First response in {timeToFirstToken}s</>
                                )}
                              </p>
                              {estimatedSeconds != null && elapsedTime > estimatedSeconds * 3 && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  Still running (not stuck) — it's waiting on the AI service. You can press Stop anytime.
                                </p>
                              )}
                            </div>
                          </div>
                          <Button 
                            variant="destructive" 
                            size="sm" 
                            onClick={handleStopAnalysis}
                            className="gap-1 h-7 px-2"
                          >
                            <Square className="w-3 h-3 fill-current" />
                            Stop
                          </Button>
                        </div>
                        <Progress
                          value={
                            estimatedSeconds != null
                              ? Math.min((elapsedTime / Math.max(1, estimatedSeconds)) * 100, 95)
                              : Math.min(elapsedTime * 3.3, 95)
                          }
                          className="mt-2 h-1"
                        />
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
                  placeholder="Ask about your Excel data... (e.g., 'What is the total sales?' or 'Show me a chart of revenue')"
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
                <Badge variant="outline" className="text-xs cursor-pointer hover:bg-muted" onClick={() => setInput('What is the total of column B?')}>
                  <Sparkles className="w-3 h-3 mr-1" />
                  Sum column
                </Badge>
                <Badge variant="outline" className="text-xs cursor-pointer hover:bg-muted" onClick={() => setInput('Show me a chart of the data')}>
                  <BarChart2 className="w-3 h-3 mr-1" />
                  Visualize
                </Badge>
                <Badge variant="outline" className="text-xs cursor-pointer hover:bg-muted" onClick={() => setInput('Find the maximum value')}>
                  <Sparkles className="w-3 h-3 mr-1" />
                  Find max
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
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-6 w-6"
                onClick={() => setActiveVisualization(null)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            <ExcelCharts
              excel={excel}
              sheetName={activeVisualization.sheetName}
              valueColumns={activeVisualization.columns}
            />
          </div>
        )}
      </div>
    </div>
  );
}
