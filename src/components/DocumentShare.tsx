import { useState } from 'react';
import { Share2, Link2, Copy, Check, Mail, X, Loader2, ExternalLink, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { Document } from '@/hooks/useDocuments';
import { getDocumentShareUrl, getShareBaseUrl } from '@/lib/shareUrl';
import { addDays, format } from 'date-fns';

type ExpirationOption = 'never' | '7days' | '30days';

interface DocumentShareProps {
  document: Document;
  onClose: () => void;
}

export function DocumentShare({ document, onClose }: DocumentShareProps) {
  const [shareLink, setShareLink] = useState('');
  const [isCreatingLink, setIsCreatingLink] = useState(false);
  const [copied, setCopied] = useState(false);
  const [email, setEmail] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [expiration, setExpiration] = useState<ExpirationOption>('never');
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const { toast } = useToast();

  const createShareLink = async () => {
    setIsCreatingLink(true);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Check if share already exists
      const { data: existing } = await supabase
        .from('shared_documents')
        .select('share_token, expires_at')
        .eq('document_id', document.id)
        .single();

      if (existing) {
        const link = getDocumentShareUrl(existing.share_token);
        setShareLink(link);
        setExpiresAt(existing.expires_at ? new Date(existing.expires_at) : null);
        return;
      }

      // Calculate expiration date
      let expires_at: string | null = null;
      if (expiration === '7days') {
        expires_at = addDays(new Date(), 7).toISOString();
      } else if (expiration === '30days') {
        expires_at = addDays(new Date(), 30).toISOString();
      }

      // Create new share
      const { data, error } = await supabase
        .from('shared_documents')
        .insert({
          document_id: document.id,
          user_id: user.id,
          expires_at,
        })
        .select('share_token, expires_at')
        .single();

      if (error) throw error;

      const link = getDocumentShareUrl(data.share_token);
      setShareLink(link);
      setExpiresAt(data.expires_at ? new Date(data.expires_at) : null);
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
    if (!shareLink) {
      await createShareLink();
      return;
    }
    
    await navigator.clipboard.writeText(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({
      title: 'Copied!',
      description: 'Share link copied to clipboard',
    });
  };

  const sendEmailInvite = async () => {
    if (!email.trim() || !email.includes('@')) {
      toast({
        title: 'Invalid email',
        description: 'Please enter a valid email address',
        variant: 'destructive',
      });
      return;
    }

    setIsSendingEmail(true);
    
    try {
      // Create share link if not exists
      if (!shareLink) {
        await createShareLink();
      }

      // For now, just copy to clipboard with email info
      // In production, you'd call an edge function to send the email
      const emailBody = encodeURIComponent(
        `I'm sharing a document with you from Gyankosh:\n\n` +
        `Document: ${document.alias}\n` +
        `Link: ${shareLink || getShareBaseUrl()}\n\n` +
        `Click the link to view the document.`
      );
      
      const mailtoLink = `mailto:${email}?subject=${encodeURIComponent(
        `Shared Document: ${document.alias}`
      )}&body=${emailBody}`;
      
      window.open(mailtoLink, '_blank');
      
      toast({
        title: 'Email opened',
        description: 'Your email client has been opened with the share details',
      });
      
      setEmail('');
    } catch (error) {
      console.error('Error sending email:', error);
      toast({
        title: 'Error',
        description: 'Failed to prepare email',
        variant: 'destructive',
      });
    } finally {
      setIsSendingEmail(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="w-5 h-5" />
            Share Document
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="p-3 bg-muted rounded-lg">
            <p className="text-sm font-medium truncate">{document.alias}</p>
            <p className="text-xs text-muted-foreground truncate">{document.name}</p>
          </div>

          <Tabs defaultValue="link" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="link" className="gap-1.5">
                <Link2 className="w-4 h-4" />
                Link
              </TabsTrigger>
              <TabsTrigger value="email" className="gap-1.5">
                <Mail className="w-4 h-4" />
                Email
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="link" className="space-y-4 mt-4">
              <p className="text-sm text-muted-foreground">
                Create a public link that anyone can use to view this document:
              </p>
              
              {shareLink ? (
                <div className="space-y-3">
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
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => window.open(shareLink, '_blank')}
                    >
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                  </div>
                  {expiresAt && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Clock className="w-3 h-3" />
                      Expires on {format(expiresAt, 'MMM d, yyyy')}
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="doc-expiration" className="flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      Link Expiration
                    </Label>
                    <Select value={expiration} onValueChange={(v) => setExpiration(v as ExpirationOption)}>
                      <SelectTrigger id="doc-expiration">
                        <SelectValue placeholder="Select expiration" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="never">Never expires</SelectItem>
                        <SelectItem value="7days">Expires in 7 days</SelectItem>
                        <SelectItem value="30days">Expires in 30 days</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button 
                    onClick={createShareLink} 
                    disabled={isCreatingLink}
                    className="w-full gap-2"
                  >
                    {isCreatingLink ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Link2 className="w-4 h-4" />
                    )}
                    Generate Share Link
                  </Button>
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="email" className="space-y-4 mt-4">
              <p className="text-sm text-muted-foreground">
                Send an email invitation with the document link:
              </p>
              
              <div className="space-y-2">
                <Label htmlFor="email">Recipient Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="colleague@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              
              <Button 
                onClick={sendEmailInvite}
                disabled={isSendingEmail || !email.trim()}
                className="w-full gap-2"
              >
                {isSendingEmail ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Mail className="w-4 h-4" />
                )}
                Send Email Invite
              </Button>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
