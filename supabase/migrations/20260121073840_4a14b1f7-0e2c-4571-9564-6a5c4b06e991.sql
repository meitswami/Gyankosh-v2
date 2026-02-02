-- User settings table for profile, signatures, and logo
CREATE TABLE public.user_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  first_name TEXT,
  last_name TEXT,
  designation TEXT,
  company TEXT,
  phone TEXT,
  logo_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- User signatures (max 3 per user enforced in app)
CREATE TABLE public.user_signatures (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL, -- e.g., "Formal", "Casual", "Official"
  type TEXT NOT NULL DEFAULT 'formal', -- formal, semi-formal, casual
  content TEXT NOT NULL, -- The signature text
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Document templates
CREATE TABLE public.document_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL, -- letter, email, invoice, memo, report
  subcategory TEXT, -- leave_request, resignation, recommendation, etc.
  description TEXT,
  template_content TEXT NOT NULL, -- Template with placeholders like {{USER_NAME}}, {{DATE}}, {{SIGNATURE}}
  icon TEXT DEFAULT '📄',
  is_system BOOLEAN DEFAULT true, -- System templates vs user-created
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Group chats
CREATE TABLE public.chat_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  avatar_url TEXT,
  created_by UUID NOT NULL,
  encrypted_group_key TEXT NOT NULL, -- Symmetric key encrypted for creator
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Group members with their encrypted copy of the group key
CREATE TABLE public.group_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.chat_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  encrypted_group_key TEXT NOT NULL, -- Group key encrypted with member's public key
  role TEXT DEFAULT 'member', -- admin, member
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(group_id, user_id)
);

-- Group messages
CREATE TABLE public.group_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.chat_groups(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  encrypted_content TEXT NOT NULL,
  iv TEXT NOT NULL,
  content_type TEXT DEFAULT 'text',
  file_url TEXT,
  file_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_messages ENABLE ROW LEVEL SECURITY;

-- RLS policies for user_settings
CREATE POLICY "Users can view own settings" ON public.user_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own settings" ON public.user_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own settings" ON public.user_settings FOR UPDATE USING (auth.uid() = user_id);

-- RLS policies for user_signatures
CREATE POLICY "Users can view own signatures" ON public.user_signatures FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own signatures" ON public.user_signatures FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own signatures" ON public.user_signatures FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own signatures" ON public.user_signatures FOR DELETE USING (auth.uid() = user_id);

-- RLS policies for document_templates (everyone can read system templates)
CREATE POLICY "Anyone can view system templates" ON public.document_templates FOR SELECT USING (is_system = true);

-- RLS policies for chat_groups
CREATE POLICY "Members can view groups" ON public.chat_groups FOR SELECT 
  USING (id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid()));
CREATE POLICY "Users can create groups" ON public.chat_groups FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Admins can update groups" ON public.chat_groups FOR UPDATE 
  USING (id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid() AND role = 'admin'));
CREATE POLICY "Creator can delete groups" ON public.chat_groups FOR DELETE USING (auth.uid() = created_by);

-- RLS policies for group_members
CREATE POLICY "Members can view group members" ON public.group_members FOR SELECT 
  USING (group_id IN (SELECT group_id FROM public.group_members gm WHERE gm.user_id = auth.uid()));
CREATE POLICY "Admins can add members" ON public.group_members FOR INSERT 
  WITH CHECK (group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admins can remove members" ON public.group_members FOR DELETE 
  USING (group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid() AND role = 'admin') OR user_id = auth.uid());

-- RLS policies for group_messages
CREATE POLICY "Members can view group messages" ON public.group_messages FOR SELECT 
  USING (group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid()));
CREATE POLICY "Members can send messages" ON public.group_messages FOR INSERT 
  WITH CHECK (group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid()) AND auth.uid() = sender_id);

-- Enable realtime for group messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_members;

