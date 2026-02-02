import { useState, useRef, useEffect, KeyboardEvent, DragEvent, useCallback } from 'react';
import { Send, Paperclip, X, FileText, Loader2, ListOrdered, Upload, AtSign, Hash, Zap, Globe, Sparkles, Languages, Type, Mail, FileSignature, PenTool } from 'lucide-react';
import { getSupportedFileTypes, getSupportedFileTypesLabel } from '@/lib/documentParser';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { Document } from '@/hooks/useDocuments';
import { useSpeechToText } from '@/hooks/useSpeechToText';
import { SpeechButton } from '@/components/SpeechButton';
import { useToast } from '@/hooks/use-toast';
import type { ApiIntegration } from '@/hooks/useApiIntegrations';
import { TranslationPanel } from '@/components/TranslationPanel';
import { DocumentTranslationPanel } from '@/components/DocumentTranslationPanel';
interface Friend {
  friend_id: string;
  display_name?: string;
  email?: string;
}

interface MentionSuggestion {
  type: 'user' | 'document' | 'api' | 'search';
  id: string;
  label: string;
  sublabel?: string;
  icon: string;
}

interface ChatInputProps {
  documents: Document[];
  selectedDocument: Document | null;
  onSelectDocument: (doc: Document | null) => void;
  onSendMessage: (message: string, mentions?: { type: string; id: string; label: string }[]) => void;
  onUploadFile: (file: File) => void;
  onGenerateFaq: (count: number) => void;
  onToolAction?: (action: 'paraphrase' | 'grammar' | 'translate' | 'email' | 'letter', content: string, language?: string) => void;
  isLoading: boolean;
  isUploading: boolean;
  speechButtonRef?: React.RefObject<HTMLButtonElement>;
  focusSearch?: boolean;
  onSearchFocusHandled?: () => void;
  friends?: Friend[];
  integrations?: ApiIntegration[];
  onMention?: (type: string, id: string) => void;
}

