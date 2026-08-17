ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS thread_employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_chat_messages_thread ON public.chat_messages (user_id, thread_employee_id, created_at);

DROP POLICY IF EXISTS "employee reads company chat" ON public.chat_messages;
CREATE POLICY "employee reads own thread" ON public.chat_messages
FOR SELECT TO authenticated
USING (
  user_id = public.my_employee_owner()
  AND (thread_employee_id IS NULL OR thread_employee_id = public.my_employee_id())
);

DROP POLICY IF EXISTS "employee writes company chat" ON public.chat_messages;
CREATE POLICY "employee writes own thread" ON public.chat_messages
FOR INSERT TO authenticated
WITH CHECK (
  user_id = public.my_employee_owner()
  AND sender_auth_user_id = auth.uid()
  AND thread_employee_id = public.my_employee_id()
);