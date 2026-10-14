-- Existing tenant RLS remains in force; all RPCs execute as the caller.
alter table public.project_rooms
  add column length_m numeric,
  add column width_m numeric,
  add column glass_sqm numeric not null default 0,
  add constraint room_measurements_valid check (
    (length_m is null or length_m > 0) and (width_m is null or width_m > 0)
    and glass_sqm >= 0);

alter table public.documents
  add column parent_order_id uuid references public.documents(id) on delete restrict,
  add column approval_note text not null default '',
  add column approved_at timestamptz,
  add column completed_at timestamptz,
  add constraint supplement_approval_valid check (
    parent_order_id is null or type <> 'quote' or
    ((approved_at is null and completed_at is null and status <> 'accepted') or
     (approved_at is not null and length(btrim(approval_note)) >= 3 and status = 'accepted')));
create index documents_parent_order_idx on public.documents(parent_order_id);

create function public.guard_supplement() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare p public.documents;
begin
  if tg_op = 'DELETE' then
    if old.parent_order_id is not null and old.approved_at is not null then
      raise exception 'Freigegebene Nachträge bleiben erhalten.';
    end if;
    return old;
  end if;
  if new.parent_order_id is not null then
    select * into p from public.documents where id = new.parent_order_id;
    if not found or p.user_id <> new.user_id or p.type <> 'order' or p.parent_order_id is not null then
      raise exception 'Nachtrag muss zum eigenen ursprünglichen Auftrag gehören.';
    end if;
    if new.customer_id is distinct from p.customer_id or new.project_id is distinct from p.project_id then
      raise exception 'Kunde und Objekt des Nachtrags müssen zum Auftrag passen.';
    end if;
  end if;
  if tg_op = 'UPDATE' and old.parent_order_id is not null then
    if new.parent_order_id is distinct from old.parent_order_id then
      raise exception 'Auftragsbezug des Nachtrags darf nicht geändert werden.';
    end if;
    if old.approved_at is not null and old.type = 'quote' and
      (to_jsonb(new) - array['updated_at','number','sent_at','converted_document_id','completed_at','pdf_path','pdf_sha256','archived_at','retention_until'])
        is distinct from
      (to_jsonb(old) - array['updated_at','number','sent_at','converted_document_id','completed_at','pdf_path','pdf_sha256','archived_at','retention_until']) then
      raise exception 'Freigegebener Nachtrag ist unveränderbar. Bitte neuen Nachtrag anlegen.';
    end if;
    if old.completed_at is not null and new.completed_at is distinct from old.completed_at then
      raise exception 'Ausführung wurde bereits dokumentiert.';
    end if;
    if old.converted_document_id is not null and new.converted_document_id is distinct from old.converted_document_id then
      raise exception 'Nachtrag wurde bereits abgerechnet.';
    end if;
  end if;
  return new;
end $$;
create trigger supplement_guard before insert or update or delete on public.documents
for each row execute function public.guard_supplement();

create function public.guard_supplement_items() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare d public.documents; target uuid;
begin
  -- Lock the document before editing lines, serializing approval and line changes.
  target := case when tg_op = 'DELETE' then old.document_id else new.document_id end;
  select * into d from public.documents where id = target for update;
  if d.parent_order_id is not null and d.type = 'quote' and d.approved_at is not null then
    raise exception 'Positionen eines freigegebenen Nachtrags sind unveränderbar.';
  end if;
  if tg_op = 'UPDATE' and old.document_id <> new.document_id then
    select * into d from public.documents where id = old.document_id for update;
    if d.parent_order_id is not null and d.type = 'quote' and d.approved_at is not null then
      raise exception 'Positionen eines freigegebenen Nachtrags sind unveränderbar.';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger supplement_items_guard before insert or update or delete on public.document_items
for each row execute function public.guard_supplement_items();

create function public.create_supplement(_order_id uuid) returns uuid
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
    customer_type,tax_mode,vat_rate,reverse_charge,title,order_number,intro_text)
  values(p.user_id,'quote','draft','AN-DEMO-'||gen_random_uuid()::text,current_date,p.id,
    p.customer_id,p.project_id,p.customer_name,p.customer_company,p.customer_number,p.customer_email,
    p.customer_address_line,p.customer_postal_code,p.customer_city,p.customer_country,p.customer_vat_id,
    p.customer_type,p.tax_mode,p.vat_rate,p.reverse_charge,'Nachtragsangebot zu '||p.number,p.order_number,
    'Zusätzliche Leistungen zum Auftrag '||p.number||'. Der ursprüngliche Leistungsumfang bleibt bestehen.')
  returning id into result;
  insert into public.document_audit_log(user_id,document_id,document_number,action,details)
  values(p.user_id,result,'','supplement_created',jsonb_build_object('parent_order_id',p.id));
  return result;
