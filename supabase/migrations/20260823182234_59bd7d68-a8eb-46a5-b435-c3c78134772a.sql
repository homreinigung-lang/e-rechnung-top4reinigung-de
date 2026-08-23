GRANT SELECT ON TABLE public.plans TO anon, authenticated;
GRANT ALL ON TABLE public.plans TO service_role;

DROP POLICY IF EXISTS "Aktive Pakete sind öffentlich sichtbar" ON public.plans;
DROP POLICY IF EXISTS "Aktive Pakete öffentlich lesen" ON public.plans;
DROP POLICY IF EXISTS "Administratoren sehen alle Pakete" ON public.plans;

CREATE POLICY "Aktive Pakete öffentlich lesen"
ON public.plans
FOR SELECT
TO anon, authenticated
USING (active = true);

CREATE POLICY "Administratoren sehen alle Pakete"
ON public.plans
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));