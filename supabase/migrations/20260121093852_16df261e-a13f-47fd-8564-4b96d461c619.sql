-- Fix the UPDATE policy for app_settings - add WITH CHECK clause
DROP POLICY IF EXISTS "Only admin can update app settings" ON public.app_settings;

CREATE POLICY "Only admin can update app settings"
ON public.app_settings
FOR UPDATE
USING (
  (SELECT email FROM auth.users WHERE id = auth.uid()) = 'test@genxai.com'
)
WITH CHECK (
  (SELECT email FROM auth.users WHERE id = auth.uid()) = 'test@genxai.com'
);