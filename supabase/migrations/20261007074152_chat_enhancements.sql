begin;
alter table public.chat_messages
 add column attachments jsonb not null default '[]'::jsonb,
 add column read_at timestamptz,
 add column assignment_id uuid references public.project_assignments(id) on delete set null,
 add column work_date date,
 add column report_id uuid references public.employee_task_reports(id) on delete set null;
alter table public.chat_messages add constraint chat_attachments_array check (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 3);
create index chat_unread_idx on public.chat_messages(user_id,thread_employee_id) where read_at is null;
create index chat_assignment_idx on public.chat_messages(assignment_id);
create index chat_report_idx on public.chat_messages(report_id);
grant update(read_at) on public.chat_messages to authenticated;
create policy "Recipient marks messages read" on public.chat_messages for update to authenticated
 using (sender_auth_user_id <> (select auth.uid()) and thread_employee_id = public.my_employee_id() and user_id = public.my_employee_owner())
 with check (sender_auth_user_id <> (select auth.uid()) and thread_employee_id = public.my_employee_id() and user_id = public.my_employee_owner());

-- Private reciprocal storage, scoped to one employee's conversation.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values ('chat-dateien','chat-dateien',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf','text/plain']);
create policy "Chat participant reads attachments" on storage.objects for select to authenticated using (
 bucket_id = 'chat-dateien' and exists(select 1 from public.employees e where e.id::text = (storage.foldername(storage.objects.name))[1]
 and (e.user_id = (select auth.uid()) or (e.auth_user_id = (select auth.uid()) and e.active)))
 and ((storage.foldername(storage.objects.name))[3] = (select auth.uid())::text or exists(
 select 1 from public.chat_messages m where m.id::text = (storage.foldername(storage.objects.name))[2]
 and m.thread_employee_id::text = (storage.foldername(storage.objects.name))[1]
 and exists(select 1 from jsonb_array_elements(m.attachments) a where a->>'path' = storage.objects.name)))
);
create policy "Chat participant uploads draft attachments" on storage.objects for insert to authenticated with check (
 bucket_id = 'chat-dateien' and array_length(storage.foldername(storage.objects.name),1) = 3
 and (storage.foldername(storage.objects.name))[3] = (select auth.uid())::text
 and storage.objects.name !~ '(^|/)\.\.(/|$)'
 and exists(select 1 from public.employees e where e.id::text = (storage.foldername(storage.objects.name))[1]
 and (e.user_id = (select auth.uid()) or (e.auth_user_id = (select auth.uid()) and e.active)))
 and not exists(select 1 from public.chat_messages m where m.id::text = (storage.foldername(storage.objects.name))[2])
);
create policy "Chat uploader removes unused drafts" on storage.objects for delete to authenticated using (
 bucket_id = 'chat-dateien' and (storage.foldername(storage.objects.name))[3] = (select auth.uid())::text
 and exists(select 1 from public.employees e where e.id::text = (storage.foldername(storage.objects.name))[1]
 and (e.user_id = (select auth.uid()) or (e.auth_user_id = (select auth.uid()) and e.active)))
 and not exists(select 1 from public.chat_messages m where exists(
 select 1 from jsonb_array_elements(m.attachments) a where a->>'path' = storage.objects.name))
);

