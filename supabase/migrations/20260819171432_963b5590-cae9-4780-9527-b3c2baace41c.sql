-- 1) account_approvals: allow a signed-in user to create ONLY their own pending request.
--    Status decisions stay privileged (no UPDATE policy => only service role / SECURITY DEFINER).
GRANT INSERT ON public.account_approvals TO authenticated;

CREATE POLICY "Eigene Freigabeanfrage anlegen"
  ON public.account_approvals
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = auth_user_id
    AND status = 'pending'
    AND decided_at IS NULL
  );

-- 2) bank_transactions: enforce that matched_document_id belongs to the same owner.
CREATE OR REPLACE FUNCTION public.owns_document(_document_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _document_id IS NULL OR EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = _document_id AND d.user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.owns_document(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.owns_document(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owns_document(uuid) TO service_role;

DROP POLICY IF EXISTS "Users manage own bank transactions" ON public.bank_transactions;

CREATE POLICY "Users read own bank transactions"
  ON public.bank_transactions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own bank transactions"
  ON public.bank_transactions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.owns_document(matched_document_id));

CREATE POLICY "Users update own bank transactions"
  ON public.bank_transactions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND public.owns_document(matched_document_id));

CREATE POLICY "Users delete own bank transactions"
  ON public.bank_transactions FOR DELETE TO authenticated
  USING (auth.uid() = user_id);