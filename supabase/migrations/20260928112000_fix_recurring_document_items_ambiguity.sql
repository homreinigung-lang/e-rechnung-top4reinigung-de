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