end $$;

create function public.approve_supplement(_id uuid, _note text) returns void
language plpgsql security invoker set search_path = '' as $$
declare d public.documents; subtotal numeric; discount numeric; net numeric; vat numeric;
begin
  select * into d from public.documents where id = _id and user_id = auth.uid()
    and deleted_at is null for update;
  if not found or d.type <> 'quote' or d.parent_order_id is null or d.approved_at is not null
    or d.status not in ('draft','sent') or length(btrim(_note)) < 3 then
    raise exception 'Freigabe benötigt einen offenen Nachtrag und einen dokumentierten Kundennachweis.';
  end if;
  if not exists(select 1 from public.document_items where document_id = d.id and not is_optional)
    or exists(select 1 from public.document_items where document_id = d.id
      and (btrim(description) = '' or quantity <= 0)) then
    raise exception 'Bitte gültige Leistungspositionen erfassen.';
  end if;
  select coalesce(sum(round(quantity * unit_price,2)),0) into subtotal
    from public.document_items where document_id = d.id and not is_optional;
  discount := round(subtotal * least(100,greatest(0,d.discount_percent))/100,2);
  net := subtotal - discount;
  vat := round(net*d.vat_rate/100,2);
  update public.documents set status='accepted',approved_at=now(),approval_note=btrim(_note),
    net_total=net,discount_amount=discount,vat_amount=vat,total=net+vat where id=d.id;
  insert into public.document_audit_log(user_id,document_id,document_number,action,details)
  values(d.user_id,d.id,d.number,'supplement_approved',jsonb_build_object('evidence',btrim(_note)));
end $$;

create function public.complete_supplement(_id uuid) returns void
language plpgsql security invoker set search_path = '' as $$
declare d public.documents;
begin
  select * into d from public.documents where id=_id and user_id=auth.uid()
    and deleted_at is null for update;
  if not found or d.type <> 'quote' or d.parent_order_id is null or d.approved_at is null
    or d.completed_at is not null or d.converted_document_id is not null then
    raise exception 'Nur freigegebene, noch nicht ausgeführte Nachträge können abgeschlossen werden.';
  end if;
  update public.documents set completed_at=now() where id=d.id;
  insert into public.document_audit_log(user_id,document_id,document_number,action,details)
  values(d.user_id,d.id,d.number,'supplement_completed','{}');
end $$;

create function public.invoice_supplement(_id uuid) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare d public.documents; result uuid; payload jsonb; days integer; original_number text;
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
  payload := to_jsonb(d) || jsonb_build_object('id',result,'type','invoice','status','draft',
    'number','RE-DEMO-'||result::text,'issue_date',current_date,'due_date',current_date+coalesce(days,14),
    'created_at',now(),'updated_at',now(),'approved_at',null,'completed_at',null,'approval_note','',
    'title','Nachtragsrechnung zu '||original_number,'converted_document_id',null,
    'sent_at',null,'locked_at',null,'pdf_path','','pdf_sha256','','archived_at',null,
    'retention_until',null,'paid_at',null,'reminder_level',0,'last_reminder_at',null,
    'recurring_invoice_id',null,'recurring_run_date',null);
  insert into public.documents select (jsonb_populate_record(null::public.documents,payload)).*;
  insert into public.document_items(document_id,user_id,position,description,quantity,unit,unit_price,is_optional)
  select result,user_id,position,description,quantity,unit,unit_price,false
    from public.document_items where document_id=d.id and not is_optional;
  update public.documents set converted_document_id=result where id=d.id;
  insert into public.document_audit_log(user_id,document_id,document_number,action,details)
  values(d.user_id,d.id,d.number,'supplement_invoiced',jsonb_build_object('invoice_id',result));
  return result;
end $$;

revoke all on function public.guard_supplement(), public.guard_supplement_items() from public,anon,authenticated;
revoke all on function public.create_supplement(uuid), public.approve_supplement(uuid,text),
  public.complete_supplement(uuid), public.invoice_supplement(uuid) from public,anon;
grant execute on function public.create_supplement(uuid), public.approve_supplement(uuid,text),
  public.complete_supplement(uuid), public.invoice_supplement(uuid) to authenticated;
