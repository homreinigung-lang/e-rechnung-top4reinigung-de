-- Applied to migration-validation and production on 2026-09-16.
-- Prevent deleting invoice line items before confirming the parent is in trash.
-- Locked financial documents cannot be permanently purged.
CREATE OR REPLACE FUNCTION public.purge_entity(_entity text, _id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  uid uuid := auth.uid();
  target_document public.documents%ROWTYPE;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Nicht angemeldet';
  END IF;

  IF _entity = 'document' THEN
    SELECT * INTO target_document
      FROM public.documents
     WHERE id = _id AND user_id = uid
     FOR UPDATE;

    IF NOT FOUND OR target_document.deleted_at IS NULL THEN
      RAISE EXCEPTION 'Beleg ist nicht im Papierkorb oder nicht vorhanden';
    END IF;
    IF target_document.locked_at IS NOT NULL THEN
      RAISE EXCEPTION 'Festgeschriebene Belege dürfen nicht endgültig gelöscht werden';
    END IF;

    DELETE FROM public.document_items
     WHERE document_id = _id AND user_id = uid;
    DELETE FROM public.documents
     WHERE id = _id AND user_id = uid
       AND deleted_at IS NOT NULL AND locked_at IS NULL;
  ELSIF _entity = 'customer' THEN
    DELETE FROM public.customers
     WHERE id = _id AND user_id = uid AND deleted_at IS NOT NULL;
  ELSIF _entity = 'expense' THEN
    DELETE FROM public.expenses
     WHERE id = _id AND user_id = uid AND deleted_at IS NOT NULL;
  ELSE
    RAISE EXCEPTION 'Unbekannter Datentyp: %', _entity;
  END IF;
END;
$function$;

-- An authenticated account may only create/read/change its own rows
-- when their parent document belongs to the same account.
ALTER POLICY "own items" ON public.document_items TO authenticated
USING (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.documents d
     WHERE d.id = document_id AND d.user_id = auth.uid()
  )
)
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.documents d
     WHERE d.id = document_id AND d.user_id = auth.uid()
  )
);