export function ChatInput({
  documents,
  selectedDocument,
  onSelectDocument,
  onSendMessage,
  onUploadFile,
  onGenerateFaq,
  onToolAction,
  isLoading,
  isUploading,
  speechButtonRef,
  focusSearch,
  onSearchFocusHandled,
  friends = [],
  integrations = [],
  onMention,
}: ChatInputProps) {
  const [message, setMessage] = useState('');
  const [showDocumentPicker, setShowDocumentPicker] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showFaqPopover, setShowFaqPopover] = useState(false);
  const [faqCount, setFaqCount] = useState('5');
  const [isDragOver, setIsDragOver] = useState(false);
  const [mentions, setMentions] = useState<{ type: string; id: string; label: string }[]>([]);
  const [showMentionSuggestions, setShowMentionSuggestions] = useState(false);
  const [mentionSuggestions, setMentionSuggestions] = useState<MentionSuggestion[]>([]);
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);
  const [mentionType, setMentionType] = useState<'@' | '#' | '!' | null>(null);
  const [mentionSearchTerm, setMentionSearchTerm] = useState('');
  const [showToolsPopover, setShowToolsPopover] = useState(false);
  const [showTranslationPanel, setShowTranslationPanel] = useState(false);
  const [showDocumentTranslationPanel, setShowDocumentTranslationPanel] = useState(false);
  const [targetLanguage, setTargetLanguage] = useState('English');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Speech-to-text hook
  const {
    isListening,
    interimTranscript,
    isSupported: speechSupported,
    toggleListening,
  } = useSpeechToText({
    language: 'hi-IN', // Supports Hindi and English
    onResult: (transcript) => {
      setMessage(prev => prev + transcript + ' ');
      textareaRef.current?.focus();
    },
    onError: (error) => {
      toast({
        title: 'Voice Input Error',
        description: error,
        variant: 'destructive',
      });
    },
  });

  const filteredDocuments = documents.filter(doc =>
    doc.alias.toLowerCase().includes(searchTerm.toLowerCase()) ||
    doc.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Detect mention triggers (@, #, !)
  useEffect(() => {
    const lastChar = message.slice(-1);
    const lastWord = message.split(/\s/).pop() || '';

    if (lastChar === '@') {
      setMentionType('@');
      setMentionSearchTerm('');
      setShowMentionSuggestions(true);
      setShowDocumentPicker(false);
    } else if (lastChar === '#') {
      setMentionType('#');
      setMentionSearchTerm('');
      setShowMentionSuggestions(true);
      setShowDocumentPicker(false);
    } else if (lastChar === '!') {
      setMentionType('!');
      setMentionSearchTerm('');
      setShowMentionSuggestions(true);
      setShowDocumentPicker(false);
    } else if (mentionType && !lastWord.startsWith(mentionType)) {
      setShowMentionSuggestions(false);
      setMentionType(null);
    } else if (mentionType) {
      const triggerIndex = lastWord.indexOf(mentionType);
      if (triggerIndex !== -1) {
        setMentionSearchTerm(lastWord.slice(triggerIndex + 1).toLowerCase());
      }
    }
  }, [message, mentionType]);

  // Build mention suggestions
  useEffect(() => {
    if (!mentionType) {
      setMentionSuggestions([]);
      return;
    }

    let newSuggestions: MentionSuggestion[] = [];

    if (mentionType === '@') {
      newSuggestions = friends
        .filter(f =>
        (f.display_name?.toLowerCase().includes(mentionSearchTerm) ||
          f.email?.toLowerCase().includes(mentionSearchTerm))
        )
        .slice(0, 5)
        .map(f => ({
          type: 'user' as const,
          id: f.friend_id,
          label: f.display_name || f.email || f.friend_id.slice(0, 8),
          sublabel: f.email,
          icon: '👤',
        }));
    } else if (mentionType === '#') {
      newSuggestions = documents
        .filter(d =>
          d.alias.toLowerCase().includes(mentionSearchTerm) ||
          d.name.toLowerCase().includes(mentionSearchTerm)
        )
        .slice(0, 5)
        .map(d => ({
          type: 'document' as const,
          id: d.id,
          label: d.alias,
          sublabel: d.category || undefined,
          icon: '📄',
        }));
    } else if (mentionType === '!') {
      const apiSuggestions = integrations
        .filter(i =>
          i.is_active &&
          (i.name.toLowerCase().includes(mentionSearchTerm) ||
            i.description?.toLowerCase().includes(mentionSearchTerm))
        )
        .slice(0, 3)
        .map(i => ({
          type: 'api' as const,
          id: i.id,
          label: i.name,
          sublabel: i.description || i.base_url,
          icon: i.icon,
        }));

      const searchEngines: MentionSuggestion[] = [
        { type: 'search' as const, id: 'google', label: 'Google Search', sublabel: 'Search the web with Google', icon: '🔍' },
        { type: 'search' as const, id: 'bing', label: 'Bing Search', sublabel: 'Search the web with Bing', icon: '🌐' },
      ].filter(s => s.label.toLowerCase().includes(mentionSearchTerm));

      newSuggestions = [...apiSuggestions, ...searchEngines].slice(0, 5);
    }

    setMentionSuggestions(newSuggestions);
    setSelectedMentionIndex(0);
  }, [mentionType, mentionSearchTerm, friends, documents, integrations]);

  const selectMentionSuggestion = useCallback((suggestion: MentionSuggestion) => {
    const triggerIndex = message.lastIndexOf(mentionType!);
    const newValue = message.slice(0, triggerIndex) + `${mentionType}${suggestion.label} `;

    setMessage(newValue);
    setMentions(prev => [...prev, { type: suggestion.type, id: suggestion.id, label: suggestion.label }]);
    setShowMentionSuggestions(false);
    setMentionType(null);

    // If it's a document mention, select it
    if (suggestion.type === 'document') {
      const doc = documents.find(d => d.id === suggestion.id);
      if (doc) onSelectDocument(doc);
    }

    onMention?.(suggestion.type, suggestion.id);
    textareaRef.current?.focus();
  }, [message, mentionType, documents, onSelectDocument, onMention]);

  const removeMention = (index: number) => {
    const removed = mentions[index];
    setMentions(prev => prev.filter((_, i) => i !== index));
    if (removed.type === 'document') {
      onSelectDocument(null);
    }
  };

  useEffect(() => {
    // Legacy # trigger for document picker (fallback)
    const hashIndex = message.lastIndexOf('#');
    if (hashIndex !== -1 && !selectedDocument && !showMentionSuggestions) {
      const textAfterHash = message.slice(hashIndex + 1);
      if (!textAfterHash.includes(' ')) {
        setSearchTerm(textAfterHash);
        setShowDocumentPicker(true);
        return;
      }
    }
    if (!showMentionSuggestions) {
      setShowDocumentPicker(false);
    }
  }, [message, selectedDocument, showMentionSuggestions]);

  // Focus search when triggered by keyboard shortcut
  useEffect(() => {
    if (focusSearch && textareaRef.current) {
      textareaRef.current.focus();
      onSearchFocusHandled?.();
    }
  }, [focusSearch, onSearchFocusHandled]);

  const handleSelectDocumentFromPicker = (doc: Document) => {
    onSelectDocument(doc);
    // Remove the # and search text from message
    const hashIndex = message.lastIndexOf('#');
    if (hashIndex !== -1) {
      setMessage(message.slice(0, hashIndex));
    }
    setShowDocumentPicker(false);
    setSearchTerm('');
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMentionSuggestions && mentionSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedMentionIndex(i => (i + 1) % mentionSuggestions.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedMentionIndex(i => (i - 1 + mentionSuggestions.length) % mentionSuggestions.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        selectMentionSuggestion(mentionSuggestions[selectedMentionIndex]);
      } else if (e.key === 'Escape') {
        setShowMentionSuggestions(false);
        setMentionType(null);
      }
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend().catch(err => {
        console.error('Error sending message:', err);
      });
    }
  };

  const handleSend = async () => {
    const trimmedMessage = message.trim();
    if (trimmedMessage && !isLoading) {
      const messageToSend = trimmedMessage;
      const mentionsToSend = [...mentions];
      // Clear input immediately for better UX
      setMessage('');
      setMentions([]);
      // Focus back on textarea after sending
      textareaRef.current?.focus();
      // Send the message
      await onSendMessage(messageToSend, mentionsToSend);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUploadFile(file);
      e.target.value = '';
    }
  };

  const handleFaqGenerate = () => {
    const count = parseInt(faqCount) || 5;
    onGenerateFaq(Math.min(Math.max(count, 1), 20));
    setShowFaqPopover(false);
  };

  // Drag and Drop handlers
  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set false if leaving the drop zone entirely
    if (dropZoneRef.current && !dropZoneRef.current.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const files = e.dataTransfer.files;
    if (files.length > 0 && !isUploading) {
      onUploadFile(files[0]);
    }
  };

  // Tooltip hints for mentions
  const getMentionHint = () => {
    if (!message) return null;
    const lastChar = message.slice(-1);
    if (lastChar === '@' && !showMentionSuggestions) {
      return { icon: <AtSign className="w-3 h-3" />, text: 'Type to mention a friend' };
    }
    if (lastChar === '#' && !showMentionSuggestions) {
      return { icon: <Hash className="w-3 h-3" />, text: 'Type to reference a document' };
    }
    if (lastChar === '!' && !showMentionSuggestions) {
      return { icon: <Zap className="w-3 h-3" />, text: 'Type for web search or API' };
    }
    return null;
  };

  const mentionHint = getMentionHint();

  return (
    <div
      ref={dropZoneRef}
      className={cn(
        "border-t border-border bg-card/50 p-4 relative transition-all duration-200",
        isDragOver && "bg-primary/5 border-primary"
      )}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragOver && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-primary/10 backdrop-blur-sm border-2 border-dashed border-primary rounded-lg m-2 pointer-events-none">
          <div className="flex flex-col items-center gap-2 text-primary">
            <Upload className="w-8 h-8 animate-bounce" />
            <p className="font-medium">Drop your file here</p>
            <p className="text-xs text-muted-foreground">PDF, DOCX, Images, TXT</p>
          </div>
        </div>
      )}

      {/* Mention Hint Tooltip */}
      {mentionHint && (
        <div className="absolute -top-10 left-1/2 transform -translate-x-1/2 z-20 animate-fade-in">
          <div className="flex items-center gap-1.5 bg-popover border border-border rounded-full px-3 py-1.5 shadow-lg">
            {mentionHint.icon}
            <span className="text-xs text-muted-foreground">{mentionHint.text}</span>
          </div>
        </div>
      )}

      <div className="max-w-3xl mx-auto">
        {/* Active Mentions Display */}
        {mentions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2 animate-fade-in">
            {mentions.map((m, i) => (
              <Badge
                key={i}
                variant="secondary"
                className="gap-1 cursor-pointer hover:bg-destructive/20"
                onClick={() => removeMention(i)}
              >
                {m.type === 'user' && <AtSign className="w-3 h-3" />}
                {m.type === 'document' && <Hash className="w-3 h-3" />}
                {(m.type === 'api' || m.type === 'search') && <Zap className="w-3 h-3" />}
                {m.label}
                <X className="w-3 h-3 ml-1" />
              </Badge>
            ))}
          </div>
        )}

        {/* Mention Suggestions Dropdown */}
        {showMentionSuggestions && mentionSuggestions.length > 0 && (
          <div className="mb-2 bg-popover border border-border rounded-lg shadow-lg overflow-hidden animate-fade-in z-50">
            <div className="p-2 border-b border-border bg-muted/50">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {mentionType === '@' && (
                  <>
                    <AtSign className="w-3 h-3" />
                    <span>Mention a friend</span>
                  </>
                )}
                {mentionType === '#' && (
                  <>
                    <Hash className="w-3 h-3" />
                    <span>Reference a document</span>
                  </>
                )}
                {mentionType === '!' && (
                  <>
                    <Zap className="w-3 h-3" />
                    <span>Use API or web search</span>
                  </>
                )}
              </div>
            </div>
            <div className="max-h-48 overflow-y-auto">
              {mentionSuggestions.map((s, i) => (
                <button
                  key={`${s.type}-${s.id}`}
                  className={cn(
                    "w-full text-left px-3 py-2 flex items-center gap-2 transition-colors",
                    i === selectedMentionIndex ? "bg-accent" : "hover:bg-muted/50"
                  )}
                  onClick={() => selectMentionSuggestion(s)}
                >
                  <span className="text-lg">{s.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{s.label}</p>
                    {s.sublabel && (
                      <p className="text-xs text-muted-foreground truncate">{s.sublabel}</p>
                    )}
                  </div>
                  {s.type === 'search' && <Globe className="w-4 h-4 text-muted-foreground" />}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Selected Document Chip */}
        {selectedDocument && (
          <div className="mb-3 flex items-center gap-2 animate-fade-in">
            <div className="document-chip">
              <FileText className="w-3.5 h-3.5" />
              <span>{selectedDocument.alias}</span>
              <button
                onClick={() => onSelectDocument(null)}
                className="ml-1 hover:text-primary/70"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* FAQ Generation Button */}
            <Popover open={showFaqPopover} onOpenChange={setShowFaqPopover}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5">
                  <ListOrdered className="w-3.5 h-3.5" />
                  Generate FAQ
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64" align="start">
                <div className="space-y-3">
                  <h4 className="font-medium text-sm">Generate FAQs</h4>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      min="1"
                      max="20"
                      value={faqCount}
                      onChange={(e) => setFaqCount(e.target.value)}
                      placeholder="Count"
                      className="h-8"
                    />
                    <Button size="sm" onClick={handleFaqGenerate} disabled={isLoading}>
                      Generate
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            {/* AI Quick Tools */}
            <Popover open={showToolsPopover} onOpenChange={setShowToolsPopover}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5 border-primary/30 hover:bg-primary/5">
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                  AI Tools
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-2" align="start">
                <div className="grid grid-cols-1 gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="justify-start gap-2 h-9"
                    onClick={() => {
                      onToolAction?.('paraphrase', message);
                      setShowToolsPopover(false);
                    }}
                    disabled={!message.trim()}
                  >
                    <Type className="w-4 h-4" /> Paraphrase Text
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="justify-start gap-2 h-9"
                    onClick={() => {
                      onToolAction?.('grammar', message);
                      setShowToolsPopover(false);
                    }}
                    disabled={!message.trim()}
                  >
                    <Zap className="w-4 h-4" /> Grammar Check
                  </Button>
                  <div className="border-t border-border my-1" />
                  <div className="px-2 py-1.5 space-y-2">
                    <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                      <Languages className="w-3 h-3" /> Translation
                    </p>
                    <div className="flex gap-2">
                      <select
                        className="flex-1 h-8 rounded border border-input bg-background px-2 text-xs"
                        value={targetLanguage}
                        onChange={(e) => setTargetLanguage(e.target.value)}
                      >
                        <option value="English">English</option>
                        <option value="Hindi">Hindi</option>
                        <option value="Spanish">Spanish</option>
                        <option value="French">French</option>
                        <option value="German">German</option>
                        <option value="Bengali">Bengali</option>
                        <option value="Marathi">Marathi</option>
                      </select>
                      <Button
                        size="sm"
                        className="h-8 px-2"
                        onClick={() => {
                          onToolAction?.('translate', message, targetLanguage);
                          setShowToolsPopover(false);
                        }}
                        disabled={!message.trim()}
                      >
                        Translate
                      </Button>
                    </div>
                  </div>
                  <div className="border-t border-border my-1" />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="justify-start gap-2 h-9"
                    onClick={() => {
                      onToolAction?.('email', message);
                      setShowToolsPopover(false);
                    }}
                  >
                    <Mail className="w-4 h-4" /> Write Email
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="justify-start gap-2 h-9"
                    onClick={() => {
                      onToolAction?.('letter', message);
                      setShowToolsPopover(false);
                    }}
                  >
                    <FileSignature className="w-4 h-4" /> Write Letter
                  </Button>
                </div>
              </PopoverContent>
            </Popover>

            {/* Translation & Language Tools Dialog */}
            <Dialog open={showTranslationPanel} onOpenChange={setShowTranslationPanel}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5 border-accent/50 hover:bg-accent/10">
                  <Languages className="w-3.5 h-3.5 text-accent" />
                  Translate
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl p-0 overflow-hidden">
                <DialogTitle className="sr-only">Translation & Language Tools</DialogTitle>
                <TranslationPanel 
                  initialText={message} 
                  onClose={() => setShowTranslationPanel(false)} 
                />
              </DialogContent>
            </Dialog>
          </div>
        )}

        {/* Document Picker Dropdown */}
        {showDocumentPicker && documents.length > 0 && (
          <div className="mb-2 bg-popover border border-border rounded-lg shadow-lg overflow-hidden animate-fade-in">
            <div className="max-h-48 overflow-y-auto">
              {filteredDocuments.length === 0 ? (
                <div className="p-3 text-sm text-muted-foreground text-center">
                  No matching documents
                </div>
              ) : (
                filteredDocuments.map((doc) => (
                  <button
                    key={doc.id}
                    className="w-full text-left px-3 py-2 hover:bg-accent flex items-center gap-2 transition-colors"
                    onClick={() => handleSelectDocumentFromPicker(doc)}
                  >
                    <FileText className="w-4 h-4 text-primary" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{doc.alias}</p>
                      <p className="text-xs text-muted-foreground truncate">{doc.name}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {/* Input Area */}
        <div className="flex gap-2 items-end">
          {/* File Upload Button */}
          <input
            ref={fileInputRef}
            type="file"
            accept={getSupportedFileTypes()}
            onChange={handleFileChange}
            className="hidden"
          />
          <Button
            variant="outline"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="flex-shrink-0 h-10 w-10"
          >
            {isUploading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Paperclip className="w-4 h-4" />
            )}
          </Button>

          {/* Message Input */}
          <div className="flex-1 relative">
            <Textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                selectedDocument
                  ? `Ask about ${selectedDocument.alias}...`
                  : documents.length > 0
                    ? "Ask anything across your knowledge base..."
                    : "Ask me anything... (or upload docs for your knowledge base)"
              }
              className="min-h-[44px] max-h-32 resize-none pr-12"
              rows={1}
            />
            {/* Interim transcript indicator */}
            {isListening && interimTranscript && (
              <div className="absolute bottom-full left-0 right-0 mb-1 px-2 py-1 bg-muted rounded text-xs text-muted-foreground truncate">
                🎤 {interimTranscript}
              </div>
            )}
          </div>

          {/* Speech Button */}
          <SpeechButton
            ref={speechButtonRef}
            isListening={isListening}
            isSupported={speechSupported}
            interimTranscript={interimTranscript}
            onClick={toggleListening}
            disabled={isLoading}
          />

          {/* Send Button */}
          <Button
            onClick={handleSend}
            disabled={!message.trim() || isLoading}
            className="flex-shrink-0 h-10 w-10"
            size="icon"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
        </Button>
        </div>

        {/* Hint */}
        <div className="flex items-center justify-center gap-2 mt-2 flex-wrap">
          <p className="text-xs text-muted-foreground">
            <span className="font-mono text-primary">@</span> friends •
            <span className="font-mono text-primary ml-1">#</span> documents •
            <span className="font-mono text-primary ml-1">!</span> web search •
            <span className="ml-1">🎤 voice • 📎 upload</span>
          </p>
          {/* Quick access to Translation Panel - Always visible */}
          <Dialog open={showTranslationPanel} onOpenChange={setShowTranslationPanel}>
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs gap-1 text-muted-foreground hover:text-primary px-2"
              >
                <Languages className="w-3 h-3" />
                Translate / Paraphrase
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl p-0 overflow-hidden">
              <DialogTitle className="sr-only">Translation & Language Tools</DialogTitle>
              <TranslationPanel 
                initialText={message} 
                onClose={() => setShowTranslationPanel(false)} 
              />
            </DialogContent>
          </Dialog>
          
          {/* Document Translation */}
          <Dialog open={showDocumentTranslationPanel} onOpenChange={setShowDocumentTranslationPanel}>
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs gap-1 text-muted-foreground hover:text-primary px-2"
                title="Translate entire document while preserving formatting"
              >
                <FileText className="w-3 h-3" />
                Document Translation
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl p-0 overflow-hidden">
              <DialogTitle className="sr-only">Document Translation</DialogTitle>
              <DocumentTranslationPanel 
                onClose={() => setShowDocumentTranslationPanel(false)} 
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
}
