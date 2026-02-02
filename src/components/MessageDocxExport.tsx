import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Download, FileText, Loader2 } from 'lucide-react';
import { Document, Paragraph, TextRun, HeadingLevel, Table, TableCell, TableRow, WidthType, Packer } from 'docx';
import { saveAs } from 'file-saver';

interface MessageDocxExportProps {
  content: string;
  documentName?: string;
}

// Parse markdown content to docx elements
function parseMarkdownToDocx(markdown: string): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const lines = markdown.split('\n');
  let inCodeBlock = false;
  let codeContent: string[] = [];
  let inTable = false;
  let tableRows: string[][] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code blocks
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        // End code block
        paragraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: codeContent.join('\n'),
                font: 'Consolas',
                size: 20,
              }),
            ],
            shading: { fill: 'F5F5F5' },
            spacing: { before: 100, after: 100 },
          })
        );
        codeContent = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeContent.push(line);
      continue;
    }

    // Tables
    if (line.startsWith('|') && line.endsWith('|')) {
      if (!inTable) {
        inTable = true;
        tableRows = [];
      }
      // Skip separator rows
      if (!line.match(/^\|[\s\-:|]+\|$/)) {
        const cells = line.split('|').filter(c => c.trim()).map(c => c.trim());
        tableRows.push(cells);
      }
      continue;
    } else if (inTable) {
      // End table
      if (tableRows.length > 0) {
        const table = new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: tableRows.map((row, rowIdx) =>
            new TableRow({
              children: row.map(cell =>
                new TableCell({
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: cell,
                          bold: rowIdx === 0,
                        }),
                      ],
                    }),
                  ],
                })
              ),
            })
          ),
        });
        // @ts-ignore - docx types are complex
        paragraphs.push(table);
      }
      inTable = false;
      tableRows = [];
    }

    // Headings
    if (line.startsWith('# ')) {
      paragraphs.push(
        new Paragraph({
          text: line.replace('# ', ''),
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 240, after: 120 },
        })
      );
      continue;
    }
    if (line.startsWith('## ')) {
      paragraphs.push(
        new Paragraph({
          text: line.replace('## ', ''),
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 100 },
        })
      );
      continue;
    }
    if (line.startsWith('### ')) {
      paragraphs.push(
        new Paragraph({
          text: line.replace('### ', ''),
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 160, after: 80 },
        })
      );
      continue;
    }

    // Horizontal rule
    if (line.match(/^---+$/)) {
      paragraphs.push(
        new Paragraph({
          children: [],
          border: {
            bottom: { color: 'CCCCCC', size: 1, style: 'single' },
          },
          spacing: { before: 200, after: 200 },
        })
      );
      continue;
    }

    // Blockquotes
    if (line.startsWith('> ')) {
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: line.replace('> ', ''),
              italics: true,
              color: '666666',
            }),
          ],
          indent: { left: 720 },
          spacing: { before: 100, after: 100 },
        })
      );
      continue;
    }

    // Lists
    if (line.match(/^[\-\*]\s/)) {
      paragraphs.push(
        new Paragraph({
          children: parseInlineFormatting(line.replace(/^[\-\*]\s/, '')),
          bullet: { level: 0 },
          spacing: { before: 40, after: 40 },
        })
      );
      continue;
    }
    if (line.match(/^\d+\.\s/)) {
      paragraphs.push(
        new Paragraph({
          children: parseInlineFormatting(line.replace(/^\d+\.\s/, '')),
          numbering: { reference: 'default', level: 0 },
          spacing: { before: 40, after: 40 },
        })
      );
      continue;
    }

    // Empty lines
    if (line.trim() === '') {
      paragraphs.push(new Paragraph({ children: [] }));
      continue;
    }

    // Regular paragraph with inline formatting
    paragraphs.push(
      new Paragraph({
        children: parseInlineFormatting(line),
        spacing: { before: 60, after: 60 },
      })
    );
  }

  return paragraphs;
}

// Parse inline formatting (bold, italic, code)
function parseInlineFormatting(text: string): TextRun[] {
  const runs: TextRun[] = [];
  let remaining = text;

  // Simple regex-based parsing
  const patterns = [
    { regex: /\*\*(.+?)\*\*/g, style: { bold: true } },
    { regex: /\*(.+?)\*/g, style: { italics: true } },
    { regex: /`(.+?)`/g, style: { font: 'Consolas', shading: { fill: 'F0F0F0' } } },
  ];

  // For simplicity, just handle the most common cases
  let processed = text;
  
  // Bold
  processed = processed.replace(/\*\*(.+?)\*\*/g, (_, content) => `{{BOLD:${content}}}`);
  // Italic
  processed = processed.replace(/\*(.+?)\*/g, (_, content) => `{{ITALIC:${content}}}`);
  // Code
  processed = processed.replace(/`(.+?)`/g, (_, content) => `{{CODE:${content}}}`);

  // Split and create runs
  const parts = processed.split(/(\{\{.+?\}\})/g);
  
  for (const part of parts) {
    if (part.startsWith('{{BOLD:')) {
      runs.push(new TextRun({ text: part.slice(7, -2), bold: true }));
    } else if (part.startsWith('{{ITALIC:')) {
      runs.push(new TextRun({ text: part.slice(9, -2), italics: true }));
    } else if (part.startsWith('{{CODE:')) {
      runs.push(new TextRun({ text: part.slice(7, -2), font: 'Consolas', size: 20 }));
    } else if (part) {
      runs.push(new TextRun({ text: part }));
    }
  }

  return runs.length > 0 ? runs : [new TextRun({ text })];
}

export function MessageDocxExport({ content, documentName }: MessageDocxExportProps) {
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    
    try {
      const paragraphs = parseMarkdownToDocx(content);

      // Add header
      const headerParagraphs: Paragraph[] = [
        new Paragraph({
          children: [
            new TextRun({
              text: documentName ? `Response for: ${documentName}` : 'AI Response',
              bold: true,
              size: 28,
            }),
          ],
          spacing: { after: 100 },
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: `Generated on ${new Date().toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}`,
              size: 20,
              color: '666666',
            }),
          ],
          spacing: { after: 200 },
        }),
        new Paragraph({
          children: [],
          border: { bottom: { color: 'CCCCCC', size: 1, style: 'single' } },
          spacing: { after: 200 },
        }),
      ];

      // Add footer
      const footerParagraphs: Paragraph[] = [
        new Paragraph({
          children: [],
          border: { top: { color: 'CCCCCC', size: 1, style: 'single' } },
          spacing: { before: 400 },
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: 'Exported from ज्ञानकोष (Gyaankosh)',
              size: 18,
              color: '999999',
            }),
          ],
          spacing: { before: 100 },
        }),
      ];

      const doc = new Document({
        sections: [{
          properties: {},
          children: [...headerParagraphs, ...paragraphs, ...footerParagraphs],
        }],
      });

      const blob = await Packer.toBlob(doc);
      const fileName = documentName 
        ? `response-${documentName.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.docx`
        : `ai-response-${Date.now()}.docx`;
      saveAs(blob, fileName);
    } catch (error) {
      console.error('Export error:', error);
    } finally {
      setExporting(false);
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={handleExport}
          disabled={exporting}
        >
          {exporting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Download className="w-3.5 h-3.5" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p className="flex items-center gap-1">
          <FileText className="w-3 h-3" /> Download as DOCX
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
