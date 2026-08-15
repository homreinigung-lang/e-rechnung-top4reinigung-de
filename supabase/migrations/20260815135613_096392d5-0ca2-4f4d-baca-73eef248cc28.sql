CREATE TABLE public.plan_releases (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  week_end date NOT NULL,
  note text NOT NULL DEFAULT '',
  released_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, week_start)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.plan_releases TO authenticated;
GRANT ALL ON public.plan_releases TO service_role;

ALTER TABLE public.plan_releases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Inhaber verwalten eigene Wochenfreigaben"
ON public.plan_releases FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Mitarbeitende sehen Freigaben des Arbeitgebers"
ON public.plan_releases FOR SELECT TO authenticated
USING (user_id = public.my_employee_owner());

CREATE TRIGGER t_plan_releases_updated
BEFORE UPDATE ON public.plan_releases
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.plan_releases;