CREATE OR REPLACE FUNCTION public.finalize_document(_id uuid)
 RETURNS documents
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE d public.documents; n text; uid uuid := auth.uid(); pat text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Nicht angemeldet'; END IF;
  SELECT * INTO d FROM public.documents WHERE id = _id AND user_id = uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Beleg nicht gefunden'; END IF;
  IF d.locked_at IS NOT NULL THEN RETURN d; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.document_items WHERE document_id = _id) THEN
    RAISE EXCEPTION 'Beleg ohne Positionen kann nicht festgeschrieben werden.';
  END IF;

  pat := CASE WHEN d.type = 'invoice' THEN '^RE-'
              WHEN d.type = 'order' THEN '^AB-'
              ELSE '^AN-' END || EXTRACT(YEAR FROM CURRENT_DATE)::int::text || '-[0-9]+$';

  -- Bereits vergebene, gültige Nummer beibehalten (keine Lücken); sonst neu vergeben
  IF d.number ~ pat THEN
    n := d.number;
  ELSE
    n := public.next_document_number(d.type::text);
  END IF;

  UPDATE public.documents
     SET number = n,
         locked_at = now(),
         status = CASE WHEN status = 'draft' THEN 'sent'::doc_status ELSE status END
   WHERE id = _id
  RETURNING * INTO d;

  INSERT INTO public.document_audit_log (user_id, document_id, document_number, action, details)
  VALUES (d.user_id, d.id, d.number, 'finalized',
          jsonb_build_object('total', d.total, 'net_total', d.net_total, 'vat_amount', d.vat_amount,
                             'issue_date', d.issue_date));
  RETURN d;
END; $function$;