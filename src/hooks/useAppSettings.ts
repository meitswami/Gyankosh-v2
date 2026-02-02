import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface AppSettings {
  kb_public_access: {
    enabled: boolean;
  };
  local_ai: {
    enabled: boolean;
    ollama_url: string;
    model_name: string;
  };
}

const DEFAULT_SETTINGS: AppSettings = {
  kb_public_access: { enabled: false },
  local_ai: {
    enabled: false,
    ollama_url: 'http://localhost:11434',
    model_name: 'llama3.1',
  },
};

const LOCAL_STORAGE_KEY = 'genxai_local_ai_settings';

export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings>(() => {
    // Initialize from localStorage if available
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return { ...DEFAULT_SETTINGS, local_ai: parsed };
      } catch (e) {
        console.error('Error parsing local AI settings:', e);
      }
    }
    return DEFAULT_SETTINGS;
  });
  const [loading, setLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('setting_key, setting_value')
        .eq('setting_key', 'kb_public_access')
        .single();

      if (error && error.code !== 'PGRST116') throw error; // PGRST116 is "No rows found"

      if (data) {
        setSettings(prev => ({
          ...prev,
          kb_public_access: data.setting_value as { enabled: boolean }
        }));
      }
    } catch (error) {
      console.error('Error fetching global app settings:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Real-time subscription for settings changes
  useEffect(() => {
    fetchSettings();

    const channel = supabase
      .channel('app-settings-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'app_settings',
        },
        () => {
          fetchSettings();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchSettings]);

  const updateKBPublicAccess = useCallback(async (enabled: boolean) => {
    try {
      const { error } = await supabase
        .from('app_settings')
        .update({
          setting_value: { enabled },
          updated_at: new Date().toISOString(),
        })
        .eq('setting_key', 'kb_public_access');

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error updating KB access:', error);
      return false;
    }
  }, []);

  const updateLocalAiSettings = useCallback(async (localSettings: Partial<AppSettings['local_ai']>) => {
    try {
      const newValue = { ...settings.local_ai, ...localSettings };
      setSettings(prev => ({ ...prev, local_ai: newValue }));
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(newValue));
      return true;
    } catch (error) {
      console.error('Error updating local AI settings:', error);
      return false;
    }
  }, [settings.local_ai]);

  return {
    settings,
    loading,
    updateKBPublicAccess,
    updateLocalAiSettings,
    refetch: fetchSettings,
    isKBPublicAccessEnabled: settings.kb_public_access.enabled,
    isLocalAiEnabled: settings.local_ai.enabled,
  };
}
