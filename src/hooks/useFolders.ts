import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Document } from '@/hooks/useDocuments';

export interface Folder {
  id: string;
  user_id: string;
  name: string;
  parent_id: string | null;
  folder_type: 'system' | 'custom';
  icon: string | null;
  color: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// System folder definitions
export const SYSTEM_FOLDERS = [
  { name: 'Documents', icon: '📄', types: ['pdf', 'docx', 'doc', 'txt', 'rtf', 'odt'] },
  { name: 'Spreadsheets', icon: '📊', types: ['xlsx', 'xls', 'csv'] },
  { name: 'Presentations', icon: '📽️', types: ['pptx', 'ppt'] },
  { name: 'Images', icon: '🖼️', types: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'] },
  { name: 'Audio', icon: '🎵', types: ['mp3', 'wav', 'ogg', 'm4a', 'flac'] },
  { name: 'Video', icon: '🎬', types: ['mp4', 'webm', 'mov', 'avi', 'mkv'] },
  { name: 'Recordings', icon: '🎙️', types: ['recording'] },
] as const;

export function useFolders() {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchFolders = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setLoading(false);
      setFolders([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('user_folders')
        .select('*')
        .order('sort_order', { ascending: true });

      if (error) throw error;
      setFolders((data || []) as Folder[]);
    } catch (error) {
      console.error('Error fetching folders:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const createFolder = useCallback(async (
    name: string,
    parentId: string | null = null,
    icon?: string,
    color?: string
  ): Promise<Folder | null> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast({ title: 'Error', description: 'Please login first', variant: 'destructive' });
      return null;
    }

    try {
      const { data, error } = await supabase
        .from('user_folders')
        .insert({
          user_id: user.id,
          name,
          parent_id: parentId,
          folder_type: 'custom',
          icon,
          color,
          sort_order: folders.length,
        })
        .select()
        .single();

      if (error) throw error;
      setFolders(prev => [...prev, data as Folder]);
      toast({ title: 'Folder created', description: `"${name}" folder created` });
      return data as Folder;
    } catch (error: unknown) {
      console.error('Error creating folder:', error);
      const message = error instanceof Error && error.message.includes('duplicate')
        ? 'A folder with this name already exists'
        : 'Failed to create folder';
      toast({ title: 'Error', description: message, variant: 'destructive' });
      return null;
    }
  }, [folders.length, toast]);

  const updateFolder = useCallback(async (
    id: string,
    updates: Partial<Pick<Folder, 'name' | 'icon' | 'color' | 'sort_order'>>
  ): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('user_folders')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
      setFolders(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
      return true;
    } catch (error) {
      console.error('Error updating folder:', error);
      toast({ title: 'Error', description: 'Failed to update folder', variant: 'destructive' });
      return false;
    }
  }, [toast]);

  const deleteFolder = useCallback(async (id: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('user_folders')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setFolders(prev => prev.filter(f => f.id !== id));
      toast({ title: 'Folder deleted' });
      return true;
    } catch (error) {
      console.error('Error deleting folder:', error);
      toast({ title: 'Error', description: 'Failed to delete folder', variant: 'destructive' });
      return false;
    }
  }, [toast]);

  const moveDocumentToFolder = useCallback(async (
    documentId: string,
    folderId: string | null
  ): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('documents')
        .update({ folder_id: folderId })
        .eq('id', documentId);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error moving document:', error);
      return false;
    }
  }, []);

  // Get file type category for auto-organization
  const getFileCategory = useCallback((fileType: string): string => {
    const ext = fileType.split('/').pop()?.toLowerCase() || fileType.toLowerCase();
    for (const folder of SYSTEM_FOLDERS) {
      if ((folder.types as readonly string[]).includes(ext)) {
        return folder.name;
      }
    }
    return 'Documents'; // Default
  }, []);

  // Organize documents by category (system folders)
  const organizeByType = useCallback((documents: Document[]): Record<string, Document[]> => {
    const organized: Record<string, Document[]> = {} as Record<string, Document[]>;
    
    // Initialize all system folders
    for (const f of SYSTEM_FOLDERS) {
      organized[f.name] = [];
    }
    documents.forEach(doc => {
      const category = getFileCategory(doc.file_type);
      if (!organized[category]) organized[category] = [];
      organized[category].push(doc);
    });

    return organized;
  }, [getFileCategory]);

  // Custom folders (user-created)
  const customFolders = useMemo(() => 
    folders.filter(f => f.folder_type === 'custom'),
    [folders]
  );

  useEffect(() => {
    fetchFolders();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) fetchFolders();
      else if (event === 'SIGNED_OUT') {
        setFolders([]);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchFolders]);

  return {
    folders,
    customFolders,
    loading,
    createFolder,
    updateFolder,
    deleteFolder,
    moveDocumentToFolder,
    getFileCategory,
    organizeByType,
    refetch: fetchFolders,
  };
}
