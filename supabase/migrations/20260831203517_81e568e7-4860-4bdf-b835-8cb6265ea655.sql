CREATE TABLE public.auth_mail_throttle (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scope text NOT NULL,
  key_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_auth_mail_throttle_lookup
  ON public.auth_mail_throttle (scope, key_hash, created_at DESC);

GRANT ALL ON public.auth_mail_throttle TO service_role;

ALTER TABLE public.auth_mail_throttle ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Nur Serverseite darf Drosselungsdaten verwalten"
  ON public.auth_mail_throttle FOR ALL TO service_role
  USING (true) WITH CHECK (true);