-- Material delivery notes originate in an object, independently of any invoice.
create table public.project_delivery_notes (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete restrict,
 user_id uuid not null references auth.users(id),
 data jsonb not null check(octet_length(data::text) <= 4000000),
 scan_path text,
 version integer not null default 1,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint project_delivery_scan_owner check(scan_path is null or
   scan_path like user_id::text || '/delivery-notes/' || id::text || '/%.pdf')
);
create index project_delivery_notes_project_idx on public.project_delivery_notes(project_id);
create index project_delivery_notes_owner_idx on public.project_delivery_notes(user_id);
alter table public.project_delivery_notes enable row level security;
create policy "Gesperrte Konten ausgeschlossen" on public.project_delivery_notes
 as restrictive for all to authenticated
 using ((select app_private.is_account_active())) with check ((select app_private.is_account_active()));
create policy project_delivery_notes_owner on public.project_delivery_notes for all to authenticated
 using(user_id=(select auth.uid()))
 with check(user_id=(select auth.uid()) and exists(select 1 from public.projects p where p.id=project_id and p.user_id=(select auth.uid())));
revoke all on public.project_delivery_notes from public, anon;
grant select,insert,update,delete on public.project_delivery_notes to authenticated;

alter table public.document_delivery_notes
 add column source_note_id uuid unique references public.project_delivery_notes(id) on delete restrict;
alter table public.document_delivery_notes drop constraint delivery_scan_owner;
alter table public.document_delivery_notes add constraint delivery_scan_owner check(scan_path is null or
 scan_path like user_id::text || '/delivery-notes/' || coalesce(source_note_id,document_id)::text || '/%.pdf');

create function public.guard_project_delivery_note() returns trigger
language plpgsql security invoker set search_path='' as $$
declare p public.projects; r jsonb; s jsonb; k text; i integer; dt date;
begin
 if exists(select 1 from public.document_delivery_notes n where n.source_note_id=case when tg_op='INSERT' then new.id else old.id end) then
   raise exception 'Lieferschein ist einer Rechnung zugeordnet. Zuerst die Zuordnung in der offenen Rechnung entfernen.';
 end if;
 if tg_op='DELETE' then return old; end if;
 select * into p from public.projects where id=new.project_id;
 if not found or p.user_id <> auth.uid() or new.user_id <> p.user_id then
   raise exception 'Lieferschein muss zum eigenen Objekt gehören.';
 end if;
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

 if tg_op='UPDATE' then
   if new.id <> old.id or new.project_id <> old.project_id or new.user_id <> old.user_id then
     raise exception 'Objekt, Nummer und Eigentümer des Datensatzes sind unveränderbar.';
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

   new.version:=old.version+1;
   new.created_at:=old.created_at;
 else new.version:=1;
 end if;
 new.updated_at:=now();
 return new;
end $$;
create trigger project_delivery_note_guard before insert or update or delete on public.project_delivery_notes
 for each row execute function public.guard_project_delivery_note();
revoke all on function public.guard_project_delivery_note() from public,anon,authenticated;

-- An attached invoice contains a frozen copy. Its existing PDF/archive pipeline is retained.
create function public.guard_document_delivery_note_source() returns trigger
language plpgsql security invoker set search_path='' as $$
declare n public.project_delivery_notes; d public.documents; p public.projects;
begin
 if tg_op='UPDATE' and new.source_note_id is distinct from old.source_note_id then
   raise exception 'Objekt-Lieferschein zuerst von der Rechnung entfernen.';
 end if;
 if new.source_note_id is null then return new; end if;
 select * into n from public.project_delivery_notes where id=new.source_note_id for update;
 select * into d from public.documents where id=new.document_id;
 select * into p from public.projects where id=n.project_id;
 if n.id is null or n.user_id <> new.user_id or d.project_id is distinct from n.project_id
   or d.customer_id is distinct from p.customer_id or new.data is distinct from n.data
   or new.scan_path is distinct from n.scan_path then
   raise exception 'Lieferschein, Objekt und Rechnung müssen zusammenpassen. Bearbeitung erfolgt im Objekt.';
 end if;
 return new;
