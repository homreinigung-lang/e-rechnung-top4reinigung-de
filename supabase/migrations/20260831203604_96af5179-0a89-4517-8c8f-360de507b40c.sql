CREATE TABLE public.cron_tokens (
  name text NOT NULL PRIMARY KEY,
  token text NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.cron_tokens TO service_role;

ALTER TABLE public.cron_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Nur Serverseite darf Auftrags-Schluessel verwalten"
  ON public.cron_tokens FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE TRIGGER t_cron_tokens_updated
  BEFORE UPDATE ON public.cron_tokens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.cron_tokens (name) VALUES ('foto-retention')
  ON CONFLICT (name) DO NOTHING;

SELECT cron.unschedule('foto-retention-taeglich');

SELECT cron.schedule(
  'foto-retention-taeglich',
  '20 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://e-rechnung-top4reinigung-de.lovable.app/api/public/foto-retention',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT token FROM public.cron_tokens WHERE name = 'foto-retention')
    ),
    body := '{}'::jsonb
  );
  $$
);