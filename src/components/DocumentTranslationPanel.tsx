import { useState, useRef, useCallback } from 'react';
import { Languages, Upload, FileText, Download, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { DialogClose } from '@/components/ui/dialog';
import { Document, Paragraph, TextRun, HeadingLevel, Packer } from 'docx';
import { saveAs } from 'file-saver';

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-with-document`;
const PARSE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-document`;

interface DocumentTranslationPanelProps {
  onClose?: () => void;
}

type LanguageOption = 'English' | 'Hindi' | 'Hinglish';

export function DocumentTranslationPanel({ onClose }: DocumentTranslationPanelProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sourceLanguage, setSourceLanguage] = useState<LanguageOption>('English');
  const [targetLanguage, setTargetLanguage] = useState<LanguageOption>('Hindi');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [translatedContent, setTranslatedContent] = useState<string>('');
  const [originalContent, setOriginalContent] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Check file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: 'File too large',
          description: 'Maximum file size is 10MB',
          variant: 'destructive',
        });
        return;
      }
      setSelectedFile(file);
      setTranslatedContent('');
      setOriginalContent('');
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: 'File too large',
          description: 'Maximum file size is 10MB',
          variant: 'destructive',
        });
        return;
      }
      setSelectedFile(file);
      setTranslatedContent('');
      setOriginalContent('');
    }
  }, [toast]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const processDocument = useCallback(async () => {
    if (!selectedFile) {
      toast({
        title: 'No file selected',
        description: 'Please select a document to translate',
        variant: 'destructive',
      });
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    setTranslatedContent('');
    setOriginalContent('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) {
        throw new Error('Not authenticated. Please log in.');
      }

      // Step 1: Parse document to extract text
      setProgress(20);
      const formData = new FormData();
      formData.append('file', selectedFile);

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

      const extractedText = parseResult.content;
      setOriginalContent(extractedText);
      setProgress(40);

      if (!extractedText || extractedText.length < 10) {
        throw new Error('Could not extract meaningful text from the document');
      }

      // Step 2: Translate the document
      setProgress(60);
      const response = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: [],
          documentContent: '',
          documentName: selectedFile.name,
          action: 'translate',
          targetLanguage: targetLanguage,
          sourceLanguage: sourceLanguage,
          inputText: extractedText,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Translation failed: ${response.status}`);
      }

      if (!response.body) {
        throw new Error('No response body received');
      }

      // Stream the translation
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullTranslation = '';

      setProgress(80);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
          let line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);

          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') break;

          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              fullTranslation += delta;
              setTranslatedContent(fullTranslation);
            }
          } catch {
            // Continue processing
          }
        }
      }

      setProgress(100);
      toast({
        title: 'Translation complete',
        description: 'Your document has been translated successfully',
      });
    } catch (error) {
      console.error('Translation error:', error);
      toast({
        title: 'Translation failed',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  }, [selectedFile, sourceLanguage, targetLanguage, toast]);

  const downloadAsDocx = useCallback(async () => {
    if (!translatedContent) {
      toast({
        title: 'No translation available',
        description: 'Please translate a document first',
        variant: 'destructive',
      });
      return;
    }

    try {
      // Parse the translated content into paragraphs while preserving structure
      const lines = translatedContent.split('\n').filter(line => line.trim());
      const paragraphs: Paragraph[] = [];

      // Add title
      paragraphs.push(
        new Paragraph({
          text: `Translated Document: ${selectedFile?.name || 'document'}`,
          heading: HeadingLevel.HEADING_1,
          spacing: { after: 400 },
        })
      );

      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `Source Language: ${sourceLanguage} → Target Language: ${targetLanguage}`,
              italics: true,
              color: '666666',
            }),
          ],
          spacing: { after: 300 },
        })
      );

      // Process content with basic formatting preservation
      let currentParagraph = '';
      for (const line of lines) {
        const trimmedLine = line.trim();
        
        // Detect headings (lines that are short and might be headings)
        if (trimmedLine.length < 100 && trimmedLine.length > 0) {
          // Check if it looks like a heading
          if (trimmedLine.match(/^[A-Z][^.!?]*$/)) {
            if (currentParagraph) {
              paragraphs.push(
                new Paragraph({
                  children: [new TextRun({ text: currentParagraph })],
                  spacing: { after: 200 },
                })
              );
              currentParagraph = '';
            }
            paragraphs.push(
              new Paragraph({
                text: trimmedLine,
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 200, after: 100 },
              })
            );
            continue;
          }
        }

        // Regular paragraph content
        if (trimmedLine) {
          if (currentParagraph) {
            currentParagraph += ' ' + trimmedLine;
          } else {
            currentParagraph = trimmedLine;
          }
        } else {
          // Empty line - end current paragraph
          if (currentParagraph) {
            paragraphs.push(
              new Paragraph({
                children: [new TextRun({ text: currentParagraph })],
                spacing: { after: 200 },
              })
            );
            currentParagraph = '';
          }
        }
      }

      // Add remaining paragraph
      if (currentParagraph) {
        paragraphs.push(
          new Paragraph({
            children: [new TextRun({ text: currentParagraph })],
            spacing: { after: 200 },
          })
        );
      }

      // Add footer
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `Translated by Gyankosh on ${new Date().toLocaleDateString()}`,
              size: 20,
              color: '666666',
              italics: true,
            }),
          ],
          spacing: { before: 400 },
        })
      );

      const doc = new Document({
        sections: [{
          properties: {},
          children: paragraphs,
        }],
      });

      const blob = await Packer.toBlob(doc);
      const fileName = selectedFile?.name.replace(/\.[^/.]+$/, '') || 'translated-document';
      saveAs(blob, `${fileName}-${targetLanguage}.docx`);

      toast({
        title: 'Download started',
        description: 'Your translated document is being downloaded',
      });
    } catch (error) {
      console.error('Download error:', error);
      toast({
        title: 'Download failed',
        description: 'Could not generate Word document',
        variant: 'destructive',
      });
    }
  }, [translatedContent, selectedFile, sourceLanguage, targetLanguage, toast]);

  return (
    <div className="bg-card border border-border rounded-lg p-6 shadow-lg max-w-3xl w-full">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Languages className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-lg">Document Translation</h3>
        </div>
        {onClose && (
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      <div className="space-y-6">
        {/* Language Selection */}
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <Label htmlFor="sourceLang">Source Language</Label>
            <select
              id="sourceLang"
              value={sourceLanguage}
              onChange={(e) => setSourceLanguage(e.target.value as LanguageOption)}
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm mt-1"
              disabled={isProcessing}
            >
              <option value="English">English</option>
              <option value="Hindi">Hindi (हिंदी)</option>
              <option value="Hinglish">Hinglish</option>
            </select>
          </div>
          
          <div className="pt-6">
            <Languages className="w-5 h-5 text-muted-foreground" />
          </div>
          
          <div className="flex-1">
            <Label htmlFor="targetLang">Target Language</Label>
            <select
              id="targetLang"
              value={targetLanguage}
              onChange={(e) => setTargetLanguage(e.target.value as LanguageOption)}
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm mt-1"
              disabled={isProcessing}
            >
              <option value="English">English</option>
              <option value="Hindi">Hindi (हिंदी)</option>
              <option value="Hinglish">Hinglish</option>
            </select>
          </div>
        </div>

        {/* File Upload */}
        <div>
          <Label>Upload Document</Label>
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            className="mt-2 border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.doc,.txt,.md"
              onChange={handleFileSelect}
              className="hidden"
              disabled={isProcessing}
            />
            {selectedFile ? (
              <div className="flex items-center gap-2 justify-center">
                <FileText className="w-5 h-5 text-primary" />
                <span className="font-medium">{selectedFile.name}</span>
                <span className="text-sm text-muted-foreground">
                  ({(selectedFile.size / 1024).toFixed(1)} KB)
                </span>
              </div>
            ) : (
              <>
                <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground mb-2">
                  Click to upload or drag and drop
                </p>
                <p className="text-xs text-muted-foreground">
                  Supports PDF, DOCX, DOC, TXT, MD (Max 10MB)
                </p>
              </>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        {isProcessing && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Processing...</span>
              <span>{progress}%</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className="bg-primary h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Action Button */}
        <Button
          onClick={processDocument}
          disabled={!selectedFile || isProcessing}
          className="w-full gap-2"
          size="lg"
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Translating...
            </>
          ) : (
            <>
              <Languages className="w-4 h-4" />
              Translate Document
            </>
          )}
        </Button>

        {/* Translated Content Preview */}
        {translatedContent && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Translated Content Preview</Label>
              <Button
                onClick={downloadAsDocx}
                variant="outline"
                size="sm"
                className="gap-2"
              >
                <Download className="w-4 h-4" />
                Download as Word (.docx)
              </Button>
            </div>
            <div className="p-4 bg-muted rounded-lg max-h-96 overflow-y-auto">
              <pre className="whitespace-pre-wrap text-sm font-sans">
                {translatedContent}
              </pre>
            </div>
            <p className="text-xs text-muted-foreground">
              💡 The downloaded Word document preserves formatting, paragraphs, and structure. 
              You can directly copy and paste this content into any Word document.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
