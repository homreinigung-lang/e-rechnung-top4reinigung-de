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
    order_number,tax_mode,vat_rate,reverse_charge,service_period,service_description,intro_text,notes,
    attachment_title,attachment_text,discount_percent,discount_amount,discount_reason,
    net_total,vat_amount,total,title)
  values(
    result,d.user_id,'invoice','draft','RE-DEMO-'||result::text,current_date,current_date+coalesce(days,14),d.parent_order_id,
    d.customer_id,d.project_id,d.customer_number,d.customer_name,d.customer_company,d.customer_email,d.customer_phone,
    d.customer_address_line,d.customer_postal_code,d.customer_city,d.customer_country,d.customer_vat_id,d.customer_type,
    d.order_number,d.tax_mode,d.vat_rate,d.reverse_charge,d.service_period,d.service_description,d.intro_text,d.notes,
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