create function public.validate_chat_message() returns trigger language plpgsql security invoker set search_path = '' as $$
declare e public.employees%rowtype; a public.project_assignments%rowtype; r public.employee_task_reports%rowtype; f jsonb;
begin
 if tg_op = 'UPDATE' then
  if pg_trigger_depth() > 1 and (to_jsonb(new) - array['assignment_id','report_id','updated_at']) = (to_jsonb(old) - array['assignment_id','report_id','updated_at'])
   and (new.assignment_id is null or new.assignment_id = old.assignment_id) and (new.report_id is null or new.report_id = old.report_id) then return new; end if;
  if (to_jsonb(new) - array['read_at','updated_at']) is distinct from (to_jsonb(old) - array['read_at','updated_at'])
   or old.sender_auth_user_id = auth.uid() or new.read_at is null then
   raise exception 'Nur der Empfänger darf eine Nachricht als gelesen markieren.';
  end if;
  new.read_at := coalesce(old.read_at,clock_timestamp()); new.updated_at := now(); return new;
 end if;
 select * into e from public.employees where id = new.thread_employee_id;
 if not found or e.user_id <> new.user_id or auth.uid() is null
  or (auth.uid() <> e.user_id and (auth.uid() is distinct from e.auth_user_id or not e.active)) then
  raise exception 'Keine Berechtigung für dieses Gespräch.';
 end if;
 new.sender_auth_user_id := auth.uid();
 new.sender_role := case when auth.uid() = e.user_id then 'owner' else 'employee' end;
 new.sender_name := case when auth.uid() = e.user_id then 'Verwaltung' else e.name end;
 new.read_at := null; new.created_at := now(); new.updated_at := now();
 new.body := btrim(new.body);
 if char_length(new.body) > 4000 or (new.body = '' and jsonb_array_length(new.attachments) = 0) then raise exception 'Nachricht leer oder zu lang.'; end if;
 if new.assignment_id is not null then
  select * into a from public.project_assignments where id = new.assignment_id;
  if not found or a.employee_id <> e.id or a.user_id <> e.user_id or new.work_date is null
   or (a.start_date is not null and new.work_date < a.start_date) or (a.end_date is not null and new.work_date > a.end_date) then
   raise exception 'Einsatz gehört nicht zu diesem Gespräch oder Datum.';
  end if;
 elsif new.work_date is not null then raise exception 'Datum benötigt einen Einsatz.'; end if;
 if new.report_id is not null then
  select * into r from public.employee_task_reports where id = new.report_id;
  if not found or r.employee_id <> e.id or r.user_id <> e.user_id
   or (new.assignment_id is not null and (new.assignment_id is distinct from r.assignment_id or new.work_date <> r.work_date)) then
   raise exception 'Meldung gehört nicht zu diesem Gespräch.';
  end if;
 end if;
 for f in select value from jsonb_array_elements(new.attachments) loop
  if jsonb_typeof(f) <> 'object' or coalesce(f->>'path','') not like e.id::text || '/' || new.id::text || '/' || auth.uid()::text || '/%'
   or f->>'path' ~ '(^|/)\.\.(/|$)' or coalesce(char_length(f->>'name'),0) not between 1 and 180
   or coalesce(f->>'mime','') not in ('image/jpeg','image/png','image/webp','application/pdf','text/plain')
   or coalesce((f->>'size')::bigint,0) not between 1 and 10485760
   or not exists(select 1 from storage.objects o where o.bucket_id = 'chat-dateien' and o.name = f->>'path') then
   raise exception 'Ungültiger oder fehlender Anhang.';
  end if;
 end loop;
 return new;
end;
$$;
revoke all on function public.validate_chat_message() from public,anon,authenticated;
create trigger chat_message_validation before insert or update on public.chat_messages for each row execute function public.validate_chat_message();

-- Invoker RPC: RLS remains effective for tenant isolation and blocked accounts.
create function public.chat_thread_overview() returns table(thread_employee_id uuid,body text,created_at timestamptz,unread_count bigint)
 language sql stable security invoker set search_path = '' as $$
 with visible as (select m.* from public.chat_messages m where auth.uid() is not null and m.thread_employee_id is not null),
 latest as (select distinct on (v.thread_employee_id) v.thread_employee_id,
 case when v.body = '' then 'Anhang' else v.body end as body,v.created_at from visible v order by v.thread_employee_id,v.created_at desc,v.id desc),
 unread as (select v.thread_employee_id,count(*) as n from visible v where v.sender_auth_user_id <> auth.uid() and v.read_at is null group by v.thread_employee_id)
 select l.thread_employee_id,l.body,l.created_at,coalesce(u.n,0) from latest l left join unread u using(thread_employee_id);
$$;
revoke all on function public.chat_thread_overview() from public,anon;
grant execute on function public.chat_thread_overview() to authenticated,service_role;
commit;
