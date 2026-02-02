import { useState, useEffect } from 'react';
import { X, GitCompare, Loader2, FileText, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import type { Document } from '@/hooks/useDocuments';
import { MarkdownRenderer } from './MarkdownRenderer';

interface DocumentComparisonProps {
  documents: Document[];
  onClose: () => void;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-with-document`;

export function DocumentComparison({ documents, onClose }: DocumentComparisonProps) {
  const [doc1Id, setDoc1Id] = useState<string>('');
  const [doc2Id, setDoc2Id] = useState<string>('');
  const [comparison, setComparison] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  const doc1 = documents.find(d => d.id === doc1Id);
  const doc2 = documents.find(d => d.id === doc2Id);

  const handleCompare = async () => {
    if (!doc1 || !doc2) return;

    setIsLoading(true);
    setComparison('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) {
        throw new Error('Not authenticated');
      }

      const combinedContent = `
DOCUMENT 1: "${doc1.alias}"
${doc1.content_text?.slice(0, 6000) || 'No content'}

---

DOCUMENT 2: "${doc2.alias}"
${doc2.content_text?.slice(0, 6000) || 'No content'}
`;

      const response = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: [{
            role: 'user',
            content: `Compare these two documents and provide a detailed analysis:
1. **Key Similarities**: What do both documents have in common?
2. **Key Differences**: How do they differ in content, focus, or approach?
3. **Unique to Document 1**: What's only in "${doc1.alias}"?
4. **Unique to Document 2**: What's only in "${doc2.alias}"?
5. **Summary**: A brief overall comparison

Use bullet points and clear formatting. Respond in the same language as the documents.`
          }],
          documentContent: combinedContent,
          documentName: `Comparison: ${doc1.alias} vs ${doc2.alias}`,
        }),
      });

      if (!response.ok) throw new Error('Comparison failed');

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
              if (content) {
                fullResponse += content;
                setComparison(fullResponse);
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }
    } catch (error) {
      console.error('Comparison error:', error);
      setComparison('Failed to compare documents. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <GitCompare className="w-5 h-5 text-primary" />
            <h2 className="font-semibold text-lg">Compare Documents</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Document Selection */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground mb-1.5 block">Document 1</label>
              <Select value={doc1Id} onValueChange={setDoc1Id}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select first document" />
                </SelectTrigger>
                <SelectContent>
                  {documents.filter(d => d.id !== doc2Id).map((doc) => (
                    <SelectItem key={doc.id} value={doc.id}>
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        <span>{doc.alias}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <ArrowRight className="w-5 h-5 text-muted-foreground mt-5" />

            <div className="flex-1">
              <label className="text-xs text-muted-foreground mb-1.5 block">Document 2</label>
              <Select value={doc2Id} onValueChange={setDoc2Id}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select second document" />
                </SelectTrigger>
                <SelectContent>
                  {documents.filter(d => d.id !== doc1Id).map((doc) => (
                    <SelectItem key={doc.id} value={doc.id}>
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        <span>{doc.alias}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={handleCompare}
              disabled={!doc1Id || !doc2Id || isLoading}
              className="mt-5"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Comparing...
                </>
              ) : (
                <>
                  <GitCompare className="w-4 h-4 mr-2" />
                  Compare
                </>
              )}
            </Button>
          </div>

          {/* Selected documents info */}
          {(doc1 || doc2) && (
            <div className="flex gap-4 mt-3">
              {doc1 && (
                <Badge variant="secondary" className="text-xs">
                  📄 {doc1.alias} • {doc1.category || 'Document'}
                </Badge>
              )}
              {doc2 && (
                <Badge variant="secondary" className="text-xs">
                  📄 {doc2.alias} • {doc2.category || 'Document'}
                </Badge>
              )}
            </div>
          )}
        </div>

        {/* Comparison Result */}
        <ScrollArea className="flex-1 p-4">
          {comparison ? (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <MarkdownRenderer content={comparison} />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
              <GitCompare className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-sm">Select two documents and click Compare</p>
              <p className="text-xs mt-1">AI will analyze similarities and differences</p>
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}
