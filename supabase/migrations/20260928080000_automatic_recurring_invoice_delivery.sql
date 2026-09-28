alter table public.documents
  add column if not exists recurring_invoice_id uuid references public.recurring_invoices(id) on delete set null,
  add column if not exists recurring_run_date date;

create unique index if not exists documents_recurring_run_unique
  on public.documents(user_id, recurring_invoice_id, recurring_run_date)
  where recurring_invoice_id is not null and recurring_run_date is not null;

create or replace function public.next_document_number_for_user(
  _user_id uuid,
  _kind text,
  _issue_date date
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  y integer := extract(year from coalesce(_issue_date, current_date))::integer;
  previous integer;
  highest integer;
  v integer;
  prefix text;
  kind_type public.doc_type;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Nur interner Dienst erlaubt';
  end if;
  if _user_id is null then raise exception 'Benutzer fehlt'; end if;
  if _kind not in ('invoice','storno','order','quote') or _kind is null then
    raise exception 'Unbekannte Belegart';
  end if;

  prefix := case _kind when 'invoice' then 'RE-' when 'storno' then 'ST-' when 'order' then 'AB-' else 'AN-' end;
  kind_type := case when _kind in ('invoice','storno') then 'invoice'::public.doc_type when _kind='order' then 'order'::public.doc_type else 'quote'::public.doc_type end;

  insert into public.number_sequences(user_id,kind,year,last_value)
    values(_user_id,_kind,y,0)
    on conflict (user_id,kind,year) do nothing;

  select last_value into previous
  from public.number_sequences
  where user_id=_user_id and kind=_kind and year=y
  for update;

  select coalesce(max(substring(number from '[0-9]+$')::integer),0) into highest
  from public.documents
  where user_id=_user_id
    and type=kind_type
    and number ~ ('^'||prefix||y::text||'-[0-9]+$');

  v := greatest(previous,highest)+1;

  update public.number_sequences
  set last_value=v, updated_at=now()
  where user_id=_user_id and kind=_kind and year=y;

  return prefix||y::text||'-'||lpad(v::text,greatest(4,length(v::text)),'0');
end
$$;

revoke all on function public.next_document_number_for_user(uuid,text,date) from public, anon, authenticated;
grant execute on function public.next_document_number_for_user(uuid,text,date) to service_role;

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
  if auth.role() <> 'service_role' then
    raise exception 'Nur interner Dienst erlaubt';
  end if;

  select * into rec
  from public.recurring_invoices
  where id=_recurring_id
  for update;

  if not found or not rec.active or rec.template_document_id is null or rec.next_run > coalesce(_today,current_date) then
    return;
  end if;

  select * into existing
  from public.documents
  where user_id=rec.user_id
    and recurring_invoice_id=rec.id
    and recurring_run_date=rec.next_run
  limit 1;

  if found then
    return query select existing.id, existing.number, rec.user_id, rec.next_run, rec.interval_months, existing.sent_at is not null;
    return;
  end if;

  select * into src
  from public.documents
  where id=rec.template_document_id and user_id=rec.user_id;

  if not found then
    raise exception 'Vorlage-Rechnung nicht gefunden';
  end if;

  select coalesce(payment_terms_days,14) into terms
  from public.company_settings
  where user_id=rec.user_id
  limit 1;

  new_number := public.next_document_number_for_user(rec.user_id,'invoice',rec.next_run);

  insert into public.documents(
    user_id,type,number,status,issue_date,due_date,
    customer_id,customer_name,customer_company,customer_email,customer_phone,
    customer_address_line,customer_postal_code,customer_city,customer_country,customer_vat_id,
    reverse_charge,intro_text,notes,total,order_number,tax_mode,vat_rate,service_period,
    net_total,vat_amount,attachment_title,attachment_text,customer_number,service_description,
    discount_percent,discount_amount,discount_reason,title,customer_type,project_id,
    planned_hours_month,planned_visits_month,recurring_invoice_id,recurring_run_date
  )
  values(
    rec.user_id,'invoice',new_number,'draft',rec.next_run,rec.next_run + greatest(coalesce(terms,14),0),
    src.customer_id,src.customer_name,src.customer_company,src.customer_email,src.customer_phone,
    src.customer_address_line,src.customer_postal_code,src.customer_city,src.customer_country,src.customer_vat_id,
    src.reverse_charge,src.intro_text,src.notes,src.total,src.order_number,src.tax_mode,src.vat_rate,src.service_period,
    src.net_total,src.vat_amount,src.attachment_title,src.attachment_text,src.customer_number,src.service_description,
    src.discount_percent,src.discount_amount,src.discount_reason,src.title,src.customer_type,src.project_id,
    src.planned_hours_month,src.planned_visits_month,rec.id,rec.next_run
  )
  returning id into new_id;

  insert into public.document_items(document_id,user_id,position,description,quantity,unit,unit_price,is_optional)
  select new_id,rec.user_id,position,description,quantity,unit,unit_price,is_optional
  from public.document_items
  where document_id=rec.template_document_id
  order by position;

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