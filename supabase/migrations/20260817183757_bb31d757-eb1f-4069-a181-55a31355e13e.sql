-- 1) Mitarbeitende dürfen eigene Arbeitszeiten erfassen
CREATE POLICY "employee records own work time"
ON public.time_entries FOR INSERT TO authenticated
WITH CHECK (
  employee_id = public.my_employee_id()
  AND user_id = public.my_employee_owner()
  AND billed = false
  AND entry_type = 'work'
);

CREATE POLICY "employee deletes own unbilled work time"
ON public.time_entries FOR DELETE TO authenticated
USING (
  employee_id = public.my_employee_id()
  AND billed = false
  AND entry_type = 'work'
  AND approval_status <> 'rejected'
);

-- 2) Einsatz automatisch als abgeschlossen markieren
CREATE OR REPLACE FUNCTION public.time_entries_mark_completed()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.entry_type = 'work' AND NEW.completed_at IS NULL
     AND NEW.end_time IS NOT NULL AND COALESCE(NEW.hours, 0) > 0 THEN
    NEW.completed_at := now();
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS t_time_entries_mark_completed ON public.time_entries;
CREATE TRIGGER t_time_entries_mark_completed
BEFORE INSERT OR UPDATE ON public.time_entries
FOR EACH ROW EXECUTE FUNCTION public.time_entries_mark_completed();

-- 3) Interner Chat
CREATE TABLE public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_auth_user_id uuid NOT NULL DEFAULT auth.uid(),
  sender_name text NOT NULL DEFAULT '',
  sender_role text NOT NULL DEFAULT 'employee',
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_messages_user_created ON public.chat_messages (user_id, created_at DESC);

GRANT SELECT, INSERT, DELETE ON public.chat_messages TO authenticated;
GRANT ALL ON public.chat_messages TO service_role;

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner manages own chat"
ON public.chat_messages FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "employee reads company chat"
ON public.chat_messages FOR SELECT TO authenticated
USING (user_id = public.my_employee_owner());

CREATE POLICY "employee writes company chat"
ON public.chat_messages FOR INSERT TO authenticated
WITH CHECK (
  user_id = public.my_employee_owner()
  AND sender_auth_user_id = auth.uid()
);

CREATE TRIGGER t_chat_messages_updated
BEFORE UPDATE ON public.chat_messages
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;