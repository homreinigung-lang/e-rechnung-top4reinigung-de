-- Rollen
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = _user_id AND role = _role
  );
$$;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

CREATE POLICY "Angemeldete koennen Rollen lesen"
  ON public.user_roles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins verwalten Rollen"
  ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'admin'::public.app_role FROM auth.users u
 WHERE lower(u.email) = 'homreinigung@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;

-- Abonnements
CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  company_name text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  contact_email text NOT NULL DEFAULT '',
  plan text NOT NULL DEFAULT 'basis',
  status text NOT NULL DEFAULT 'trial',
  visible_on_landing boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  note text NOT NULL DEFAULT '',
  started_on date NOT NULL DEFAULT CURRENT_DATE,
  renews_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.subscriptions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Oeffentliche Partnerliste"
  ON public.subscriptions FOR SELECT TO anon, authenticated
  USING (status = 'active' AND visible_on_landing = true);

CREATE POLICY "Firma sieht eigenes Abo"
  ON public.subscriptions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins sehen alle Abos"
  ON public.subscriptions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins verwalten Abos"
  ON public.subscriptions FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins aendern Abos"
  ON public.subscriptions FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins loeschen Abos"
  ON public.subscriptions FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER t_subscriptions_updated
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.subscriptions (user_id, company_name, city, contact_email, status, visible_on_landing)
SELECT u.id,
       COALESCE(NULLIF(cs.company_name, ''), split_part(u.email, '@', 1)),
       COALESCE(cs.city, ''),
       u.email,
       'active',
       false
  FROM auth.users u
  LEFT JOIN public.company_settings cs ON cs.user_id = u.id
ON CONFLICT (user_id) DO NOTHING;