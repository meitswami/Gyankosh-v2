import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  owner_id: string;
  settings: Record<string, unknown>;
  usage_limits: { documents: number; chats: number };
  current_usage: { documents: number; chats: number };
  created_at: string;
  updated_at: string;
}

export interface OrgMember {
  user_id: string;
  role: 'admin' | 'moderator' | 'user';
  organization_id: string;
}

export function useOrganizations(userId: string | null) {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [currentOrg, setCurrentOrg] = useState<Organization | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchOrganizations = useCallback(async () => {
    if (!userId) return;
    
    try {
      const { data, error } = await supabase
        .from('organizations')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      setOrganizations((data || []) as Organization[]);
      
      // Set first org as current if none selected
      if (data && data.length > 0 && !currentOrg) {
        setCurrentOrg(data[0] as Organization);
      }
    } catch (error) {
      console.error('Error fetching organizations:', error);
    } finally {
      setLoading(false);
    }
  }, [userId, currentOrg]);

  const fetchMembers = useCallback(async (orgId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('user_id, role, organization_id')
        .eq('organization_id', orgId);

      if (error) throw error;
      setMembers((data || []) as OrgMember[]);
    } catch (error) {
      console.error('Error fetching members:', error);
    }
  }, []);

  useEffect(() => {
    fetchOrganizations();
  }, [fetchOrganizations]);

  useEffect(() => {
    if (currentOrg) {
      fetchMembers(currentOrg.id);
    }
  }, [currentOrg, fetchMembers]);

  const createOrganization = useCallback(async (name: string, slug: string) => {
    if (!userId) return null;

    try {
      const { data, error } = await supabase
        .from('organizations')
        .insert({ name, slug, owner_id: userId })
        .select()
        .single();

      if (error) throw error;

      // Add creator as admin
      await supabase.from('user_roles').insert({
        user_id: userId,
        role: 'admin',
        organization_id: data.id,
      });

      await fetchOrganizations();
      toast({ title: 'Organization created' });
      return data as Organization;
    } catch (error) {
      console.error('Error creating organization:', error);
      toast({ title: 'Failed to create organization', variant: 'destructive' });
      return null;
    }
  }, [userId, fetchOrganizations, toast]);

  const updateOrganization = useCallback(async (id: string, updates: Partial<Pick<Organization, 'name' | 'slug' | 'logo_url'>>) => {
    try {
      const { error } = await supabase
        .from('organizations')
        .update(updates)
        .eq('id', id);

      if (error) throw error;

      await fetchOrganizations();
      toast({ title: 'Organization updated' });
      return true;
    } catch (error) {
      console.error('Error updating organization:', error);
      toast({ title: 'Failed to update organization', variant: 'destructive' });
      return false;
    }
  }, [fetchOrganizations, toast]);

  const addMember = useCallback(async (orgId: string, memberUserId: string, role: 'admin' | 'moderator' | 'user') => {
    try {
      const { error } = await supabase.from('user_roles').insert({
        user_id: memberUserId,
        role,
        organization_id: orgId,
      });

      if (error) throw error;

      await fetchMembers(orgId);
      toast({ title: 'Member added' });
      return true;
    } catch (error) {
      console.error('Error adding member:', error);
      toast({ title: 'Failed to add member', variant: 'destructive' });
      return false;
    }
  }, [fetchMembers, toast]);

  const updateMemberRole = useCallback(async (orgId: string, memberUserId: string, newRole: 'admin' | 'moderator' | 'user') => {
    try {
      const { error } = await supabase
        .from('user_roles')
        .update({ role: newRole })
        .eq('organization_id', orgId)
        .eq('user_id', memberUserId);

      if (error) throw error;

      await fetchMembers(orgId);
      toast({ title: 'Role updated' });
      return true;
    } catch (error) {
      console.error('Error updating role:', error);
      toast({ title: 'Failed to update role', variant: 'destructive' });
      return false;
    }
  }, [fetchMembers, toast]);

  const removeMember = useCallback(async (orgId: string, memberUserId: string) => {
    try {
      const { error } = await supabase
        .from('user_roles')
        .delete()
        .eq('organization_id', orgId)
        .eq('user_id', memberUserId);

      if (error) throw error;

      await fetchMembers(orgId);
      toast({ title: 'Member removed' });
      return true;
    } catch (error) {
      console.error('Error removing member:', error);
      toast({ title: 'Failed to remove member', variant: 'destructive' });
      return false;
    }
  }, [fetchMembers, toast]);

  return {
    organizations,
    currentOrg,
    setCurrentOrg,
    members,
    loading,
    createOrganization,
    updateOrganization,
    addMember,
    updateMemberRole,
    removeMember,
    refetch: fetchOrganizations,
  };
}
