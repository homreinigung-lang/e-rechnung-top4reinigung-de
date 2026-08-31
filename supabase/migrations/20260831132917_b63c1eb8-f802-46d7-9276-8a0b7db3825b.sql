CREATE OR REPLACE FUNCTION public.create_storno(_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE src public.documents; new_id uuid; n text; uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Nicht angemeldet'; END IF;
  SELECT * INTO src FROM public.documents WHERE id = _id AND user_id = uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Beleg nicht gefunden'; END IF;
  IF src.type <> 'invoice' THEN RAISE EXCEPTION 'Nur Rechnungen können storniert werden.'; END IF;
  IF src.cancelled_by_document_id IS NOT NULL THEN RAISE EXCEPTION 'Diese Rechnung wurde bereits storniert.'; END IF;

  n := public.next_document_number('invoice');

  INSERT INTO public.documents (
    user_id, type, number, status, issue_date, due_date, customer_id, customer_name,
    customer_company, customer_email, customer_address_line, customer_postal_code, customer_city,
    customer_country, customer_vat_id, reverse_charge, intro_text, notes, order_number, tax_mode,
    vat_rate, service_period, net_total, vat_amount, total, is_storno, cancels_document_id, locked_at
  ) VALUES (
    src.user_id, 'invoice', n, 'sent', CURRENT_DATE, NULL, src.customer_id, src.customer_name,
    src.customer_company, src.customer_email, src.customer_address_line, src.customer_postal_code,
    src.customer_city, src.customer_country, src.customer_vat_id, src.reverse_charge,
    'Stornorechnung zur Rechnung ' || src.number || ' vom ' || to_char(src.issue_date, 'DD.MM.YYYY') ||
    '. Die ursprüngliche Rechnung wird hiermit vollständig storniert.',
    src.notes, src.order_number, src.tax_mode, src.vat_rate, src.service_period,
    -src.net_total, -src.vat_amount, -src.total, true, src.id, NULL
  ) RETURNING id INTO new_id;

  -- Positionen anlegen, solange der Storno-Beleg noch nicht festgeschrieben ist
  INSERT INTO public.document_items (document_id, user_id, position, description, quantity, unit, unit_price)
  SELECT new_id, src.user_id, position, description, quantity, unit, -unit_price
    FROM public.document_items WHERE document_id = src.id ORDER BY position;

  -- erst danach festschreiben (GoBD)
  UPDATE public.documents SET locked_at = now() WHERE id = new_id;

  UPDATE public.documents SET cancelled_by_document_id = new_id, status = 'cancelled' WHERE id = src.id;

  INSERT INTO public.document_audit_log (user_id, document_id, document_number, action, details)
  VALUES (src.user_id, new_id, n, 'storno_created', jsonb_build_object('cancels', src.number, 'total', -src.total)),
         (src.user_id, src.id, src.number, 'cancelled', jsonb_build_object('storno_number', n));

  RETURN new_id;
END; $function$;