begin;
alter table public.qm_cases add column employee_instruction text not null default '' check (char_length(employee_instruction) <= 4000);

-- Separate publication: customer details, internal notes and history never reach employees.
create table public.qm_employee_tasks (
  case_id uuid primary key references public.qm_cases(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete set null,
  title text not null,
  instruction text not null,
  project_name text not null default '',
  priority text not null,
  due_date date,
  status text not null,
  published boolean not null default false,
  updated_at timestamptz not null default now()
);
create index qm_employee_tasks_employee_idx on public.qm_employee_tasks(employee_id,due_date);
create table public.qm_employee_feedback (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.qm_employee_tasks(case_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete restrict,
  kind text not null check (kind in ('in_bearbeitung','bearbeitet','rueckfrage')),
  message text not null check (char_length(btrim(message)) between 1 and 2000),
  photo_paths text[] not null default '{}' check (cardinality(photo_paths) <= 3),
  created_at timestamptz not null default now()
);
create index qm_employee_feedback_case_idx on public.qm_employee_feedback(case_id,created_at desc);
alter table public.qm_employee_tasks enable row level security;
alter table public.qm_employee_feedback enable row level security;
revoke all on public.qm_employee_tasks,public.qm_employee_feedback from public,anon,authenticated;
grant select on public.qm_employee_tasks to authenticated;
grant select,insert on public.qm_employee_feedback to authenticated;
grant all on public.qm_employee_tasks,public.qm_employee_feedback to service_role;
create policy "Owner reads QM tasks" on public.qm_employee_tasks for select to authenticated using (user_id=(select auth.uid()));
create policy "Employee reads assigned QM tasks" on public.qm_employee_tasks for select to authenticated using (
 published and exists(select 1 from public.employees e where e.id=employee_id and e.user_id=qm_employee_tasks.user_id and e.auth_user_id=(select auth.uid()) and e.active)
);
create policy "Owner reads QM feedback" on public.qm_employee_feedback for select to authenticated using (user_id=(select auth.uid()));
create policy "Employee reads own QM feedback" on public.qm_employee_feedback for select to authenticated using (
 exists(select 1 from public.qm_employee_tasks t join public.employees e on e.id=t.employee_id
 where t.case_id=qm_employee_feedback.case_id and t.published and t.employee_id=qm_employee_feedback.employee_id
 and e.auth_user_id=(select auth.uid()) and e.active and e.user_id=qm_employee_feedback.user_id)
);
create policy "Employee submits QM feedback" on public.qm_employee_feedback for insert to authenticated with check (
 exists(select 1 from public.qm_employee_tasks t join public.employees e on e.id=t.employee_id
 where t.case_id=qm_employee_feedback.case_id and t.published and t.status<>'erledigt'
 and t.employee_id=qm_employee_feedback.employee_id and t.user_id=qm_employee_feedback.user_id
 and e.auth_user_id=(select auth.uid()) and e.active)
);
create policy "Gesperrte Konten ausgeschlossen" on public.qm_employee_tasks as restrictive for all to authenticated using ((select app_private.is_account_active())) with check ((select app_private.is_account_active()));
create policy "Gesperrte Konten ausgeschlossen" on public.qm_employee_feedback as restrictive for all to authenticated using ((select app_private.is_account_active())) with check ((select app_private.is_account_active()));

-- Current response per worker; invoker rights preserve feedback RLS.
create view public.qm_latest_feedback with (security_invoker=true) as
 select distinct on (case_id,employee_id) case_id,employee_id,kind,created_at
 from public.qm_employee_feedback order by case_id,employee_id,created_at desc,id desc;
revoke all on public.qm_latest_feedback from public,anon,authenticated;
grant select on public.qm_latest_feedback to authenticated;

-- Internal trigger only: no callable privileged endpoint and no worker write to QM cases.
create function app_private.publish_qm_employee_task() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or auth.uid()<>new.user_id then raise exception 'Falscher Mandant'; end if;
 insert into public.qm_employee_tasks(case_id,user_id,employee_id,title,instruction,project_name,priority,due_date,status,published)
 values(new.id,new.user_id,new.assigned_employee_id,new.title,new.employee_instruction,
 coalesce((select p.name from public.projects p where p.id=new.project_id and p.user_id=new.user_id),''),
 new.priority,new.due_date,new.status,new.assigned_employee_id is not null and char_length(btrim(new.employee_instruction))>0)
 on conflict(case_id) do update set employee_id=excluded.employee_id,title=excluded.title,instruction=excluded.instruction,
 project_name=excluded.project_name,priority=excluded.priority,due_date=excluded.due_date,status=excluded.status,published=excluded.published,updated_at=now();
 return new;
end;
$$;
revoke all on function app_private.publish_qm_employee_task() from public,anon,authenticated,service_role;
create trigger publish_qm_employee_task after insert or update on public.qm_cases for each row execute function app_private.publish_qm_employee_task();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('qm-dateien','qm-dateien',false,10485760,array['image/jpeg','image/png','image/webp']);
create policy "QM participant reads photos" on storage.objects for select to authenticated using (
 bucket_id='qm-dateien' and (
 exists(select 1 from public.qm_employee_feedback f where storage.objects.name=any(f.photo_paths))
 or ((storage.foldername(name))[3]=(select auth.uid())::text and exists(select 1 from public.qm_employee_tasks t
 where t.case_id::text=(storage.foldername(storage.objects.name))[1] and t.published and t.employee_id in
 (select e.id from public.employees e where e.auth_user_id=(select auth.uid()) and e.active)))
 )
);
create policy "Employee uploads QM draft photos" on storage.objects for insert to authenticated with check (
 bucket_id='qm-dateien' and array_length(storage.foldername(name),1)=3
 and (storage.foldername(name))[3]=(select auth.uid())::text and name !~ '(^|/)\.\.(/|$)'
 and exists(select 1 from public.qm_employee_tasks t join public.employees e on e.id=t.employee_id
 where t.case_id::text=(storage.foldername(storage.objects.name))[1] and t.published and t.status<>'erledigt' and e.auth_user_id=(select auth.uid()) and e.active)
 and not exists(select 1 from public.qm_employee_feedback f where f.id::text=(storage.foldername(storage.objects.name))[2])
);
create policy "Employee removes unused QM photos" on storage.objects for delete to authenticated using (
 bucket_id='qm-dateien' and (storage.foldername(name))[3]=(select auth.uid())::text
 and exists(select 1 from public.qm_employee_tasks t join public.employees e on e.id=t.employee_id
 where t.case_id::text=(storage.foldername(storage.objects.name))[1] and t.published and e.auth_user_id=(select auth.uid()) and e.active)
 and not exists(select 1 from public.qm_employee_feedback f where storage.objects.name=any(f.photo_paths))
);
create function app_private.validate_qm_employee_feedback() returns trigger language plpgsql security invoker set search_path='' as $$
declare path text;
begin
 -- Check assignment and open status under caller RLS at submission.
 perform 1 from public.qm_employee_tasks t where t.case_id=new.case_id and t.employee_id=new.employee_id
 and t.user_id=new.user_id and t.published and t.status<>'erledigt';
 if not found then raise exception 'Aufgabe ist nicht mehr verfügbar.'; end if;
 foreach path in array new.photo_paths loop
  if path is null or path not like new.case_id::text||'/'||new.id::text||'/'||auth.uid()::text||'/%'
   or path ~ '(^|/)\.\.(/|$)' or not exists(select 1 from storage.objects o where o.bucket_id='qm-dateien' and o.name=path) then
   raise exception 'Foto gehört nicht zu dieser Rückmeldung.';
  end if;
 end loop;
 new.created_at:=now(); return new;
end;
$$;
revoke all on function app_private.validate_qm_employee_feedback() from public,anon,authenticated,service_role;
create trigger validate_qm_employee_feedback before insert on public.qm_employee_feedback for each row execute function app_private.validate_qm_employee_feedback();
commit;
