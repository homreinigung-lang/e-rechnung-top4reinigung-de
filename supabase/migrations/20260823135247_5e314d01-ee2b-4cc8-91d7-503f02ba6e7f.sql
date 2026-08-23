CREATE TABLE public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  price_monthly_cents integer NOT NULL DEFAULT 0,
  price_yearly_cents integer NOT NULL DEFAULT 0,
  features text[] NOT NULL DEFAULT '{}',
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.plans TO anon;
GRANT SELECT ON public.plans TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.plans TO authenticated;
GRANT ALL ON public.plans TO service_role;

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Aktive Pakete sind öffentlich sichtbar"
  ON public.plans FOR SELECT TO anon, authenticated
  USING (active OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Nur Administratoren dürfen Pakete anlegen"
  ON public.plans FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Nur Administratoren dürfen Pakete ändern"
  ON public.plans FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Nur Administratoren dürfen Pakete löschen"
  ON public.plans FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER t_plans_updated BEFORE UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.plans (code, name, description, price_monthly_cents, price_yearly_cents, features, sort_order)
VALUES
  ('basis', 'Basis', 'Rechnungen, Angebote und Kundenverwaltung für kleine Betriebe.', 1900, 19000, ARRAY['Rechnungen & Angebote','E-Rechnung (XRechnung/ZUGFeRD)','1 Benutzer'], 1),
  ('pro', 'Pro', 'Kalkulation, Zeiterfassung und Einsatzplanung für wachsende Firmen.', 4900, 49000, ARRAY['Alles aus Basis','Kalkulation & Leistungsverzeichnis','Zeiterfassung & Einsatzplanung','Bis 20 Mitarbeitende'], 2),
  ('enterprise', 'Enterprise', 'Voller Funktionsumfang inklusive Projekte, Bank und Steuerberater-Zugang.', 9900, 99000, ARRAY['Alles aus Pro','Projekte & Objekt-Mappen','Bankabgleich & DATEV-Export','Unbegrenzte Mitarbeitende'], 3);

CREATE POLICY "Administratoren sehen alle Freigaben"
  ON public.account_approvals FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Administratoren dürfen Freigaben entscheiden"
  ON public.account_approvals FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

GRANT SELECT, UPDATE ON public.account_approvals TO authenticated;