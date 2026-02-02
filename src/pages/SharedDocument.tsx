import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { BookOpen, FileText, ArrowLeft, Calendar, Eye, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { getFileIcon } from '@/lib/documentParser';
import { format } from 'date-fns';

interface SharedDocumentData {
  alias: string;
  name: string;
  summary: string | null;
  content_text: string | null;
  file_type: string;
  created_at: string;
  tags: string[] | null;
  category: string | null;
  view_count: number;
}

export default function SharedDocument() {
  const { token } = useParams<{ token: string }>();
  const [docData, setDocData] = useState<SharedDocumentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSharedDocument = async () => {
      if (!token) {
        setError('Invalid share link');
        setLoading(false);
        return;
      }

      try {
        // Get shared document info
        const { data: shareData, error: shareError } = await supabase
          .from('shared_documents')
          .select('document_id, view_count, expires_at')
          .eq('share_token', token)
          .single();

        if (shareError || !shareData) {
          setError('Document not found or link has expired');
          return;
        }

        // Check if link has expired
        if (shareData.expires_at && new Date(shareData.expires_at) < new Date()) {
          setError('This share link has expired');
          return;
        }

        // Get actual document
        const { data: docResult, error: docError } = await supabase
          .from('documents')
          .select('alias, name, summary, content_text, file_type, created_at, tags, category')
          .eq('id', shareData.document_id)
          .single();

        if (docError || !docResult) {
          setError('Document has been deleted');
          return;
        }

        setDocData({
          ...docResult,
          view_count: shareData.view_count,
        });

        // Increment view count
        await supabase
          .from('shared_documents')
          .update({ view_count: shareData.view_count + 1 })
          .eq('share_token', token);
      } catch (err) {
        console.error('Error fetching shared document:', err);
        setError('Failed to load shared document');
      } finally {
        setLoading(false);
      }
    };

    fetchSharedDocument();
  }, [token]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !docData) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-background p-4">
        <div className="text-center space-y-4">
          <FileText className="w-16 h-16 mx-auto text-muted-foreground/50" />
          <h1 className="text-2xl font-bold text-foreground">Document Not Found</h1>
          <p className="text-muted-foreground max-w-md">
            {error || 'This shared document may have been deleted or the link is invalid.'}
          </p>
          <Button asChild>
            <Link to="/">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Go to Gyankosh
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border bg-card/95 backdrop-blur px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="font-semibold text-lg text-foreground flex items-center gap-2">
                <span className="text-xl">{getFileIcon(docData.file_type)}</span>
                {docData.alias}
              </h1>
              <p className="text-xs text-muted-foreground">{docData.name}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link to="/">
              Try Gyankosh
            </Link>
          </Button>
        </div>
      </header>

      {/* Document Content */}
      <main className="max-w-4xl mx-auto p-6">
        {/* Metadata */}
        <div className="bg-muted/50 rounded-lg p-4 mb-6 space-y-3">
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              {format(new Date(docData.created_at), 'MMM d, yyyy')}
            </span>
            <span className="flex items-center gap-1">
              <Eye className="w-4 h-4" />
              {docData.view_count + 1} views
            </span>
            {docData.category && (
              <Badge variant="outline">{docData.category}</Badge>
            )}
          </div>
          
          {docData.tags && docData.tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <Tag className="w-4 h-4 text-muted-foreground" />
              {docData.tags.map((tag) => (
                <Badge key={tag} variant="secondary">{tag}</Badge>
              ))}
            </div>
          )}
          
          {docData.summary && (
            <p className="text-sm text-foreground">{docData.summary}</p>
          )}
        </div>

        {/* Content */}
        <div className="bg-card rounded-lg border border-border">
          <div className="p-4 border-b border-border">
            <h2 className="font-medium text-foreground">Document Content</h2>
          </div>
          <ScrollArea className="h-[calc(100vh-400px)]">
            <div className="p-6">
              <pre className="whitespace-pre-wrap font-sans text-sm text-foreground leading-relaxed">
                {docData.content_text || 'No content available'}
              </pre>
            </div>
          </ScrollArea>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-background/95 backdrop-blur p-4 mt-6">
        <p className="text-center text-xs text-muted-foreground">
          This is a shared document from{' '}
          <Link to="/" className="text-primary hover:underline font-medium">
            Gyankosh - ज्ञानकोष
          </Link>
        </p>
      </footer>
    </div>
  );
}
