CREATE TABLE public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name text NOT NULL DEFAULT '',
  rating integer NOT NULL DEFAULT 5,
  body text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reviews_rating_range CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT reviews_status_valid CHECK (status IN ('pending','approved','rejected')),
  CONSTRAINT reviews_one_per_user UNIQUE (user_id)
);

GRANT SELECT ON public.reviews TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reviews TO authenticated;
GRANT ALL ON public.reviews TO service_role;

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Freigegebene Bewertungen sind oeffentlich"
  ON public.reviews FOR SELECT TO anon, authenticated
  USING (status = 'approved');

CREATE POLICY "Eigene Bewertung lesen"
  ON public.reviews FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Firmenkunden legen eigene Bewertung an"
  ON public.reviews FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND NOT public.is_employee_account(auth.uid()));

CREATE POLICY "Eigene, noch nicht freigegebene Bewertung aendern"
  ON public.reviews FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND status <> 'approved')
  WITH CHECK (auth.uid() = user_id AND status = 'pending');

CREATE POLICY "Eigene Bewertung loeschen"
  ON public.reviews FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Administratoren verwalten alle Bewertungen"
  ON public.reviews FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER t_reviews_updated
  BEFORE UPDATE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();