import { useState, useCallback } from 'react';
import { FileSpreadsheet, Send, Download, BarChart2, X, Loader2, FileText, Sparkles } from 'lucide-react';
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

export function ExcelSearchPanel({ onClose }: ExcelSearchPanelProps) {
  const [excel, setExcel] = useState<ParsedExcel | null>(null);
  const [messages, setMessages] = useState<ExcelMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [activeVisualization, setActiveVisualization] = useState<{
    sheetName: string;
    columns: number[];
  } | null>(null);
  const { toast } = useToast();

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
      setMessages([{
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `📊 **Excel loaded: ${parsed.fileName}**\n\nI found **${parsed.sheets.length} sheet(s)** with **${parsed.totalCells.toLocaleString()} cells** total.\n\n**Sheets:**\n${parsed.sheets.map(s => `- ${s.name} (${s.rowCount} rows × ${s.colCount} cols)`).join('\n')}\n\nAsk me anything about this data! I can:\n- Find specific values across all sheets\n- Calculate formulas (SUM, AVG, COUNT, etc.)\n- Create visualizations\n- Export answers to DOCX`,
      }]);
      
      toast({
        title: 'Excel loaded!',
        description: `${parsed.sheets.length} sheets, ${parsed.totalCells.toLocaleString()} cells ready to search`,
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
    }
  }, [toast]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || !excel || isLoading) return;

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

      const response = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          query: input,
          excelContent: excel.searchableContent,
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

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ') && line !== 'data: [DONE]') {
            try {
              const data = JSON.parse(line.slice(6));
              const content = data.choices?.[0]?.delta?.content;
              if (content) {
                fullResponse += content;
                setMessages(prev => prev.map(m => 
                  m.id === assistantId 
                    ? { ...m, content: fullResponse }
                    : m
                ));
              }
            } catch {
              // Skip invalid JSON
            }
          }
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

    } catch (error) {
      console.error('Excel search error:', error);
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `❌ Error: ${error instanceof Error ? error.message : 'Failed to process your question'}`,
      }]);
    } finally {
      setIsLoading(false);
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
              {excel ? `${excel.fileName} • ${excel.sheets.length} sheets` : 'Upload an Excel file to start'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
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
              {!excel ? (
                <Card className="border-dashed">
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <FileSpreadsheet className="w-16 h-16 text-muted-foreground/50 mb-4" />
                    <h3 className="text-lg font-medium mb-2">Upload Excel File</h3>
                    <p className="text-sm text-muted-foreground mb-4 text-center max-w-md">
                      Upload any Excel file (.xlsx, .xls) and ask questions about the data.
                      I'll search across all sheets and provide answers with cell references.
                    </p>
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                      <Button disabled={isParsing} className="gap-2">
                        {isParsing ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <FileSpreadsheet className="w-4 h-4" />
                        )}
                        {isParsing ? 'Parsing...' : 'Choose Excel File'}
                      </Button>
                    </label>
                  </CardContent>
                </Card>
              ) : (
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
                      <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span className="text-sm">Analyzing...</span>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
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
                <Button onClick={handleSend} disabled={isLoading || !input.trim()} className="gap-1.5">
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  Ask
                </Button>
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
