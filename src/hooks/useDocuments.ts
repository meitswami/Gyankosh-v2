import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface Document {
  id: string;
  name: string;
  alias: string;
  summary: string | null;
  file_path: string;
  file_type: string;
  file_size: number | null;
  content_text: string | null;
  created_at: string;
  updated_at: string;
  user_id: string | null;
  tags: string[] | null;
  category: string | null;
}

export function useDocuments() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchDocuments = async () => {
    // Check if user is authenticated before fetching
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setLoading(false);
      setDocuments([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDocuments(data || []);
    } catch (error) {
      console.error('Error fetching documents:', error);
      // Only show error if user is logged in (otherwise they'll be redirected)
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (currentSession) {
        toast({
          title: 'Error',
          description: 'Failed to load documents',
          variant: 'destructive',
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const uploadDocument = async (
    file: File,
    contentText: string,
    summary: { documentType: string; summary: string; alias: string }
  ): Promise<Document | null> => {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: 'Error',
          description: 'Please login to upload documents',
          variant: 'destructive',
        });
        return null;
      }

      // Upload file to storage with user_id folder structure
      const filePath = `${user.id}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Save document metadata with user_id
      const { data, error } = await supabase
        .from('documents')
        .insert({
          name: file.name,
          alias: summary.alias,
          summary: `${summary.documentType}: ${summary.summary}`,
          file_path: filePath,
          file_type: file.type || 'unknown',
          file_size: file.size,
          content_text: contentText,
          user_id: user.id,
        })
        .select()
        .single();

      if (error) throw error;

      setDocuments(prev => [data, ...prev]);
      return data;
    } catch (error) {
      console.error('Error uploading document:', error);
      toast({
        title: 'Upload Failed',
        description: 'Could not save document to knowledge base',
        variant: 'destructive',
      });
      return null;
    }
  };

  const deleteDocument = async (id: string) => {
    try {
      const doc = documents.find(d => d.id === id);
      if (doc) {
        await supabase.storage.from('documents').remove([doc.file_path]);
      }

      const { error } = await supabase
        .from('documents')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setDocuments(prev => prev.filter(d => d.id !== id));
      toast({
        title: 'Document Deleted',
        description: 'Removed from knowledge base',
      });
    } catch (error) {
      console.error('Error deleting document:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete document',
        variant: 'destructive',
      });
    }
  };

  useEffect(() => {
    // Wait for auth state to be ready before fetching
    let mounted = true;
    
    const init = async () => {
      // Wait for auth to initialize
      const { data: { session } } = await supabase.auth.getSession();
      
      if (mounted) {
        if (session) {
          await fetchDocuments();
        } else {
          setLoading(false);
          setDocuments([]);
        }
      }
    };

    // Listen for auth changes and fetch when signed in
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (mounted) {
        if (event === 'SIGNED_IN' && session) {
          await fetchDocuments();
        } else if (event === 'SIGNED_OUT') {
          setDocuments([]);
          setLoading(false);
        }
      }
    });

    init();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return {
    documents,
    loading,
    uploadDocument,
    deleteDocument,
    refetch: fetchDocuments,
  };
}
