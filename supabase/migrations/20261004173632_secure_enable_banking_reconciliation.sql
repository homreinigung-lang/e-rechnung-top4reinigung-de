begin;

create schema if not exists app_private;

-- No data is copied, rewritten, or silently adopted from localStorage.
-- Existing central connections stay readable; future binding writes are server-only.
create or replace function app_private.guard_enable_banking_connection()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('postgres', 'supabase_admin', 'service_role') then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  if (tg_op <> 'INSERT' and old.provider = 'enable_banking')
     or (tg_op <> 'DELETE' and new.provider = 'enable_banking') then
    raise exception 'Enable Banking connections are managed by the server' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end $$;
revoke all on function app_private.guard_enable_banking_connection() from public, anon, authenticated;
create trigger guard_enable_banking_connection before insert or update or delete
on public.bank_connections for each row execute function app_private.guard_enable_banking_connection();

create table public.enable_banking_auth_states (
  state_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  psu_hash text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz
);
create index enable_banking_auth_states_expiry_idx on public.enable_banking_auth_states(expires_at);
alter table public.enable_banking_auth_states enable row level security;
revoke all on public.enable_banking_auth_states from public, anon, authenticated;
grant select, insert, update, delete on public.enable_banking_auth_states to service_role;

create table public.enable_banking_payments (
  account_hash text not null,
  entry_reference text not null,
  user_id uuid not null references auth.users(id),
  document_id uuid not null references public.documents(id),
  booking_date date not null,
  amount numeric(14,2) not null check (amount > 0),
  currency text not null check (currency = 'EUR'),
  created_at timestamptz not null default now(),
  primary key (account_hash, entry_reference),
  unique (document_id)
);
create index enable_banking_payments_user_idx on public.enable_banking_payments(user_id);
alter table public.enable_banking_payments enable row level security;
revoke all on public.enable_banking_payments from public, anon, authenticated, service_role;
grant select on public.enable_banking_payments to authenticated;
grant select, insert on public.enable_banking_payments to service_role;

create or replace function public.enable_banking_access()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    exists (select 1 from public.user_roles where user_id = auth.uid() and role::text = 'admin')
    or not exists (select 1 from public.account_approvals where auth_user_id = auth.uid() and status in ('blocked', 'rejected'))
  )
$$;
revoke all on function public.enable_banking_access() from public, anon;
grant execute on function public.enable_banking_access() to authenticated, service_role;
create policy "Read own bank payment evidence" on public.enable_banking_payments for select to authenticated
  using (user_id = (select auth.uid()) and (select public.enable_banking_access()));

create or replace function app_private.bank_normalized(_value text)
returns text language sql immutable strict set search_path = '' as $$
  select regexp_replace(lower(normalize(_value, NFKD)), '[^a-z0-9]', '', 'g')
$$;
create or replace function app_private.bank_number_present(_text text, _number text)
returns boolean language sql immutable strict set search_path = '' as $$
  select length(app_private.bank_normalized(_number)) >= 3 and
    lower(normalize(_text, NFKD)) ~ ('(^|[^a-z0-9_/-])' ||
      array_to_string(regexp_split_to_array(trim(both ' ' from regexp_replace(lower(normalize(_number, NFKD)), '[^a-z0-9]+', ' ', 'g')), ' +'), '[^a-z0-9]*') ||
      '($|[^a-z0-9_/-])')
$$;
revoke all on function app_private.bank_normalized(text), app_private.bank_number_present(text,text) from public, anon, authenticated;
grant usage on schema app_private to service_role;
grant execute on function app_private.bank_normalized(text), app_private.bank_number_present(text,text) to service_role;

