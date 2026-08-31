CREATE TABLE public.lv_import_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  file_name text NOT NULL DEFAULT '',
  file_size bigint NOT NULL DEFAULT 0,
  document_kind text NOT NULL DEFAULT 'unsupported',
  item_count integer NOT NULL DEFAULT 0,
  total_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'empty',
  status_message text NOT NULL DEFAULT '',
  page_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lv_import_logs TO authenticated;
GRANT ALL ON public.lv_import_logs TO service_role;

ALTER TABLE public.lv_import_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Eigene LV-Importprotokolle verwalten"
  ON public.lv_import_logs FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_lv_import_logs_user ON public.lv_import_logs(user_id, created_at DESC);