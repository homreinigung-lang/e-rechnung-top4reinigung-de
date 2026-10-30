-- Workers may record deliveries only for their assigned objects. Invoice access is unchanged.
create function app_private.employee_delivery_access(_project uuid, _owner uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and app_private.is_account_active() and exists (
   select 1 from public.employees e
   join public.project_assignments a on a.employee_id=e.id
   join public.projects p on p.id=a.project_id and p.user_id=e.user_id
   where e.auth_user_id=auth.uid() and e.user_id=_owner and a.project_id=_project
   and (a.end_date is null or a.end_date >= current_date)
 );
$$;
revoke all on function app_private.employee_delivery_access(uuid,uuid) from public,anon;
grant execute on function app_private.employee_delivery_access(uuid,uuid) to authenticated;
create policy employee_delivery_read on public.project_delivery_notes for select to authenticated
 using(app_private.employee_delivery_access(project_id,user_id));
create policy employee_delivery_insert on public.project_delivery_notes for insert to authenticated
 with check(app_private.employee_delivery_access(project_id,user_id));
create policy employee_delivery_update on public.project_delivery_notes for update to authenticated
 using(app_private.employee_delivery_access(project_id,user_id))
 with check(app_private.employee_delivery_access(project_id,user_id));

create or replace function public.guard_project_delivery_note() returns trigger
language plpgsql security definer set search_path='' as $$
declare p public.projects; r jsonb; s jsonb; k text; i integer; dt date;
begin
 if exists(select 1 from public.document_delivery_notes n where n.source_note_id=case when tg_op='INSERT' then new.id else old.id end) then
   raise exception 'Lieferschein ist einer Rechnung zugeordnet. Zuerst die Zuordnung in der offenen Rechnung entfernen.';
 end if;
 if tg_op='DELETE' then return old; end if;
 select * into p from public.projects where id=new.project_id;
 if not found or new.user_id <> p.user_id or (p.user_id <> auth.uid() and not app_private.employee_delivery_access(new.project_id, new.user_id)) then
   raise exception 'Lieferschein muss zum eigenen Objekt gehören.';
 end if;
 if p.user_id <> auth.uid() then
   if new.scan_path is not null or new.data->>'quantityMode' is distinct from 'individual' then
     raise exception 'Mitarbeiter erfassen nur Wochenmengen und Bauleiter-Unterschriften.';
   end if;
   if tg_op='INSERT' then
     if new.data->'supplierSignature' is distinct from 'null'::jsonb or new.data->'customerSignature' is distinct from 'null'::jsonb then
       raise exception 'Monatsfreigabe erfolgt durch die Verwaltung.';
     end if;
   else
     if (new.data - array['rows','customerSignature']) is distinct from (old.data - array['rows','customerSignature']) or old.scan_path is not null then
       raise exception 'Kopfdaten und Monatsfreigabe bleiben unverändert.';
     end if;
     if old.data->'customerSignature' is distinct from 'null'::jsonb and
       new.data->'customerSignature' is distinct from old.data->'customerSignature' then
       raise exception 'Monatsunterschrift kann nur die Verwaltung zurücksetzen.';
     end if;
     for i in 0..4 loop
       if old.data->'rows'->i->'signature' is distinct from 'null'::jsonb and
         new.data->'rows'->i is distinct from old.data->'rows'->i then
         raise exception 'Bereits bestätigte Wochen kann nur die Verwaltung zurücksetzen.';
       end if;
     end loop;
   end if;
   for r in select value from jsonb_array_elements(new.data->'rows') loop
     if coalesce(r->>'date','') <> '' and not exists (
       select 1 from public.project_assignments a join public.employees e on e.id=a.employee_id
       where e.auth_user_id=auth.uid() and e.user_id=p.user_id and a.project_id=new.project_id
       and (a.start_date is null or a.start_date <= (r->>'date')::date)
       and (a.end_date is null or a.end_date >= (r->>'date')::date)
     ) and (tg_op='INSERT' or not exists (
       select 1 from jsonb_array_elements(old.data->'rows') oldrow where oldrow=r
     )) then raise exception 'Lieferdatum liegt außerhalb Ihres Einsatzes.'; end if;
   end loop;
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
