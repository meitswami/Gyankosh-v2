-- Fix app_settings RLS policies: remove auth.users dependency (causes 403) and restrict admin actions by admin user_id

DO $$
BEGIN
  -- Recreate SELECT policy to ensure public read access
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='app_settings' AND policyname='Anyone can read app settings'
  ) THEN
    DROP POLICY "Anyone can read app settings" ON public.app_settings;
  END IF;

  -- Drop admin policies (may reference auth.users)
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='app_settings' AND policyname='Only admin can insert app settings'
  ) THEN
    DROP POLICY "Only admin can insert app settings" ON public.app_settings;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='app_settings' AND policyname='Only admin can update app settings'
  ) THEN
    DROP POLICY "Only admin can update app settings" ON public.app_settings;
  END IF;
END $$;

-- Public read (needed for the toggle UI to load)
CREATE POLICY "Anyone can read app settings"
ON public.app_settings
FOR SELECT
USING (true);

-- Admin-only writes (admin user_id = f9ce1a56-871d-4132-90e2-0ad3153879c5)
CREATE POLICY "Only admin can insert app settings"
ON public.app_settings
FOR INSERT
WITH CHECK (auth.uid() = 'f9ce1a56-871d-4132-90e2-0ad3153879c5'::uuid);

CREATE POLICY "Only admin can update app settings"
ON public.app_settings
FOR UPDATE
USING (auth.uid() = 'f9ce1a56-871d-4132-90e2-0ad3153879c5'::uuid)
WITH CHECK (auth.uid() = 'f9ce1a56-871d-4132-90e2-0ad3153879c5'::uuid);
