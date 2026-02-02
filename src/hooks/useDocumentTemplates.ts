import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { UserSettings, UserSignature } from './useUserSettings';

export interface DocumentTemplate {
  id: string;
  name: string;
  category: string;
  subcategory: string | null;
  description: string | null;
  template_content: string;
  icon: string;
  is_system: boolean;
  created_at: string;
}

interface TemplateContext {
  settings: UserSettings | null;
  signatures: UserSignature[];
  getFormattedSignature: (type?: 'formal' | 'semi-formal' | 'casual') => string;
}

export function useDocumentTemplates() {
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTemplates = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('document_templates')
        .select('*')
        .eq('is_system', true)
        .order('category', { ascending: true });

      if (error) throw error;
      setTemplates((data || []) as DocumentTemplate[]);
    } catch (error) {
      console.error('Error fetching templates:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  // Get templates by category
  const getTemplatesByCategory = useCallback((category: string) => {
    return templates.filter(t => t.category === category);
  }, [templates]);

  // Get all categories
  const getCategories = useCallback(() => {
    const cats = [...new Set(templates.map(t => t.category))];
    return cats.map(cat => ({
      name: cat,
      label: cat.charAt(0).toUpperCase() + cat.slice(1),
      icon: getIconForCategory(cat),
      count: templates.filter(t => t.category === cat).length,
    }));
  }, [templates]);

  // Fill template with user data
  const fillTemplate = useCallback((
    template: DocumentTemplate,
    context: TemplateContext,
    customFields?: Record<string, string>
  ) => {
    let content = template.template_content;
    const today = new Date();
    
    // Standard replacements
    const replacements: Record<string, string> = {
      '{{DATE}}': today.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      }),
      '{{TIME}}': today.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit' 
      }),
      '{{USER_NAME}}': [context.settings?.first_name, context.settings?.last_name]
        .filter(Boolean).join(' ') || '[Your Name]',
      '{{FIRST_NAME}}': context.settings?.first_name || '[First Name]',
      '{{LAST_NAME}}': context.settings?.last_name || '[Last Name]',
      '{{DESIGNATION}}': context.settings?.designation || '[Your Designation]',
      '{{COMPANY}}': context.settings?.company || '[Your Company]',
      '{{PHONE}}': context.settings?.phone || '[Your Phone]',
      '{{LOGO}}': context.settings?.logo_url 
        ? `![Logo](${context.settings.logo_url})` 
        : '[Your Logo]',
      ...customFields,
    };

    // Determine signature type based on template category
    let sigType: 'formal' | 'semi-formal' | 'casual' = 'formal';
    if (template.subcategory?.includes('thank') || template.subcategory?.includes('follow')) {
      sigType = 'semi-formal';
    }
    
    replacements['{{SIGNATURE}}'] = context.getFormattedSignature(sigType);

    // Apply all replacements
    Object.entries(replacements).forEach(([key, value]) => {
      content = content.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value);
    });

    return content;
  }, []);

  // Get AI prompt for template customization
  const getTemplatePrompt = useCallback((
    template: DocumentTemplate,
    userRequest: string,
    context: TemplateContext
  ) => {
    const filledTemplate = fillTemplate(template, context);
    
    return `You are helping the user customize a ${template.category} document using the following template:

Template: ${template.name}
Category: ${template.category}

Template Structure:
${filledTemplate}

User's Request: ${userRequest}

Instructions:
1. Fill in all remaining placeholders ({{...}}) based on the user's request
2. Keep the professional formatting and structure
3. Use today's date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
4. User's name for signature: ${[context.settings?.first_name, context.settings?.last_name].filter(Boolean).join(' ') || 'User'}
5. If designation/company available, include: ${context.settings?.designation || ''} ${context.settings?.company ? `at ${context.settings.company}` : ''}
6. Make the content professional and complete
7. Preserve all markdown formatting

Generate the complete, filled-out document:`;
  }, [fillTemplate]);

  return {
    templates,
    loading,
    getTemplatesByCategory,
    getCategories,
    fillTemplate,
    getTemplatePrompt,
    refetch: fetchTemplates,
  };
}

function getIconForCategory(category: string): string {
  const icons: Record<string, string> = {
    letter: '✉️',
    email: '📧',
    invoice: '🧾',
    memo: '📋',
    report: '📊',
  };
  return icons[category] || '📄';
}
