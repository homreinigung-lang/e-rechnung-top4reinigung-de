CREATE TABLE IF NOT EXISTS public.lv_import_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name text NOT NULL DEFAULT '',
  file_size bigint NOT NULL DEFAULT 0 CHECK (file_size >= 0),
  document_kind text NOT NULL DEFAULT 'unsupported',
  item_count integer NOT NULL DEFAULT 0 CHECK (item_count >= 0),
  total_count integer NOT NULL DEFAULT 0 CHECK (total_count >= 0),
  status text NOT NULL DEFAULT 'empty',
  status_message text NOT NULL DEFAULT '',
  page_count integer NOT NULL DEFAULT 0 CHECK (page_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.lv_import_logs TO authenticated;
GRANT ALL ON public.lv_import_logs TO service_role;

ALTER TABLE public.lv_import_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner manages own LV import logs" ON public.lv_import_logs;
CREATE POLICY "Owner manages own LV import logs"
ON public.lv_import_logs
FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_lv_import_logs_user_created
  ON public.lv_import_logs(user_id, created_at DESC);
