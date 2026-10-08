-- Keep the established public SECURITY INVOKER wrapper and guarded private RPC.
-- Only replace the inaccessible privileged core implementation.
begin;

create or replace function app_private.create_storno_core(_id uuid, _reason text default '')
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  src public.documents;
  new_id uuid;
  n text;
  uid uuid := auth.uid();
  r text := btrim(coalesce(_reason, ''));
begin
  if uid is null then
    raise exception 'Nicht angemeldet';
  end if;
  if length(r) < 3 then
    raise exception 'Bitte geben Sie einen Stornogrund an.';
  end if;

  select *
    into src
    from public.documents
   where id = _id
     and user_id = uid
   for update;

  if not found then
    raise exception 'Beleg nicht gefunden';
  end if;
  if src.type <> 'invoice' then
    raise exception 'Nur Rechnungen können storniert werden.';
  end if;
  if src.is_storno is true or src.cancels_document_id is not null then
    raise exception 'Eine Stornorechnung darf nicht erneut storniert werden.';
  end if;
  if src.status in ('draft', 'cancelled') or src.deleted_at is not null then
    raise exception 'Entwürfe, stornierte oder gelöschte Rechnungen können nicht storniert werden.';
  end if;
  if src.cancelled_by_document_id is not null then
    raise exception 'Diese Rechnung wurde bereits storniert.';
  end if;

  n := public.next_document_number('invoice');

  insert into public.documents (
    user_id, type, number, status, issue_date, due_date, customer_id, customer_name,
    customer_company, customer_email, customer_address_line, customer_postal_code, customer_city,
    customer_country, customer_vat_id, reverse_charge, intro_text, notes, order_number, tax_mode,
    vat_rate, service_period, net_total, vat_amount, total, is_storno, cancels_document_id,
    storno_reason, locked_at
  ) values (
    src.user_id, 'invoice', n, 'cancelled', current_date, null, src.customer_id, src.customer_name,
    src.customer_company, src.customer_email, src.customer_address_line, src.customer_postal_code,
    src.customer_city, src.customer_country, src.customer_vat_id, src.reverse_charge,
    'Stornorechnung zur Rechnung ' || src.number || ' vom ' || to_char(src.issue_date, 'DD.MM.YYYY') ||
    '. Die ursprüngliche Rechnung wird hiermit vollständig storniert.' || E'\n' ||
    'Stornogrund: ' || r,
    src.notes, src.order_number, src.tax_mode, src.vat_rate, src.service_period,
    -src.net_total, -src.vat_amount, -src.total, true, src.id, r, null
  )
  returning id into new_id;

  insert into public.document_items (
    document_id, user_id, position, description, quantity, unit, unit_price
  )
  select new_id, src.user_id, position, description, quantity, unit, -unit_price
    from public.document_items
   where document_id = src.id
   order by position;

  update public.documents
     set locked_at = now()
   where id = new_id;

  update public.documents
     set cancelled_by_document_id = new_id,
         status = 'cancelled'
   where id = src.id;

  insert into public.document_audit_log (
    user_id, document_id, document_number, action, details
  )
  values
    (
      src.user_id, new_id, n, 'storno_created',
      jsonb_build_object('cancels', src.number, 'total', -src.total, 'reason', r)
    ),
    (
      src.user_id, src.id, src.number, 'cancelled',
      jsonb_build_object('storno_number', n, 'reason', r)
    );

  return new_id;
end;
$$;

revoke all on function app_private.create_storno_core(uuid, text) from public, anon, authenticated;
grant execute on function app_private.create_storno_core(uuid, text) to service_role;

commit;
