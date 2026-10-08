-- SECURITY/FUNCTIONALITY: normalize the storno RPC across production and replay.
-- Production missed the historical migration that added the mandatory reason,
-- while local replay already has the two-argument form. Make both converge here.
begin;

drop function if exists public.create_storno(uuid);
drop function if exists public.create_storno(uuid, text);
drop function if exists public.create_storno_unchecked(uuid);

create or replace function public.create_storno_unchecked(_id uuid, _reason text default '')
returns uuid
language plpgsql
security definer
set search_path = public, app_private
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
  -- A Stornorechnung is itself an invoice; never permit cancelling the cancellation.
  if coalesce(src.is_storno, false) or src.cancels_document_id is not null then
    raise exception 'Eine Stornorechnung kann nicht erneut storniert werden.';
  end if;
  -- Drafts have not been issued and should not produce numbered cancellation invoices.
  if src.status = 'draft' or src.locked_at is null then
    raise exception 'Nur festgeschriebene Rechnungen können storniert werden.';
  end if;
  if src.status = 'cancelled' then
    raise exception 'Diese Rechnung wurde bereits storniert.';
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

revoke all on function public.create_storno_unchecked(uuid, text)
  from public, anon, authenticated;
grant execute on function public.create_storno_unchecked(uuid, text) to service_role;

create or replace function public.create_storno(_id uuid, _reason text default '')
returns uuid
language plpgsql
security definer
set search_path = public, app_private
as $$
begin
  if not app_private.is_account_active() then
    raise exception 'Konto gesperrt' using errcode = '42501';
  end if;
  return public.create_storno_unchecked(_id, _reason);
end;
$$;

revoke all on function public.create_storno(uuid, text) from public, anon;
grant execute on function public.create_storno(uuid, text) to authenticated, service_role;

commit;
