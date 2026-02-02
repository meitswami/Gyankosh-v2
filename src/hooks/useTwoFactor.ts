import { useState, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';

// Two-factor auth features are not yet implemented in the database
// This hook provides a stub implementation

export interface TwoFactorSettings {
  id: string;
  user_id: string;
  is_enabled: boolean;
  backup_codes: string[] | null;
  last_verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export function useTwoFactor(_userId: string | null) {
  const [settings] = useState<TwoFactorSettings | null>(null);
  const [loading] = useState(false);
  const { toast } = useToast();

  const enableTwoFactor = useCallback(async () => {
    toast({ title: '2FA feature coming soon', variant: 'destructive' });
    return null;
  }, [toast]);

  const disableTwoFactor = useCallback(async () => {
    toast({ title: '2FA feature coming soon', variant: 'destructive' });
    return false;
  }, [toast]);

  const verifyCode = useCallback(async (_code: string) => {
    return false;
  }, []);

  return {
    settings,
    loading,
    enableTwoFactor,
    disableTwoFactor,
    verifyCode,
    refetch: () => Promise.resolve(),
  };
}