-- All three mutation RPCs take the same user lock. Refresh cannot revive a
-- disconnected connection, nor pay against a superseded session.
create or replace function public.enable_banking_attach(_user_id uuid, _session jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  sid text := _session->>'session_id';
  ids text[];
  cid uuid;
  item text;
begin
  select array_agg(value->>'uid' order by value->>'uid') into ids
    from jsonb_array_elements(_session->'accounts') where coalesce(value->>'uid','') <> '';
  if coalesce(sid,'') = '' or coalesce(cardinality(ids),0) = 0 then raise exception 'Incomplete bank session'; end if;
  perform pg_advisory_xact_lock(hashtextextended('enable-banking:' || _user_id::text, 0));
  if exists (select 1 from public.account_approvals where auth_user_id = _user_id and status in ('blocked','rejected'))
      and not exists (select 1 from public.user_roles where user_id = _user_id and role::text = 'admin') then
    raise exception 'Account access denied' using errcode = '42501';
  end if;
  -- Locks shared across users prevent concurrent cross-owner account claims.
  foreach item in array ids loop
    perform pg_advisory_xact_lock(hashtextextended('enable-banking-account:' || item, 0));
  end loop;
  if exists (select 1 from public.bank_connections where provider = 'enable_banking'
      and user_id <> _user_id and (requisition_id = sid or account_ids && ids)) then
    raise exception 'Bank session already belongs to another user' using errcode = '42501';
  end if;
  select id into cid from public.bank_connections where provider = 'enable_banking' and user_id = _user_id
    order by updated_at desc, id limit 1 for update;
  update public.bank_connections set status = 'disconnected'
    where provider = 'enable_banking' and user_id = _user_id and status = 'connected' and id is distinct from cid;
  if cid is null then
    insert into public.bank_connections(user_id,provider,requisition_id,account_ids,status,institution_name,institution_id)
      values(_user_id,'enable_banking',sid,ids,'connected',coalesce(_session#>>'{aspsp,name}',''),coalesce(_session#>>'{aspsp,country}','')) returning id into cid;
  else
    update public.bank_connections set requisition_id = sid, account_ids = ids, status = 'connected',
      institution_name = coalesce(_session#>>'{aspsp,name}',''), institution_id = coalesce(_session#>>'{aspsp,country}',''), last_sync_at = now()
      where id = cid;
  end if;
  return cid;
end $$;

create or replace function public.enable_banking_disconnect(_user_id uuid, _session_id text)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('enable-banking:' || _user_id::text, 0));
  if not exists (select 1 from public.bank_connections where user_id = _user_id and provider = 'enable_banking'
      and status = 'connected' and requisition_id = _session_id) then return false; end if;
  update public.bank_connections set status = 'disconnected' where user_id = _user_id and provider = 'enable_banking'
    and status = 'connected' and requisition_id = _session_id;
  return true;
end $$;

create or replace function public.enable_banking_reconcile(
  _user_id uuid, _connection_id uuid, _session_id text, _account_id text, _account_hash text, _tx jsonb
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  amount_text text := _tx#>>'{transaction_amount,amount}';
  amount_value numeric;
  entry_ref text := _tx->>'entry_reference';
  paid_date date;
  date_text text := coalesce(nullif(_tx->>'booking_date',''), _tx->>'value_date');
  payment_text text;
  debtor_name text := app_private.bank_normalized(coalesce(_tx#>>'{debtor,name}',''));
  candidates uuid[];
  target public.documents;
begin
  if _tx->>'credit_debit_indicator' is distinct from 'CRDT' or _tx->>'status' is distinct from 'BOOK'
     or _tx#>>'{transaction_amount,currency}' is distinct from 'EUR'
     or coalesce(entry_ref,'') = '' or coalesce(_account_hash,'') = ''
     or coalesce(amount_text,'') !~ '^[0-9]+([.][0-9]{1,2})?$'
     or coalesce(date_text,'') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return null; end if;
  amount_value := amount_text::numeric;
  if amount_value <= 0 or amount_value > 999999999999.99 then return null; end if;
  begin paid_date := date_text::date; exception when others then return null; end;
  if paid_date > current_date then return null; end if;
  perform pg_advisory_xact_lock(hashtextextended('enable-banking:' || _user_id::text, 0));
  if exists (select 1 from public.account_approvals where auth_user_id = _user_id and status in ('blocked','rejected'))
      and not exists (select 1 from public.user_roles where user_id = _user_id and role::text = 'admin') then
    raise exception 'Account access denied' using errcode = '42501';
  end if;
  perform 1 from public.bank_connections where id = _connection_id and user_id = _user_id
    and provider = 'enable_banking' and status = 'connected' and requisition_id = _session_id
    and _account_id = any(account_ids) for update;
  if not found then raise exception 'Bank connection changed' using errcode = '42501'; end if;
  if exists (select 1 from public.enable_banking_payments where account_hash = _account_hash and entry_reference = entry_ref) then return null; end if;
  payment_text := concat_ws(' ',
    case when jsonb_typeof(_tx->'remittance_information') = 'array'
      then (select string_agg(value,' ') from jsonb_array_elements_text(_tx->'remittance_information'))
      else _tx->>'remittance_information' end, _tx->>'reference_number');
  -- A reference to any known invoice forbids fallback to a different invoice,
  -- including an already paid/cancelled/deleted invoice or a different amount.
  select array_agg(id) into candidates from public.documents where user_id = _user_id and type::text = 'invoice'
    and app_private.bank_number_present(payment_text,number);
  if coalesce(cardinality(candidates),0) > 0 then
    if cardinality(candidates) <> 1 then return null; end if;
  else
    if length(debtor_name) < 4 or lower(payment_text) ~ '(^|[^a-z0-9])(re|rechnung|invoice)[[:space:]#/-]*[0-9]' then return null; end if;
    select array_agg(id) into candidates from public.documents where user_id = _user_id and type::text = 'invoice'
      and deleted_at is null and not is_storno and status::text in ('sent','paid') and issue_date <= paid_date and total = amount_value
      and ((length(app_private.bank_normalized(customer_name)) >= 4 and app_private.bank_normalized(customer_name) = debtor_name)
        or (length(app_private.bank_normalized(customer_company)) >= 4 and app_private.bank_normalized(customer_company) = debtor_name));
    if coalesce(cardinality(candidates),0) <> 1 then return null; end if;
  end if;
  select * into target from public.documents where id = candidates[1] and user_id = _user_id for update;
  if not found or target.status::text <> 'sent' or target.deleted_at is not null or target.is_storno
      or target.total <> amount_value or target.issue_date > paid_date then return null; end if;
  -- Durable evidence and invoice update commit together. A manual undo does
  -- not free an old bank payment to settle a different invoice.
  insert into public.enable_banking_payments(account_hash,entry_reference,user_id,document_id,booking_date,amount,currency)
    values(_account_hash,entry_ref,_user_id,target.id,paid_date,amount_value,'EUR') on conflict do nothing;
  if not found then return null; end if;
  update public.documents set status = 'paid', paid_at = paid_date where id = target.id and status::text = 'sent';
  insert into public.document_audit_log(user_id,document_id,document_number,action,details)
    values(_user_id,target.id,target.number,'payment_received',jsonb_build_object('paid_at',paid_date,'source','enable_banking','entry_reference',entry_ref));
  return target.id;
end $$;

revoke all on function public.enable_banking_attach(uuid,jsonb), public.enable_banking_disconnect(uuid,text),
  public.enable_banking_reconcile(uuid,uuid,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.enable_banking_attach(uuid,jsonb), public.enable_banking_disconnect(uuid,text),
  public.enable_banking_reconcile(uuid,uuid,text,text,text,jsonb) to service_role;
commit;
