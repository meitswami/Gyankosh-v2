-- User Roles for RBAC
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

CREATE TABLE public.user_roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    role app_role NOT NULL DEFAULT 'user',
    organization_id uuid,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    UNIQUE (user_id, role, organization_id)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function for role check (prevents recursive RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

CREATE POLICY "Users can view own roles"
ON public.user_roles FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage roles"
ON public.user_roles FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- Organizations table for multi-tenant RBAC
CREATE TABLE public.organizations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    slug text UNIQUE NOT NULL,
    logo_url text,
    owner_id uuid NOT NULL,
    settings jsonb DEFAULT '{}'::jsonb,
    usage_limits jsonb DEFAULT '{"documents": 100, "chats": 1000}'::jsonb,
    current_usage jsonb DEFAULT '{"documents": 0, "chats": 0}'::jsonb,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view organization"
ON public.organizations FOR SELECT
USING (id IN (
    SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid()
) OR owner_id = auth.uid());

CREATE POLICY "Owners can update organization"
ON public.organizations FOR UPDATE
USING (owner_id = auth.uid());

CREATE POLICY "Users can create organizations"
ON public.organizations FOR INSERT
WITH CHECK (auth.uid() = owner_id);

-- Activity logs
CREATE TABLE public.activity_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    action text NOT NULL,
    resource_type text NOT NULL,
    resource_id text,
    details jsonb DEFAULT '{}'::jsonb,
    ip_address text,
    user_agent text,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own activity"
ON public.activity_logs FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "System can insert activity"
ON public.activity_logs FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_activity_logs_user_id ON public.activity_logs(user_id);
CREATE INDEX idx_activity_logs_created_at ON public.activity_logs(created_at DESC);

-- 2FA settings
CREATE TABLE public.two_factor_settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid UNIQUE NOT NULL,
    is_enabled boolean DEFAULT false,
    secret_key text,
    backup_codes text[],
    last_verified_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.two_factor_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own 2FA settings"
ON public.two_factor_settings FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own 2FA"
ON public.two_factor_settings FOR ALL
USING (auth.uid() = user_id);

-- API integrations
CREATE TABLE public.api_integrations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    name text NOT NULL,
    base_url text NOT NULL,
    api_key_encrypted text,
    headers jsonb DEFAULT '{}'::jsonb,
    description text,
    icon text DEFAULT '🔌',
    is_active boolean DEFAULT true,
    last_used_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.api_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own integrations"
ON public.api_integrations FOR ALL
USING (auth.uid() = user_id);

-- Update updated_at trigger for new tables
CREATE TRIGGER update_user_roles_updated_at
BEFORE UPDATE ON public.user_roles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_organizations_updated_at
BEFORE UPDATE ON public.organizations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_two_factor_settings_updated_at
BEFORE UPDATE ON public.two_factor_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_api_integrations_updated_at
BEFORE UPDATE ON public.api_integrations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();