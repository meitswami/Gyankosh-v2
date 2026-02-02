import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface ViewNotification {
  id: string;
  type: 'document' | 'chat';
  itemName: string;
  viewedAt: Date;
}

export function useViewNotifications(userId: string | undefined) {
  const [notifications, setNotifications] = useState<ViewNotification[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    if (!userId) return;

    // Subscribe to shared_documents view count changes
    const docChannel = supabase
      .channel('shared-doc-views')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'shared_documents',
          filter: `user_id=eq.${userId}`,
        },
        async (payload) => {
          const oldCount = (payload.old as any)?.view_count || 0;
          const newCount = (payload.new as any)?.view_count || 0;
          
          if (newCount > oldCount) {
            // Fetch document name
            const { data: doc } = await supabase
              .from('documents')
              .select('alias')
              .eq('id', (payload.new as any).document_id)
              .single();

            const notification: ViewNotification = {
              id: crypto.randomUUID(),
              type: 'document',
              itemName: doc?.alias || 'Document',
              viewedAt: new Date(),
            };

            setNotifications(prev => [notification, ...prev.slice(0, 9)]);
            
            toast({
              title: '👁️ New View!',
              description: `Someone viewed your shared document "${doc?.alias || 'Document'}"`,
            });
          }
        }
      )
      .subscribe();

    // Subscribe to shared_chats views - note: realtime subscriptions require appropriate RLS
    // The owner can still receive notifications via their own SELECT policy
    const chatChannel = supabase
      .channel('shared-chat-views')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'shared_chats',
          filter: `user_id=eq.${userId}`,
        },
        async (payload) => {
          const oldCount = (payload.old as any)?.view_count || 0;
          const newCount = (payload.new as any)?.view_count || 0;
          
          if (newCount > oldCount) {
            const notification: ViewNotification = {
              id: crypto.randomUUID(),
              type: 'chat',
              itemName: (payload.new as any).title || 'Chat',
              viewedAt: new Date(),
            };

            setNotifications(prev => [notification, ...prev.slice(0, 9)]);
            
            toast({
              title: '👁️ New View!',
              description: `Someone viewed your shared chat "${(payload.new as any).title || 'Chat'}"`,
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(docChannel);
      supabase.removeChannel(chatChannel);
    };
  }, [userId, toast]);

  const clearNotifications = () => setNotifications([]);

  return { notifications, clearNotifications };
}
