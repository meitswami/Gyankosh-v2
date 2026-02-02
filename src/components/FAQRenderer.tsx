import { useState } from 'react';
import { Copy, Download, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface FAQ {
  question: string;
  answer: string;
}

interface FAQRendererProps {
  content: string;
  documentName?: string;
}

function parseFAQs(content: string): FAQ[] {
  const faqs: FAQ[] = [];
  
  // Try to parse JSON format first
  try {
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed)) {
        return parsed.map(item => ({
          question: item.question || item.q || item.Q || '',
          answer: item.answer || item.a || item.A || '',
        })).filter(faq => faq.question && faq.answer);
      }
    }
  } catch {
    // Continue with regex parsing
  }

  // Pattern: Q1: ... A1: ... or **Q1:** ... **A1:** ... or 1. Question: ... Answer: ...
  const patterns = [
    /(?:Q\d*[:.]?\s*\**|\*\*Q\d*[:.]?\*\*\s*|\d+\.\s*(?:Question|प्रश्न)[:.]?\s*)(.+?)(?:\n\s*)?(?:A\d*[:.]?\s*\**|\*\*A\d*[:.]?\*\*\s*|(?:Answer|उत्तर)[:.]?\s*)(.+?)(?=(?:\n\s*(?:Q\d*[:.]?|1\.|2\.|3\.|4\.|5\.|6\.|7\.|8\.|9\.|10\.)|\n\n|\Z))/gis,
    /\*\*(.+?)\*\*\s*[\n:](.+?)(?=\n\n\*\*|\n\n\d+\.|\Z)/gs,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const question = match[1].trim().replace(/^\*\*|\*\*$/g, '');
      const answer = match[2].trim();
      if (question && answer) {
        faqs.push({ question, answer });
      }
    }
    if (faqs.length > 0) break;
  }

  // Fallback: Split by numbered items
  if (faqs.length === 0) {
    const numbered = content.split(/\n(?=\d+\.)/);
    for (const item of numbered) {
      const lines = item.split('\n').filter(l => l.trim());
      if (lines.length >= 2) {
        const question = lines[0].replace(/^\d+\.\s*/, '').replace(/\*\*/g, '').trim();
        const answer = lines.slice(1).join(' ').trim();
        if (question && answer) {
          faqs.push({ question, answer });
        }
      }
    }
  }

  return faqs;
}

export function FAQRenderer({ content, documentName }: FAQRendererProps) {
  const { toast } = useToast();
  const [openItems, setOpenItems] = useState<Set<number>>(new Set([0]));
  const [copied, setCopied] = useState(false);

  const faqs = parseFAQs(content);

  // If no FAQs detected, return plain text
  if (faqs.length === 0) {
    return <div className="whitespace-pre-wrap text-sm leading-relaxed">{content}</div>;
  }

  const toggleItem = (index: number) => {
    setOpenItems(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const expandAll = () => setOpenItems(new Set(faqs.map((_, i) => i)));
  const collapseAll = () => setOpenItems(new Set());

  const handleCopy = async () => {
    const text = faqs.map((faq, i) => 
      `${i + 1}. ${faq.question}\n${faq.answer}`
    ).join('\n\n');
    
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast({ title: 'Copied!', description: 'FAQs copied to clipboard' });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const text = faqs.map((faq, i) => 
      `${i + 1}. ${faq.question}\n\nAnswer: ${faq.answer}`
    ).join('\n\n---\n\n');
    
    const header = documentName ? `FAQs from: ${documentName}\n${'='.repeat(40)}\n\n` : '';
    const blob = new Blob([header + text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `faqs-${documentName || 'document'}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Downloaded!', description: 'FAQs saved as text file' });
  };

  return (
    <div className="space-y-4">
      {/* Header with actions */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-sm font-medium text-primary">
          {faqs.length} FAQ{faqs.length !== 1 ? 's' : ''} Generated
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={openItems.size === faqs.length ? collapseAll : expandAll}
            className="text-xs"
          >
            {openItems.size === faqs.length ? 'Collapse All' : 'Expand All'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            className="gap-1.5"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">Copy</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownload}
            className="gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Download</span>
          </Button>
        </div>
      </div>

      {/* FAQ Accordions */}
      <div className="space-y-2">
        {faqs.map((faq, index) => (
          <Card key={index} className="overflow-hidden border-border/50 shadow-sm">
            <Collapsible open={openItems.has(index)} onOpenChange={() => toggleItem(index)}>
              <CollapsibleTrigger asChild>
                <button
                  className={cn(
                    "w-full flex items-start gap-3 p-4 text-left transition-colors hover:bg-muted/50",
                    openItems.has(index) && "bg-muted/30"
                  )}
                >
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-medium flex items-center justify-center">
                    {index + 1}
                  </span>
                  <span className="flex-1 font-medium text-sm text-foreground leading-relaxed break-words">
                    {faq.question}
                  </span>
                  {openItems.has(index) ? (
                    <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                  )}
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="pt-0 pb-4 pl-[52px] pr-4">
                  <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                    {faq.answer}
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function isFAQContent(content: string): boolean {
  const faqIndicators = [
    /Q\d*[:.]?\s*/i,
    /FAQ/i,
    /\*\*Question/i,
    /\*\*प्रश्न/i,
    /(?:generate|created?)\s+\d+\s+FAQ/i,
  ];
  
  return faqIndicators.some(pattern => pattern.test(content));
}