end $$;
create trigger document_delivery_note_source_guard before insert or update on public.document_delivery_notes
 for each row execute function public.guard_document_delivery_note_source();
revoke all on function public.guard_document_delivery_note_source() from public,anon,authenticated;

create function public.attach_project_delivery_note(_note_id uuid,_document_id uuid,_version integer)
returns void language plpgsql security invoker set search_path='' as $$
declare d public.documents; n public.project_delivery_notes;
begin
 -- Invoice first, then source note: same ordering as the invoice snapshot triggers.
 select * into d from public.documents where id=_document_id and user_id=auth.uid() for update;
 if not found or d.type <> 'invoice' or d.is_storno or d.locked_at is not null
   or d.archived_at is not null or d.deleted_at is not null then
   raise exception 'Bitte eine offene Rechnung des Objekts auswählen.';
 end if;
 select * into n from public.project_delivery_notes where id=_note_id and user_id=auth.uid() for update;
 if not found or n.version is distinct from _version or n.project_id is distinct from d.project_id then
   raise exception 'Lieferschein wurde geändert oder gehört zu einem anderen Objekt.';
 end if;
 if exists(select 1 from public.document_delivery_notes where document_id=d.id or source_note_id=n.id) then
   raise exception 'Lieferschein oder Rechnung ist bereits zugeordnet.';
 end if;
 if not exists(select 1 from jsonb_array_elements(n.data->'rows') r where
   coalesce(nullif(replace(r->>'toiletPaper',',','.'),''),'0')::numeric > 0 or
   coalesce(nullif(replace(r->>'handTowels',',','.'),''),'0')::numeric > 0 or
   coalesce(nullif(replace(r->>'soap',',','.'),''),'0')::numeric > 0) or
   (n.scan_path is null and (n.data->'supplierSignature'='null'::jsonb or n.data->'customerSignature'='null'::jsonb)) then
   raise exception 'Bitte Mengen und Monatsunterschriften bzw. unterschriebene Papierfassung im Objekt erfassen.';
 end if;
 insert into public.document_delivery_notes(document_id,user_id,data,scan_path,source_note_id)
 values(d.id,n.user_id,n.data,n.scan_path,n.id);
end $$;
revoke all on function public.attach_project_delivery_note(uuid,uuid,integer) from public,anon;
grant execute on function public.attach_project_delivery_note(uuid,uuid,integer) to authenticated;

create function public.guard_invoice_delivery_note_identity() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if (new.project_id is distinct from old.project_id or new.customer_id is distinct from old.customer_id)
 and exists(select 1 from public.document_delivery_notes n where n.document_id=old.id and n.source_note_id is not null) then
   raise exception 'Bitte zuerst die Lieferschein-Zuordnung entfernen, bevor Kunde oder Objekt der Rechnung geändert wird.';
 end if;
 return new;
end $$;
create trigger invoice_delivery_note_identity_guard before update of project_id,customer_id on public.documents
 for each row execute function public.guard_invoice_delivery_note_identity();
revoke all on function public.guard_invoice_delivery_note_identity() from public,anon,authenticated;

-- Snapshot versions are never reused after detachment/re-attachment.
create sequence public.delivery_note_snapshot_versions as integer;
select setval('public.delivery_note_snapshot_versions', greatest(1,coalesce((select max(version) from public.document_delivery_notes),0)+1), false);
revoke all on sequence public.delivery_note_snapshot_versions from public,anon;
grant usage on sequence public.delivery_note_snapshot_versions to authenticated;
create or replace function public.guard_delivery_note() returns trigger
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
    new.version := nextval('public.delivery_note_snapshot_versions'::regclass)::integer;
    new.created_at := old.created_at;
  else
    new.version := nextval('public.delivery_note_snapshot_versions'::regclass)::integer;
  end if;
  new.updated_at := now();
  return new;
end $$;
