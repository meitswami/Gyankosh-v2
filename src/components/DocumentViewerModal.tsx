import { X, Loader2, FileText, Download, ExternalLink } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import type { Document } from '@/hooks/useDocuments';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface DocumentViewerModalProps {
  document: Document | null;
  isOpen: boolean;
  onClose: () => void;
}

export function DocumentViewerModal({ document, isOpen, onClose }: DocumentViewerModalProps) {
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!isOpen || !document) {
      setDocumentUrl(null);
      setError(null);
      return;
    }

    const loadDocument = async () => {
      if (!document.file_path) {
        setError('Document file not found');
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // Get signed URL for the document (valid for 1 hour)
        const { data, error: urlError } = await supabase.storage
          .from('documents')
          .createSignedUrl(document.file_path, 3600);

        if (urlError) throw urlError;

        if (data?.signedUrl) {
          setDocumentUrl(data.signedUrl);
        } else {
          throw new Error('Failed to generate document URL');
        }
      } catch (err) {
        console.error('Error loading document:', err);
        setError('Failed to load document. Please try again.');
        toast({
          title: 'Error',
          description: 'Could not load document',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };

    loadDocument();
  }, [isOpen, document, toast]);

  const handleDownload = async () => {
    if (!documentUrl || !document) return;

    try {
      const response = await fetch(documentUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = document.name;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: 'Download Started',
        description: `Downloading ${document.name}`,
      });
    } catch (err) {
      console.error('Error downloading document:', err);
      toast({
        title: 'Download Failed',
        description: 'Could not download document',
        variant: 'destructive',
      });
    }
  };

  const handleOpenInNewTab = () => {
    if (documentUrl) {
      window.open(documentUrl, '_blank');
    }
  };

  if (!document) return null;

  // Determine if document can be viewed in iframe
  const canViewInIframe = (fileType: string): boolean => {
    const viewableTypes = [
      'application/pdf',
      'text/plain',
      'text/html',
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/gif',
      'image/webp',
    ];
    return viewableTypes.some(type => fileType.includes(type));
  };

  const isViewable = canViewInIframe(document.file_type);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className={cn(
        "max-w-[95vw] max-h-[95vh] w-[95vw] h-[95vh] p-0 gap-0 bg-background/95 backdrop-blur-md",
        "[&>button]:hidden" // Hide default close button since we have our own
      )}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card/50 backdrop-blur-sm">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <FileText className="w-5 h-5 text-primary flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-lg truncate">{document.alias}</h2>
              <p className="text-sm text-muted-foreground truncate">{document.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {documentUrl && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownload}
                  className="gap-2"
                >
                  <Download className="w-4 h-4" />
                  Download
                </Button>
                {isViewable && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleOpenInNewTab}
                    className="gap-2"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Open
                  </Button>
                )}
              </>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-9 w-9"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden relative bg-muted/30">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-sm z-10">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Loading document...</p>
              </div>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-sm z-10">
              <div className="flex flex-col items-center gap-3 max-w-md text-center px-4">
                <FileText className="w-12 h-12 text-muted-foreground" />
                <div>
                  <p className="font-medium text-foreground mb-1">Unable to load document</p>
                  <p className="text-sm text-muted-foreground">{error}</p>
                </div>
                <Button onClick={handleDownload} variant="outline" className="gap-2">
                  <Download className="w-4 h-4" />
                  Try Download Instead
                </Button>
              </div>
            </div>
          )}

          {documentUrl && !loading && !error && (
            <>
              {isViewable ? (
                <iframe
                  src={documentUrl}
                  className="w-full h-full border-0"
                  title={document.alias}
                  sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
                />
              ) : (
                <div className="flex items-center justify-center h-full p-8">
                  <div className="flex flex-col items-center gap-4 max-w-md text-center">
                    <FileText className="w-16 h-16 text-muted-foreground" />
                    <div>
                      <p className="font-medium text-lg text-foreground mb-2">
                        Preview not available
                      </p>
                      <p className="text-sm text-muted-foreground mb-4">
                        This file type ({document.file_type}) cannot be previewed in the browser.
                        Please download the file to view it.
                      </p>
                    </div>
                    <Button onClick={handleDownload} className="gap-2">
                      <Download className="w-4 h-4" />
                      Download Document
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
