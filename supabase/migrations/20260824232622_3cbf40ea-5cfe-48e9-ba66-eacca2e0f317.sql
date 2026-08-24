DROP POLICY IF EXISTS "platform_settings_read_all" ON public.platform_settings;
CREATE POLICY "platform_settings_read_authenticated"
  ON public.platform_settings FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON public.platform_settings FROM anon;
GRANT SELECT ON public.platform_settings TO authenticated;