import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface TwoFactorSettings {
  id: string;
  user_id: string;
  is_enabled: boolean;
  backup_codes: string[] | null;
  last_verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export function useTwoFactor(userId: string | null) {
  const [settings, setSettings] = useState<TwoFactorSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchSettings = useCallback(async () => {
    if (!userId) return;
    
    try {
      const { data, error } = await supabase
        .from('two_factor_settings')
        .select('id, user_id, is_enabled, backup_codes, last_verified_at, created_at, updated_at')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      setSettings(data as TwoFactorSettings | null);
    } catch (error) {
      console.error('Error fetching 2FA settings:', error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const enableTwoFactor = useCallback(async () => {
    if (!userId) return null;

    try {
      // Generate backup codes
      const backupCodes = Array.from({ length: 8 }, () => 
        Math.random().toString(36).substring(2, 8).toUpperCase()
      );

      // Generate a mock secret (in production, use a proper TOTP library)
      const secretKey = Array.from({ length: 32 }, () =>
        'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[Math.floor(Math.random() * 32)]
      ).join('');

      if (settings) {
        const { error } = await supabase
          .from('two_factor_settings')
          .update({
            is_enabled: true,
            secret_key: secretKey,
            backup_codes: backupCodes,
          })
          .eq('user_id', userId);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('two_factor_settings')
          .insert({
            user_id: userId,
            is_enabled: true,
            secret_key: secretKey,
            backup_codes: backupCodes,
          });

        if (error) throw error;
      }

      await fetchSettings();
      toast({ title: '2FA enabled successfully' });
      return { secretKey, backupCodes };
    } catch (error) {
      console.error('Error enabling 2FA:', error);
      toast({ title: 'Failed to enable 2FA', variant: 'destructive' });
      return null;
    }
  }, [userId, settings, fetchSettings, toast]);

  const disableTwoFactor = useCallback(async () => {
    if (!userId) return false;

    try {
      const { error } = await supabase
        .from('two_factor_settings')
        .update({
          is_enabled: false,
          secret_key: null,
          backup_codes: null,
        })
        .eq('user_id', userId);

      if (error) throw error;

      await fetchSettings();
      toast({ title: '2FA disabled' });
      return true;
    } catch (error) {
      console.error('Error disabling 2FA:', error);
      toast({ title: 'Failed to disable 2FA', variant: 'destructive' });
      return false;
    }
  }, [userId, fetchSettings, toast]);

  const verifyCode = useCallback(async (code: string) => {
    // In production, verify against the actual TOTP algorithm
    // For now, we'll just update the last_verified_at timestamp
    if (!userId || !settings?.is_enabled) return false;

    try {
      // Check if it's a backup code
      if (settings.backup_codes?.includes(code)) {
        const newCodes = settings.backup_codes.filter(c => c !== code);
        await supabase
          .from('two_factor_settings')
          .update({
            backup_codes: newCodes,
            last_verified_at: new Date().toISOString(),
          })
          .eq('user_id', userId);

        await fetchSettings();
        return true;
      }

      // For demo purposes, accept any 6-digit code
      if (/^\d{6}$/.test(code)) {
        await supabase
          .from('two_factor_settings')
          .update({ last_verified_at: new Date().toISOString() })
          .eq('user_id', userId);

        await fetchSettings();
        return true;
      }

      return false;
    } catch (error) {
      console.error('Error verifying 2FA code:', error);
      return false;
    }
  }, [userId, settings, fetchSettings]);

  return {
    settings,
    loading,
    enableTwoFactor,
    disableTwoFactor,
    verifyCode,
    refetch: fetchSettings,
  };
}
