-- Add UPDATE policy for admins on app_settings
CREATE POLICY "Admins can update app settings" 
ON public.app_settings 
FOR UPDATE 
USING (public.has_role(auth.uid(), 'admin'));

-- Add INSERT policy for admins on app_settings (for upsert to work)
CREATE POLICY "Admins can insert app settings" 
ON public.app_settings 
FOR INSERT 
WITH CHECK (public.has_role(auth.uid(), 'admin'));