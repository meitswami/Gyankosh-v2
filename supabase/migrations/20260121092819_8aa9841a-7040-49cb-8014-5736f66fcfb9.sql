-- Create app_settings table for global application settings
CREATE TABLE public.app_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key text UNIQUE NOT NULL,
  setting_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Everyone can read settings (for real-time access check)
CREATE POLICY "Anyone can read app settings"
ON public.app_settings FOR SELECT
USING (true);

-- Only admin email can update settings
CREATE POLICY "Only admin can update app settings"
ON public.app_settings FOR UPDATE
USING (
  (SELECT email FROM auth.users WHERE id = auth.uid()) = 'test@genxai.com'
);

-- Only admin email can insert settings
CREATE POLICY "Only admin can insert app settings"
ON public.app_settings FOR INSERT
WITH CHECK (
  (SELECT email FROM auth.users WHERE id = auth.uid()) = 'test@genxai.com'
);

-- Insert default KB access setting (disabled by default)
INSERT INTO public.app_settings (setting_key, setting_value)
VALUES ('kb_public_access', '{"enabled": false}'::jsonb);

-- Enable realtime for app_settings
ALTER PUBLICATION supabase_realtime ADD TABLE public.app_settings;