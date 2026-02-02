import { useState } from 'react';
import { Download, Link2, Copy, Check, FileText, FileDown, X, Loader2, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { ChatMessage } from '@/hooks/useChat';
import { jsPDF } from 'jspdf';
import { getChatShareUrl } from '@/lib/shareUrl';
import { addDays, format } from 'date-fns';

type ExpirationOption = 'never' | '7days' | '30days';

interface ChatExportProps {
  messages: ChatMessage[];
  sessionId: string | null;
  sessionTitle?: string;
}

export function ChatExport({ messages, sessionId, sessionTitle }: ChatExportProps) {
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [shareLink, setShareLink] = useState('');
  const [isCreatingLink, setIsCreatingLink] = useState(false);
  const [copied, setCopied] = useState(false);
  const [expiration, setExpiration] = useState<ExpirationOption>('never');
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const { toast } = useToast();

  const generateMarkdown = () => {
    const title = sessionTitle || 'Chat Export';
    const date = new Date().toLocaleDateString('en-IN', { 
      dateStyle: 'long' 
    });
    
    let md = `# ${title}\n\n`;
    md += `*Exported from Gyankosh on ${date}*\n\n---\n\n`;
    
    messages.forEach((msg) => {
      const role = msg.role === 'user' ? '👤 **You**' : '🤖 **Assistant**';
      const time = msg.createdAt.toLocaleTimeString('en-IN', { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
      md += `### ${role} *(${time})*\n\n`;
      md += `${msg.content}\n\n`;
      if (msg.documentName) {
        md += `*Document: ${msg.documentName}*\n\n`;
      }
      md += `---\n\n`;
    });
    
    return md;
  };

  const downloadMarkdown = () => {
    const md = generateMarkdown();
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sessionTitle || 'chat'}-export.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast({
      title: 'Downloaded',
      description: 'Chat exported as Markdown',
    });
  };

  const downloadPDF = () => {
    const doc = new jsPDF();
    const title = sessionTitle || 'Chat Export';
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    const maxWidth = pageWidth - margin * 2;
    let yPos = 20;
    
    // Title
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(title, margin, yPos);
    yPos += 10;
    
    // Date
    doc.setFontSize(10);
    doc.setFont('helvetica', 'italic');
    doc.text(`Exported from Gyankosh on ${new Date().toLocaleDateString('en-IN')}`, margin, yPos);
    yPos += 15;
    
    // Messages
    messages.forEach((msg) => {
      if (yPos > 270) {
        doc.addPage();
        yPos = 20;
      }
      
      // Role header
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      const roleLabel = msg.role === 'user' ? 'You' : 'Assistant';
      doc.text(roleLabel, margin, yPos);
      yPos += 6;
      
      // Content
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      const lines = doc.splitTextToSize(msg.content, maxWidth);
      
      lines.forEach((line: string) => {
        if (yPos > 280) {
          doc.addPage();
          yPos = 20;
        }
        doc.text(line, margin, yPos);
        yPos += 5;
      });
      
      yPos += 8;
    });
    
    doc.save(`${sessionTitle || 'chat'}-export.pdf`);
    
    toast({
      title: 'Downloaded',
      description: 'Chat exported as PDF',
    });
  };

  const createShareLink = async () => {
    if (!sessionId || messages.length === 0) {
      toast({
        title: 'Cannot share',
        description: 'No messages to share',
        variant: 'destructive',
      });
      return;
    }

    setIsCreatingLink(true);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Create snapshot of messages
      const messagesSnapshot = messages.map(m => ({
        role: m.role,
        content: m.content,
        documentName: m.documentName,
        createdAt: m.createdAt.toISOString(),
      }));

      // Calculate expiration date
      let expires_at: string | null = null;
      if (expiration === '7days') {
        expires_at = addDays(new Date(), 7).toISOString();
      } else if (expiration === '30days') {
        expires_at = addDays(new Date(), 30).toISOString();
      }

      const { data, error } = await supabase
        .from('shared_chats')
        .insert({
          session_id: sessionId,
          messages_snapshot: messagesSnapshot,
          title: sessionTitle || 'Shared Chat',
          user_id: user.id,
          expires_at,
        })
        .select('share_token, expires_at')
        .single();

      if (error) throw error;

      const link = getChatShareUrl(data.share_token);
      setShareLink(link);
      setExpiresAt(data.expires_at ? new Date(data.expires_at) : null);
      setIsShareDialogOpen(true);
    } catch (error) {
      console.error('Error creating share link:', error);
      toast({
        title: 'Error',
        description: 'Failed to create share link',
        variant: 'destructive',
      });
    } finally {
      setIsCreatingLink(false);
    }
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({
      title: 'Copied!',
      description: 'Share link copied to clipboard',
    });
  };

  if (messages.length === 0) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5">
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Export</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={downloadMarkdown}>
            <FileText className="w-4 h-4 mr-2" />
            Download as Markdown
          </DropdownMenuItem>
          <DropdownMenuItem onClick={downloadPDF}>
            <FileDown className="w-4 h-4 mr-2" />
            Download as PDF
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={createShareLink} disabled={isCreatingLink}>
            {isCreatingLink ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Link2 className="w-4 h-4 mr-2" />
            )}
            Create Public Link
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={isShareDialogOpen} onOpenChange={setIsShareDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="w-5 h-5" />
              Share Chat
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!shareLink && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="expiration" className="flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Link Expiration
                  </Label>
                  <Select value={expiration} onValueChange={(v) => setExpiration(v as ExpirationOption)}>
                    <SelectTrigger id="expiration">
                      <SelectValue placeholder="Select expiration" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="never">Never expires</SelectItem>
                      <SelectItem value="7days">Expires in 7 days</SelectItem>
                      <SelectItem value="30days">Expires in 30 days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={createShareLink} disabled={isCreatingLink} className="w-full gap-2">
                  {isCreatingLink ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Link2 className="w-4 h-4" />
                  )}
                  Generate Share Link
                </Button>
              </div>
            )}
            
            {shareLink && (
              <>
                <p className="text-sm text-muted-foreground">
                  Anyone with this link can view the chat conversation:
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={shareLink}
                    readOnly
                    className="flex-1 px-3 py-2 text-sm bg-muted rounded-md border border-border truncate"
                  />
                  <Button onClick={copyLink} size="sm" className="gap-1.5">
                    {copied ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
                {expiresAt && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Clock className="w-3 h-3" />
                    Expires on {format(expiresAt, 'MMM d, yyyy')}
                  </p>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
