import { useState, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';

// User settings and signatures are not yet implemented in the database
// This hook provides a stub implementation with localStorage fallback

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

const LOCAL_STORAGE_KEY = 'user_settings';
const LOCAL_SIGNATURES_KEY = 'user_signatures';

export function useUserSettings(userId: string | null) {
  const [settings, setSettings] = useState<UserSettings | null>(() => {
    if (!userId) return null;
    const stored = localStorage.getItem(`${LOCAL_STORAGE_KEY}_${userId}`);
    return stored ? JSON.parse(stored) : null;
  });
  
  const [signatures, setSignatures] = useState<UserSignature[]>(() => {
    if (!userId) return [];
    const stored = localStorage.getItem(`${LOCAL_SIGNATURES_KEY}_${userId}`);
    return stored ? JSON.parse(stored) : [];
  });
  
  const [loading] = useState(false);
  const { toast } = useToast();

  const updateSettings = useCallback(async (updates: Partial<UserSettings>) => {
    if (!userId) return false;

    try {
      const newSettings: UserSettings = {
        id: userId,
        user_id: userId,
        first_name: null,
        last_name: null,
        designation: null,
        company: null,
        phone: null,
        logo_url: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...settings,
        ...updates,
      };
      
      localStorage.setItem(`${LOCAL_STORAGE_KEY}_${userId}`, JSON.stringify(newSettings));
      setSettings(newSettings);
      toast({ title: 'Settings saved' });
      return true;
    } catch (error) {
      console.error('Error saving settings:', error);
      toast({ title: 'Failed to save settings', variant: 'destructive' });
      return false;
    }
  }, [userId, settings, toast]);

  const addSignature = useCallback(async (signature: Omit<UserSignature, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => {
    if (!userId) return false;

    if (signatures.length >= 3) {
      toast({ title: 'Maximum 3 signatures allowed', variant: 'destructive' });
      return false;
    }

    try {
      const newSig: UserSignature = {
        id: crypto.randomUUID(),
        user_id: userId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...signature,
      };
      
      const newSignatures = [...signatures, newSig];
      localStorage.setItem(`${LOCAL_SIGNATURES_KEY}_${userId}`, JSON.stringify(newSignatures));
      setSignatures(newSignatures);
      toast({ title: 'Signature added' });
      return true;
    } catch (error) {
      console.error('Error adding signature:', error);
      toast({ title: 'Failed to add signature', variant: 'destructive' });
      return false;
    }
  }, [userId, signatures, toast]);

  const updateSignature = useCallback(async (id: string, updates: Partial<UserSignature>) => {
    if (!userId) return false;

    try {
      const newSignatures = signatures.map(s => 
        s.id === id ? { ...s, ...updates, updated_at: new Date().toISOString() } : s
      );
      localStorage.setItem(`${LOCAL_SIGNATURES_KEY}_${userId}`, JSON.stringify(newSignatures));
      setSignatures(newSignatures);
      toast({ title: 'Signature updated' });
      return true;
    } catch (error) {
      console.error('Error updating signature:', error);
      toast({ title: 'Failed to update signature', variant: 'destructive' });
      return false;
    }
  }, [userId, signatures, toast]);

  const deleteSignature = useCallback(async (id: string) => {
    if (!userId) return false;

    try {
      const newSignatures = signatures.filter(s => s.id !== id);
      localStorage.setItem(`${LOCAL_SIGNATURES_KEY}_${userId}`, JSON.stringify(newSignatures));
      setSignatures(newSignatures);
      toast({ title: 'Signature deleted' });
      return true;
    } catch (error) {
      console.error('Error deleting signature:', error);
      toast({ title: 'Failed to delete signature', variant: 'destructive' });
      return false;
    }
  }, [userId, signatures, toast]);

  const setDefaultSignature = useCallback(async (id: string) => {
    if (!userId) return false;

    try {
      const newSignatures = signatures.map(s => ({
        ...s,
        is_default: s.id === id,
        updated_at: new Date().toISOString(),
      }));
      localStorage.setItem(`${LOCAL_SIGNATURES_KEY}_${userId}`, JSON.stringify(newSignatures));
      setSignatures(newSignatures);
      return true;
    } catch (error) {
      console.error('Error setting default signature:', error);
      return false;
    }
  }, [userId, signatures]);

  const uploadLogo = useCallback(async (_file: File) => {
    toast({ title: 'Logo upload feature coming soon', variant: 'destructive' });
    return null;
  }, [toast]);

  const getFormattedSignature = useCallback((type?: 'formal' | 'semi-formal' | 'casual') => {
    let sig = signatures.find(s => s.is_default);
    if (type) {
      sig = signatures.find(s => s.type === type) || sig;
    }
    if (!sig && signatures.length > 0) {
      sig = signatures[0];
    }

    if (sig) return sig.content;

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
    refetch: () => Promise.resolve(),
  };
}
