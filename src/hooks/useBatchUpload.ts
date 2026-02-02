import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { UploadStage } from '@/components/UploadProgress';

export interface FileUploadStatus {
  id: string;
  file: File;
  stage: UploadStage;
  progress: number;
  error?: string;
  documentId?: string;
}

interface UseBatchUploadOptions {
  maxConcurrent?: number;
  onComplete?: (results: FileUploadStatus[]) => void;
}

const PARSE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-document`;

export function useBatchUpload(options: UseBatchUploadOptions = {}) {
  const { maxConcurrent = 3, onComplete } = options;
  const [uploads, setUploads] = useState<FileUploadStatus[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();
  const activeCount = useRef(0);
  const queueRef = useRef<FileUploadStatus[]>([]);

  const updateUpload = useCallback((id: string, updates: Partial<FileUploadStatus>) => {
    setUploads(prev => prev.map(u => u.id === id ? { ...u, ...updates } : u));
  }, []);

  const processFile = useCallback(async (upload: FileUploadStatus): Promise<FileUploadStatus> => {
    const { id, file } = upload;
    
    try {
      // Stage 1: Uploading
      updateUpload(id, { stage: 'uploading', progress: 15 });
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      // Stage 2: Extracting text
      updateUpload(id, { stage: 'extracting', progress: 45 });
      
      const formData = new FormData();
      formData.append('file', file);

      const parseResponse = await fetch(PARSE_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: formData,
      });

      if (!parseResponse.ok) {
        const error = await parseResponse.json().catch(() => ({}));
        throw new Error(error.error || 'Failed to parse document');
      }

      const { content } = await parseResponse.json();
      
      // Stage 3: AI Analysis
      updateUpload(id, { stage: 'analyzing', progress: 75 });
      
      // Generate summary using AI
      const summaryResponse = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-with-document`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            messages: [],
            documentContent: content,
            documentName: file.name,
            action: 'summarize',
          }),
        }
      );

      let summary = { documentType: 'Document', summary: 'No summary available', alias: file.name.replace(/\.[^/.]+$/, '') };
      
      if (summaryResponse.ok && summaryResponse.body) {
        const reader = summaryResponse.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ') && !line.includes('[DONE]')) {
              try {
                const json = JSON.parse(line.slice(6));
                fullText += json.choices?.[0]?.delta?.content || '';
              } catch {}
            }
          }
        }
        
        try {
          const parsed = JSON.parse(fullText);
          summary = {
            documentType: parsed.documentType || 'Document',
            summary: parsed.summary || 'No summary available',
            alias: parsed.alias || file.name.replace(/\.[^/.]+$/, ''),
          };
        } catch {}
      }

      // Upload to storage
      const filePath = `${session.user.id}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Save to database
      const { data: doc, error: dbError } = await supabase
        .from('documents')
        .insert({
          name: file.name,
          alias: summary.alias,
          summary: `${summary.documentType}: ${summary.summary}`,
          file_path: filePath,
          file_type: file.type || 'unknown',
          file_size: file.size,
          content_text: content,
          user_id: session.user.id,
        })
        .select()
        .single();

      if (dbError) throw dbError;

      // Stage 4: Complete
      updateUpload(id, { stage: 'complete', progress: 100, documentId: doc.id });
      
      return { ...upload, stage: 'complete', progress: 100, documentId: doc.id };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Upload failed';
      updateUpload(id, { error: errorMsg, progress: 0 });
      return { ...upload, error: errorMsg };
    }
  }, [updateUpload]);

  const processQueue = useCallback(async () => {
    while (queueRef.current.length > 0 && activeCount.current < maxConcurrent) {
      const next = queueRef.current.shift();
      if (!next) break;
      
      activeCount.current++;
      
      processFile(next).finally(() => {
        activeCount.current--;
        processQueue();
      });
    }
    
    // Check if all done
    if (activeCount.current === 0 && queueRef.current.length === 0) {
      setIsUploading(false);
      setUploads(prev => {
        const completed = prev.filter(u => u.stage === 'complete');
        const failed = prev.filter(u => u.error);
        
        if (completed.length > 0) {
          toast({
            title: 'Upload Complete',
            description: `${completed.length} document${completed.length > 1 ? 's' : ''} uploaded successfully${failed.length > 0 ? `, ${failed.length} failed` : ''}`,
          });
        }
        
        onComplete?.(prev);
        return prev;
      });
    }
  }, [maxConcurrent, processFile, toast, onComplete]);

  const uploadFiles = useCallback((files: File[]) => {
    const newUploads: FileUploadStatus[] = files.map(file => ({
      id: crypto.randomUUID(),
      file,
      stage: 'uploading' as const,
      progress: 0,
    }));

    setUploads(prev => [...prev, ...newUploads]);
    queueRef.current.push(...newUploads);
    setIsUploading(true);
    
    processQueue();
  }, [processQueue]);

  const clearCompleted = useCallback(() => {
    setUploads(prev => prev.filter(u => u.stage !== 'complete' && !u.error));
  }, []);

  const cancelUpload = useCallback((id: string) => {
    queueRef.current = queueRef.current.filter(u => u.id !== id);
    setUploads(prev => prev.filter(u => u.id !== id));
  }, []);

  return {
    uploads,
    isUploading,
    uploadFiles,
    clearCompleted,
    cancelUpload,
  };
}
