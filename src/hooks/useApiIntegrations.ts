import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface ApiIntegration {
  id: string;
  user_id: string;
  name: string;
  base_url: string;
  api_key_encrypted: string | null;
  headers: Record<string, string>;
  description: string | null;
  icon: string;
  is_active: boolean;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

export function useApiIntegrations(userId: string | null) {
  const [integrations, setIntegrations] = useState<ApiIntegration[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchIntegrations = useCallback(async () => {
    if (!userId) return;
    
    try {
      const { data, error } = await supabase
        .from('api_integrations')
        .select('*')
        .eq('user_id', userId)
        .order('name', { ascending: true });

      if (error) throw error;
      setIntegrations((data || []) as ApiIntegration[]);
    } catch (error) {
      console.error('Error fetching integrations:', error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchIntegrations();
  }, [fetchIntegrations]);

  const addIntegration = useCallback(async (integration: Omit<ApiIntegration, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'last_used_at'>) => {
    if (!userId) return null;

    try {
      const { data, error } = await supabase
        .from('api_integrations')
        .insert({ user_id: userId, ...integration })
        .select()
        .single();

      if (error) throw error;

      await fetchIntegrations();
      toast({ title: 'Integration added' });
      return data;
    } catch (error) {
      console.error('Error adding integration:', error);
      toast({ title: 'Failed to add integration', variant: 'destructive' });
      return null;
    }
  }, [userId, fetchIntegrations, toast]);

  const updateIntegration = useCallback(async (id: string, updates: Partial<ApiIntegration>) => {
    if (!userId) return false;

    try {
      const { error } = await supabase
        .from('api_integrations')
        .update(updates)
        .eq('id', id)
        .eq('user_id', userId);

      if (error) throw error;

      await fetchIntegrations();
      toast({ title: 'Integration updated' });
      return true;
    } catch (error) {
      console.error('Error updating integration:', error);
      toast({ title: 'Failed to update integration', variant: 'destructive' });
      return false;
    }
  }, [userId, fetchIntegrations, toast]);

  const deleteIntegration = useCallback(async (id: string) => {
    if (!userId) return false;

    try {
      const { error } = await supabase
        .from('api_integrations')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

      if (error) throw error;

      await fetchIntegrations();
      toast({ title: 'Integration deleted' });
      return true;
    } catch (error) {
      console.error('Error deleting integration:', error);
      toast({ title: 'Failed to delete integration', variant: 'destructive' });
      return false;
    }
  }, [userId, fetchIntegrations, toast]);

  const callApi = useCallback(async (integrationId: string, endpoint: string, options?: RequestInit) => {
    const integration = integrations.find(i => i.id === integrationId);
    if (!integration || !integration.is_active) {
      throw new Error('Integration not found or inactive');
    }

    const url = `${integration.base_url}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...integration.headers,
    };

    if (integration.api_key_encrypted) {
      headers['Authorization'] = `Bearer ${integration.api_key_encrypted}`;
    }

    const response = await fetch(url, {
      ...options,
      headers: { ...headers, ...options?.headers },
    });

    // Update last_used_at
    await supabase
      .from('api_integrations')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', integrationId);

    return response;
  }, [integrations]);

  return {
    integrations,
    loading,
    addIntegration,
    updateIntegration,
    deleteIntegration,
    callApi,
    refetch: fetchIntegrations,
  };
}
