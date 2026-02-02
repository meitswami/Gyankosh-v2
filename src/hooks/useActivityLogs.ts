import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

export interface ActivityLog {
  id: string;
  user_id: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  details: Json;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export function useActivityLogs(userId: string | null) {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchLogs = useCallback(async (limit = 50) => {
    if (!userId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('activity_logs')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      setLogs((data || []) as ActivityLog[]);
    } catch (error) {
      console.error('Error fetching activity logs:', error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const logActivity = useCallback(async (
    action: string,
    resourceType: string,
    resourceId?: string,
    details?: Json
  ) => {
    if (!userId) return;

    try {
      await supabase.from('activity_logs').insert({
        user_id: userId,
        action,
        resource_type: resourceType,
        resource_id: resourceId || null,
        details: details || {},
        user_agent: navigator.userAgent,
      });
    } catch (error) {
      console.error('Error logging activity:', error);
    }
  }, [userId]);

  return {
    logs,
    loading,
    fetchLogs,
    logActivity,
  };
}