-- Insert default document templates
INSERT INTO public.document_templates (name, category, subcategory, description, template_content, icon) VALUES
-- Letters
('Formal Leave Request', 'letter', 'leave_request', 'Request leave from work with formal tone', 
'**Subject: Leave Application - {{LEAVE_TYPE}}**

Dear {{RECIPIENT_NAME}},

I am writing to formally request {{LEAVE_DURATION}} of leave from {{START_DATE}} to {{END_DATE}}.

{{REASON}}

I have ensured that my pending work will be completed before my leave, and I have briefed {{COLLEAGUE_NAME}} to handle any urgent matters in my absence.

I would be grateful if you could approve my leave request at your earliest convenience.

Thank you for your consideration.

---

{{SIGNATURE}}', '📝'),

('Resignation Letter', 'letter', 'resignation', 'Professional resignation letter',
'**Subject: Resignation - {{USER_NAME}}**

Dear {{RECIPIENT_NAME}},

I am writing to formally notify you of my resignation from my position as {{DESIGNATION}} at {{COMPANY}}, effective {{LAST_WORKING_DATE}}.

{{REASON}}

I am grateful for the opportunities for professional growth that you have provided me during my tenure. I have enjoyed working with the team and will miss the collaborative environment.

I am committed to ensuring a smooth transition and am willing to assist in training my replacement during the notice period.

Thank you for your understanding and support.

---

{{SIGNATURE}}', '👋'),

('Recommendation Letter', 'letter', 'recommendation', 'Professional recommendation for colleague/student',
'**Letter of Recommendation**

**Date:** {{DATE}}

**To Whom It May Concern,**

I am pleased to recommend {{CANDIDATE_NAME}} for {{PURPOSE}}.

I have known {{CANDIDATE_NAME}} for {{DURATION}} in my capacity as {{YOUR_ROLE}}. During this time, I have been consistently impressed by their {{KEY_QUALITIES}}.

{{SPECIFIC_ACHIEVEMENTS}}

{{CANDIDATE_NAME}} would be a valuable addition to any organization. I recommend them without reservation.

Please feel free to contact me if you require any additional information.

---

{{SIGNATURE}}', '⭐'),

-- Emails
('Professional Email', 'email', 'professional', 'Standard professional email format',
'**Subject: {{EMAIL_SUBJECT}}**

Dear {{RECIPIENT_NAME}},

{{OPENING_LINE}}

{{MAIN_CONTENT}}

{{CLOSING_LINE}}

---

{{SIGNATURE}}', '📧'),

('Follow-up Email', 'email', 'follow_up', 'Follow up on previous communication',
'**Subject: Follow-up: {{ORIGINAL_SUBJECT}}**

Dear {{RECIPIENT_NAME}},

I hope this email finds you well. I am following up on {{CONTEXT}} from {{PREVIOUS_DATE}}.

{{FOLLOW_UP_CONTENT}}

I would appreciate your response at your earliest convenience.

---

{{SIGNATURE}}', '🔄'),

('Thank You Email', 'email', 'thank_you', 'Express gratitude professionally',
'**Subject: Thank You - {{CONTEXT}}**

Dear {{RECIPIENT_NAME}},

I wanted to take a moment to express my sincere gratitude for {{REASON}}.

{{PERSONAL_NOTE}}

I truly appreciate your {{APPRECIATION_POINT}} and look forward to {{FUTURE_CONTEXT}}.

---

{{SIGNATURE}}', '🙏'),

-- Business Documents
('Meeting Notes', 'memo', 'meeting_notes', 'Document meeting discussions and action items',
'# Meeting Notes

**Date:** {{DATE}}
**Time:** {{TIME}}
**Attendees:** {{ATTENDEES}}
**Location:** {{LOCATION}}

---

## Agenda
{{AGENDA_ITEMS}}

## Discussion Points
{{DISCUSSION}}

## Decisions Made
{{DECISIONS}}

## Action Items
| Task | Owner | Deadline |
|------|-------|----------|
| {{TASK}} | {{OWNER}} | {{DEADLINE}} |

---

**Notes prepared by:** {{USER_NAME}}
**Date:** {{DATE}}', '📋'),

('Business Proposal', 'report', 'proposal', 'Professional business proposal template',
'# {{PROPOSAL_TITLE}}

**Prepared by:** {{USER_NAME}}
**Date:** {{DATE}}
**Company:** {{COMPANY}}

---

## Executive Summary
{{EXECUTIVE_SUMMARY}}

## Problem Statement
{{PROBLEM}}

## Proposed Solution
{{SOLUTION}}

## Benefits
{{BENEFITS}}

## Implementation Timeline
| Phase | Description | Duration |
|-------|-------------|----------|
| {{PHASE}} | {{DESCRIPTION}} | {{DURATION}} |

## Investment Required
{{INVESTMENT}}

## Conclusion
{{CONCLUSION}}

---

{{SIGNATURE}}', '💼'),

('Invoice', 'invoice', 'standard', 'Professional invoice template',
'# INVOICE

{{LOGO}}

**Invoice Number:** {{INVOICE_NUMBER}}
**Date:** {{DATE}}
**Due Date:** {{DUE_DATE}}

---

**From:**
{{USER_NAME}}
{{COMPANY}}
{{ADDRESS}}

**Bill To:**
{{CLIENT_NAME}}
{{CLIENT_COMPANY}}
{{CLIENT_ADDRESS}}

---

## Items

| Description | Quantity | Rate | Amount |
|-------------|----------|------|--------|
| {{ITEM}} | {{QTY}} | {{RATE}} | {{AMOUNT}} |

---

| Subtotal | {{SUBTOTAL}} |
| Tax ({{TAX_RATE}}%) | {{TAX}} |
| **Total** | **{{TOTAL}}** |

---

**Payment Terms:** {{PAYMENT_TERMS}}
**Bank Details:** {{BANK_DETAILS}}

---

{{SIGNATURE}}', '🧾');

-- Create trigger for updated_at
CREATE TRIGGER update_user_settings_updated_at
  BEFORE UPDATE ON public.user_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_user_signatures_updated_at
  BEFORE UPDATE ON public.user_signatures
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_chat_groups_updated_at
  BEFORE UPDATE ON public.chat_groups
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();