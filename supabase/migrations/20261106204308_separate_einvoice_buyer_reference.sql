-- Keep BT-10 separate from BT-13. Existing documents are not backfilled:
-- an order number cannot safely be assumed to be a buyer reference.
begin;
alter table public.documents
  add column buyer_reference text not null default '',
  add column requires_leitweg_id boolean not null default false;
comment on column public.documents.buyer_reference is
  'BT-10: buyer reference supplied by the customer; Leitweg-ID where required. Separate from BT-13 order_number.';
comment on column public.documents.requires_leitweg_id is
  'Customer requires a Leitweg-ID; validate its format and check digits before electronic export.';

-- Client-side conversions and manual recurrence copy all business fields.
-- SQL creation paths use explicit column lists and must copy these fields too.


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
  if src.locked_at is null then
    raise exception 'Nur festgeschriebene Rechnungen können storniert werden.';
  end if;
  if src.cancelled_by_document_id is not null then
    raise exception 'Diese Rechnung wurde bereits storniert.';
  end if;

  n := public.next_document_number('invoice');

  insert into public.documents (
    user_id, type, number, status, issue_date, due_date, customer_id, customer_name,
    customer_company, customer_email, customer_address_line, customer_postal_code, customer_city,
    customer_country, customer_vat_id, reverse_charge, intro_text, notes, order_number, buyer_reference, requires_leitweg_id, tax_mode,
    vat_rate, service_period, net_total, vat_amount, total, is_storno, cancels_document_id,
    storno_reason, locked_at
  ) values (
    src.user_id, 'invoice', n, 'cancelled', current_date, null, src.customer_id, src.customer_name,
    src.customer_company, src.customer_email, src.customer_address_line, src.customer_postal_code,
    src.customer_city, src.customer_country, src.customer_vat_id, src.reverse_charge,
    'Stornorechnung zur Rechnung ' || src.number || ' vom ' || to_char(src.issue_date, 'DD.MM.YYYY') ||
    '. Die ursprüngliche Rechnung wird hiermit vollständig storniert.' || E'\n' ||
    'Stornogrund: ' || r,
    src.notes, src.order_number, src.buyer_reference, src.requires_leitweg_id, src.tax_mode, src.vat_rate, src.service_period,
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


create or replace function public.create_due_recurring_invoice(_recurring_id uuid, _today date)
returns table(
  document_id uuid,
  document_number text,
  owner_user_id uuid,
  scheduled_date date,
  interval_months integer,
  already_sent boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.recurring_invoices%rowtype;
  src public.documents%rowtype;
  existing public.documents%rowtype;
  new_id uuid;
  new_number text;
  terms integer := 14;
begin
  select * into rec
  from public.recurring_invoices
  where id=_recurring_id
  for update;

  if not found or not rec.active or rec.template_document_id is null or rec.next_run > coalesce(_today,current_date) then
    return;
  end if;

  select * into existing
  from public.documents d
  where d.user_id=rec.user_id
    and d.recurring_invoice_id=rec.id
    and d.recurring_run_date=rec.next_run
  limit 1;

  if found then
    return query select existing.id, existing.number, rec.user_id, rec.next_run, rec.interval_months, existing.sent_at is not null;
    return;
  end if;

  select * into src
  from public.documents d
  where d.id=rec.template_document_id and d.user_id=rec.user_id;

  if not found then
    raise exception 'Vorlage-Rechnung nicht gefunden';
  end if;

  select coalesce(cs.payment_terms_days,14) into terms
  from public.company_settings cs
  where cs.user_id=rec.user_id
  limit 1;

  new_number := public.next_document_number_for_user(rec.user_id,'invoice',rec.next_run);

  insert into public.documents(
    user_id,type,number,status,issue_date,due_date,
    customer_id,customer_name,customer_company,customer_email,customer_phone,
    customer_address_line,customer_postal_code,customer_city,customer_country,customer_vat_id,
    reverse_charge,intro_text,notes,total,order_number,buyer_reference,requires_leitweg_id,tax_mode,vat_rate,service_period,
    net_total,vat_amount,attachment_title,attachment_text,customer_number,service_description,
    discount_percent,discount_amount,discount_reason,title,customer_type,project_id,
    planned_hours_month,planned_visits_month,recurring_invoice_id,recurring_run_date
  )
  values(
    rec.user_id,'invoice',new_number,'draft',rec.next_run,rec.next_run + greatest(coalesce(terms,14),0),
    src.customer_id,src.customer_name,src.customer_company,src.customer_email,src.customer_phone,
    src.customer_address_line,src.customer_postal_code,src.customer_city,src.customer_country,src.customer_vat_id,
    src.reverse_charge,src.intro_text,src.notes,src.total,src.order_number,src.buyer_reference,src.requires_leitweg_id,src.tax_mode,src.vat_rate,src.service_period,
    src.net_total,src.vat_amount,src.attachment_title,src.attachment_text,src.customer_number,src.service_description,
    src.discount_percent,src.discount_amount,src.discount_reason,src.title,src.customer_type,src.project_id,
    src.planned_hours_month,src.planned_visits_month,rec.id,rec.next_run
  )
  returning id into new_id;

  insert into public.document_items(document_id,user_id,position,description,quantity,unit,unit_price,is_optional)
  select new_id,rec.user_id,di.position,di.description,di.quantity,di.unit,di.unit_price,di.is_optional
  from public.document_items di
  where di.document_id=rec.template_document_id
  order by di.position;

  insert into public.document_audit_log(user_id,document_id,document_number,action,details)
  values(rec.user_id,new_id,new_number,'recurring_created',jsonb_build_object(
    'recurring_id',rec.id,
    'scheduled_date',rec.next_run,
    'interval_months',rec.interval_months,
    'automatic',true
  ));

  return query select new_id,new_number,rec.user_id,rec.next_run,rec.interval_months,false;
end
$$;

revoke all on function public.create_due_recurring_invoice(uuid,date) from public, anon, authenticated;
grant execute on function public.create_due_recurring_invoice(uuid,date) to service_role;

create or replace function public.create_supplement(_order_id uuid) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare p public.documents; result uuid;
begin
  select * into p from public.documents where id = _order_id and user_id = auth.uid()
    and deleted_at is null for update;
  if not found or p.type <> 'order' or p.parent_order_id is not null or p.status = 'cancelled' then
    raise exception 'Bitte einen gültigen ursprünglichen Auftrag auswählen.';
  end if;
  insert into public.documents(user_id,type,status,number,issue_date,parent_order_id,
    customer_id,project_id,customer_name,customer_company,customer_number,customer_email,
    customer_address_line,customer_postal_code,customer_city,customer_country,customer_vat_id,
    customer_type,tax_mode,vat_rate,reverse_charge,title,order_number,buyer_reference,requires_leitweg_id,intro_text)
  values(p.user_id,'quote','draft','AN-DEMO-'||gen_random_uuid()::text,current_date,p.id,
    p.customer_id,p.project_id,p.customer_name,p.customer_company,p.customer_number,p.customer_email,
    p.customer_address_line,p.customer_postal_code,p.customer_city,p.customer_country,p.customer_vat_id,
    p.customer_type,p.tax_mode,p.vat_rate,p.reverse_charge,'Nachtragsangebot zu '||p.number,p.order_number,p.buyer_reference,p.requires_leitweg_id,
    'Zusätzliche Leistungen zum Auftrag '||p.number||'. Der ursprüngliche Leistungsumfang bleibt bestehen.')
  returning id into result;
  insert into public.document_audit_log(user_id,document_id,document_number,action,details)
  values(p.user_id,result,'','supplement_created',jsonb_build_object('parent_order_id',p.id));
  return result;
end $$;


-- Do not explicitly insert generated retention columns when creating invoices.
create or replace function public.invoice_supplement(_id uuid) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare d public.documents; result uuid; days integer; original_number text;
begin
  select * into d from public.documents where id=_id and user_id=auth.uid()
    and deleted_at is null for update;
  if not found or d.type <> 'quote' or d.parent_order_id is null or d.approved_at is null
    or d.completed_at is null or d.converted_document_id is not null then
    raise exception 'Nur ausgeführte, freigegebene und noch nicht abgerechnete Nachträge können fakturiert werden.';
  end if;
  select payment_terms_days into days from public.company_settings where user_id=auth.uid() limit 1;
  select number into original_number from public.documents where id=d.parent_order_id;
  result := gen_random_uuid();
  -- Copy only invoice business fields. Generated retention_until and lifecycle
  -- columns must be computed by the destination table, never copied as values.
  insert into public.documents(
    id,user_id,type,status,number,issue_date,due_date,parent_order_id,
    customer_id,project_id,customer_number,customer_name,customer_company,customer_email,customer_phone,
    customer_address_line,customer_postal_code,customer_city,customer_country,customer_vat_id,customer_type,
    order_number,buyer_reference,requires_leitweg_id,tax_mode,vat_rate,reverse_charge,service_period,service_description,intro_text,notes,
    attachment_title,attachment_text,discount_percent,discount_amount,discount_reason,
    net_total,vat_amount,total,title)
  values(
    result,d.user_id,'invoice','draft','RE-DEMO-'||result::text,current_date,current_date+coalesce(days,14),d.parent_order_id,
    d.customer_id,d.project_id,d.customer_number,d.customer_name,d.customer_company,d.customer_email,d.customer_phone,
    d.customer_address_line,d.customer_postal_code,d.customer_city,d.customer_country,d.customer_vat_id,d.customer_type,
    d.order_number,d.buyer_reference,d.requires_leitweg_id,d.tax_mode,d.vat_rate,d.reverse_charge,d.service_period,d.service_description,d.intro_text,d.notes,
    d.attachment_title,d.attachment_text,d.discount_percent,d.discount_amount,d.discount_reason,
    d.net_total,d.vat_amount,d.total,'Nachtragsrechnung zu '||original_number);
  insert into public.document_items(document_id,user_id,position,description,quantity,unit,unit_price,is_optional)
  select result,user_id,position,description,quantity,unit,unit_price,false
    from public.document_items where document_id=d.id and not is_optional;
  update public.documents set converted_document_id=result where id=d.id;
  insert into public.document_audit_log(user_id,document_id,document_number,action,details)
  values(d.user_id,d.id,d.number,'supplement_invoiced',jsonb_build_object('invoice_id',result));
  return result;
end $$;

commit;
