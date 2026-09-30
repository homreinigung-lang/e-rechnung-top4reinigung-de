-- Einmalige Einfuehrung pro Konto serverseitig speichern.
CREATE TABLE IF NOT EXISTS public.onboarding_state (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tour_completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.onboarding_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Eigenes Onboarding lesen und verwalten" ON public.onboarding_state;
CREATE POLICY "Eigenes Onboarding lesen und verwalten"
  ON public.onboarding_state
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Die globale Sperrlogik gilt auch fuer diese neue Tabelle.
DROP POLICY IF EXISTS "Gesperrte Konten ausgeschlossen" ON public.onboarding_state;
CREATE POLICY "Gesperrte Konten ausgeschlossen"
  ON public.onboarding_state
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING ((SELECT public.is_account_active()))
  WITH CHECK ((SELECT public.is_account_active()));

-- Bestehende Konten sollen die Tour nicht automatisch sehen.
-- Sie koennen sie jederzeit ueber "Einfuehrung starten" manuell aufrufen.
INSERT INTO public.onboarding_state (user_id, tour_completed_at)
SELECT id, now()
FROM auth.users
ON CONFLICT (user_id) DO NOTHING;
