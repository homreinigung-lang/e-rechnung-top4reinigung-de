-- A separate record: invoice columns, positions and layout remain unchanged.
create table public.document_delivery_notes (
  document_id uuid primary key references public.documents(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  data jsonb not null,
  scan_path text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delivery_note_size check (octet_length(data::text) <= 4000000),
  constraint delivery_scan_owner check (scan_path is null or
    scan_path like user_id::text || '/delivery-notes/' || document_id::text || '/%.pdf')
);
create index document_delivery_notes_owner_idx on public.document_delivery_notes(user_id);
alter table public.document_delivery_notes enable row level security;
create policy "Gesperrte Konten ausgeschlossen" on public.document_delivery_notes
as restrictive for all to authenticated
using ((select app_private.is_account_active()))
with check ((select app_private.is_account_active()));
create policy delivery_notes_select on public.document_delivery_notes for select to authenticated
using (user_id = (select auth.uid()) and (select app_private.is_account_active()) and
  exists (select 1 from public.documents d where d.id = document_id and d.user_id = (select auth.uid())));
create policy delivery_notes_insert on public.document_delivery_notes for insert to authenticated
with check (user_id = (select auth.uid()) and (select app_private.is_account_active()) and
  exists (select 1 from public.documents d where d.id = document_id and d.user_id = (select auth.uid())));
create policy delivery_notes_update on public.document_delivery_notes for update to authenticated
using (user_id = (select auth.uid()) and (select app_private.is_account_active()))
with check (user_id = (select auth.uid()) and (select app_private.is_account_active()) and
  exists (select 1 from public.documents d where d.id = document_id and d.user_id = (select auth.uid())));
create policy delivery_notes_delete on public.document_delivery_notes for delete to authenticated
using (user_id = (select auth.uid()) and (select app_private.is_account_active()));
revoke all on public.document_delivery_notes from public, anon;
grant select, insert, update, delete on public.document_delivery_notes to authenticated;

create function public.guard_delivery_note() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare d public.documents; r jsonb; s jsonb; k text; i integer; dt date;
begin
  -- Same parent lock as finalization: notes cannot be edited once the invoice locks.
  select * into d from public.documents
    where id = case when tg_op = 'DELETE' then old.document_id else new.document_id end for update;
  if tg_op = 'DELETE' and not found then return old; end if;
  if not found or d.user_id <> auth.uid() or d.type <> 'invoice' or d.is_storno
    or d.deleted_at is not null or d.locked_at is not null or d.archived_at is not null then
    raise exception 'Lieferschein nur an einer eigenen, offenen Rechnung bearbeitbar.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if new.user_id <> d.user_id then raise exception 'Ungültiger Eigentümer.'; end if;
  if jsonb_typeof(new.data) is distinct from 'object'
    or jsonb_typeof(new.data->'rows') is distinct from 'array' then
    raise exception 'Ungültiger Lieferschein.';
  end if;
  if jsonb_array_length(new.data->'rows') <> 5
    or coalesce(new.data->>'month','') !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
    or length(btrim(coalesce(new.data->>'number',''))) not between 1 and 60
    or length(btrim(coalesce(new.data->>'deliveryAddress',''))) not between 1 and 450
    or not (new.data ?& array['supplierSignature','customerSignature','orderNumber']) then
    raise exception 'Bitte Monat, Nummer, Lieferadresse und fünf Wochen vollständig erfassen.';
  end if;
  for r in select value from jsonb_array_elements(new.data->'rows') loop
    if jsonb_typeof(r) is distinct from 'object' or not (r ?& array['date','signature','toiletPaper','handTowels','soap']) then
      raise exception 'Unvollständige Wochenzeile.';
    end if;
    foreach k in array array['toiletPaper','handTowels','soap'] loop
      if jsonb_typeof(r->k) is distinct from 'string' or
        (r->>k <> '' and r->>k !~ '^[0-9]{1,6}([.,][0-9]{1,3})?$') then
        raise exception 'Ungültige Menge; bitte positive Mengen wie 2 oder 1,5 eingeben.';
      end if;
    end loop;
    if coalesce(r->>'date','') <> '' then
      dt := (r->>'date')::date;
      if to_char(dt,'YYYY-MM') <> new.data->>'month' or to_char(dt,'YYYY-MM-DD') <> r->>'date' then
        raise exception 'Lieferdatum muss im gewählten Monat liegen.';
      end if;
    elsif r->>'toiletPaper' <> '' or r->>'handTowels' <> '' or r->>'soap' <> '' or r->'signature' <> 'null'::jsonb then
      raise exception 'Bitte ein Lieferdatum eintragen.';
    end if;
  end loop;
  for s in select value->'signature' from jsonb_array_elements(new.data->'rows')
    union all select new.data->'supplierSignature' union all select new.data->'customerSignature' loop
    if s is distinct from 'null'::jsonb and (jsonb_typeof(s) is distinct from 'object' or
      length(btrim(coalesce(s->>'name',''))) not between 2 and 100 or
      coalesce(s->>'image','') !~ '^data:image/png;base64,[A-Za-z0-9+/=]+$' or
      length(s->>'image') > 500000 or coalesce(s->>'signedAt','') = '') then
      raise exception 'Unterschrift benötigt Name, Datum und PNG-Bild.';
    end if;
  end loop;
  if tg_op = 'UPDATE' then
    if new.document_id <> old.document_id or new.user_id <> old.user_id then
      raise exception 'Rechnungsbezug und Eigentümer bleiben unverändert.';
    end if;
    if old.scan_path is not null and new.scan_path is not null and
      (new.data is distinct from old.data or new.scan_path <> old.scan_path) then
      raise exception 'Papierfassung zuerst entfernen, bevor Daten geändert werden.';
    end if;
    -- A retained signature always authenticates exactly the same quantities and header.
    for i in 0..4 loop
      if old.data->'rows'->i->'signature' <> 'null'::jsonb and new.data->'rows'->i->'signature' <> 'null'::jsonb then
        if new.data->'rows'->i is distinct from old.data->'rows'->i or
          (new.data - array['rows','supplierSignature','customerSignature']) is distinct from
          (old.data - array['rows','supplierSignature','customerSignature']) then
          raise exception 'Unterschrift zuerst zurücksetzen und nach der Änderung neu erfassen.';
        end if;
      end if;
    end loop;
    foreach k in array array['supplierSignature','customerSignature'] loop
      if old.data->k <> 'null'::jsonb and new.data->k <> 'null'::jsonb and
        ((new.data - array['supplierSignature','customerSignature']) is distinct from
         (old.data - array['supplierSignature','customerSignature']) or new.data->k is distinct from old.data->k) then
        raise exception 'Monatsunterschrift zuerst zurücksetzen und erneut unterschreiben.';
      end if;
    end loop;
    new.version := old.version + 1;
    new.created_at := old.created_at;
  else
    new.version := 1;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger delivery_note_guard before insert or update or delete on public.document_delivery_notes
for each row execute function public.guard_delivery_note();
revoke all on function public.guard_delivery_note() from public, anon, authenticated;

-- Bind the rendered package to the saved version while taking the same invoice lock
-- used by note edits. Concurrent edits fail before locking/archiving stale PDF bytes.
create function public.finalize_invoice_package(_id uuid, _delivery_version integer)
returns public.documents language plpgsql security invoker set search_path = '' as $$
declare d public.documents; n public.document_delivery_notes; actual integer;
begin
  select * into d from public.documents where id=_id and user_id=auth.uid() for update;
  if not found then raise exception 'Rechnung nicht gefunden.'; end if;
  select * into n from public.document_delivery_notes where document_id=_id;
  actual := case when found then n.version else 0 end;
  if actual is distinct from _delivery_version then
    raise exception 'Lieferschein wurde geändert. Bitte PDF neu erstellen und erneut senden.';
  end if;
  if actual > 0 and (not exists(select 1 from jsonb_array_elements(n.data->'rows') r
      where coalesce(nullif(replace(r->>'toiletPaper',',','.'),''),'0')::numeric > 0
         or coalesce(nullif(replace(r->>'handTowels',',','.'),''),'0')::numeric > 0
         or coalesce(nullif(replace(r->>'soap',',','.'),''),'0')::numeric > 0) or
      (n.scan_path is null and (n.data->'supplierSignature' = 'null'::jsonb or n.data->'customerSignature' = 'null'::jsonb))) then
    raise exception 'Lieferschein benötigt Mengen und Monatsunterschriften oder eine unterschriebene Papierfassung.';
  end if;
  return public.finalize_document(_id);
end $$;
revoke all on function public.finalize_invoice_package(uuid,integer) from public, anon;
grant execute on function public.finalize_invoice_package(uuid,integer) to authenticated;
