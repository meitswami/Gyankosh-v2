import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface UserSettings {
  id: string;
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  designation: string | null;
  company: string | null;
  phone: string | null;
  logo_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserSignature {
  id: string;
  user_id: string;
  name: string;
  type: 'formal' | 'semi-formal' | 'casual';
  content: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export function useUserSettings(userId: string | null) {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [signatures, setSignatures] = useState<UserSignature[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchSettings = useCallback(async () => {
    if (!userId) return;
    
    try {
      // Fetch settings
      const { data: settingsData, error: settingsError } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (settingsError && settingsError.code !== 'PGRST116') {
        throw settingsError;
      }

      setSettings(settingsData as UserSettings | null);

      // Fetch signatures
      const { data: signaturesData, error: signaturesError } = await supabase
        .from('user_signatures')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

      if (signaturesError) throw signaturesError;
      setSignatures((signaturesData || []) as UserSignature[]);
    } catch (error) {
      console.error('Error fetching user settings:', error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const updateSettings = useCallback(async (updates: Partial<UserSettings>) => {
    if (!userId) return false;

    try {
      if (settings) {
        // Update existing
        const { error } = await supabase
          .from('user_settings')
          .update(updates)
          .eq('user_id', userId);
        if (error) throw error;
      } else {
        // Insert new
        const { error } = await supabase
          .from('user_settings')
          .insert({ user_id: userId, ...updates });
        if (error) throw error;
      }

      await fetchSettings();
      toast({ title: 'Settings saved' });
      return true;
    } catch (error) {
      console.error('Error saving settings:', error);
      toast({ title: 'Failed to save settings', variant: 'destructive' });
      return false;
    }
  }, [userId, settings, fetchSettings, toast]);

  const addSignature = useCallback(async (signature: Omit<UserSignature, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => {
    if (!userId) return false;

    // Check limit
    if (signatures.length >= 3) {
      toast({ title: 'Maximum 3 signatures allowed', variant: 'destructive' });
      return false;
    }

    try {
      const { error } = await supabase
        .from('user_signatures')
        .insert({ user_id: userId, ...signature });

      if (error) throw error;

      await fetchSettings();
      toast({ title: 'Signature added' });
      return true;
    } catch (error) {
      console.error('Error adding signature:', error);
      toast({ title: 'Failed to add signature', variant: 'destructive' });
      return false;
    }
  }, [userId, signatures.length, fetchSettings, toast]);

  const updateSignature = useCallback(async (id: string, updates: Partial<UserSignature>) => {
    if (!userId) return false;

    try {
      const { error } = await supabase
        .from('user_signatures')
        .update(updates)
        .eq('id', id)
        .eq('user_id', userId);

      if (error) throw error;

      await fetchSettings();
      toast({ title: 'Signature updated' });
      return true;
    } catch (error) {
      console.error('Error updating signature:', error);
      toast({ title: 'Failed to update signature', variant: 'destructive' });
      return false;
    }
  }, [userId, fetchSettings, toast]);

  const deleteSignature = useCallback(async (id: string) => {
    if (!userId) return false;

    try {
      const { error } = await supabase
        .from('user_signatures')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

      if (error) throw error;

      await fetchSettings();
      toast({ title: 'Signature deleted' });
      return true;
    } catch (error) {
      console.error('Error deleting signature:', error);
      toast({ title: 'Failed to delete signature', variant: 'destructive' });
      return false;
    }
  }, [userId, fetchSettings, toast]);

  const setDefaultSignature = useCallback(async (id: string) => {
    if (!userId) return false;

    try {
      // First, unset all defaults
      await supabase
        .from('user_signatures')
        .update({ is_default: false })
        .eq('user_id', userId);

      // Set the selected one as default
      const { error } = await supabase
        .from('user_signatures')
        .update({ is_default: true })
        .eq('id', id)
        .eq('user_id', userId);

      if (error) throw error;

      await fetchSettings();
      return true;
    } catch (error) {
      console.error('Error setting default signature:', error);
      return false;
    }
  }, [userId, fetchSettings]);

  const uploadLogo = useCallback(async (file: File) => {
    if (!userId) return null;

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${userId}/logo.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('documents')
        .getPublicUrl(fileName);

      await updateSettings({ logo_url: publicUrl });
      return publicUrl;
    } catch (error) {
      console.error('Error uploading logo:', error);
      toast({ title: 'Failed to upload logo', variant: 'destructive' });
      return null;
    }
  }, [userId, updateSettings, toast]);

  // Get formatted signature for templates
  const getFormattedSignature = useCallback((type?: 'formal' | 'semi-formal' | 'casual') => {
    let sig = signatures.find(s => s.is_default);
    if (type) {
      sig = signatures.find(s => s.type === type) || sig;
    }
    if (!sig && signatures.length > 0) {
      sig = signatures[0];
    }

    if (sig) return sig.content;

    // Default signature from settings
    const name = [settings?.first_name, settings?.last_name].filter(Boolean).join(' ') || 'Your Name';
    const parts = ['Warm Regards,', name];
    if (settings?.designation) parts.push(settings.designation);
    if (settings?.company) parts.push(settings.company);
    
    return parts.join('\n');
  }, [signatures, settings]);

  return {
    settings,
    signatures,
    loading,
    updateSettings,
    addSignature,
    updateSignature,
    deleteSignature,
    setDefaultSignature,
    uploadLogo,
    getFormattedSignature,
    refetch: fetchSettings,
  };
}
