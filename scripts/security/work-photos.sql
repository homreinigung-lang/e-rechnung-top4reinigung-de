begin;
create function pg_temp.photo_denied(q text) returns void language plpgsql as $$
begin
  begin execute q; exception when check_violation or insufficient_privilege then return; end;
  raise exception 'Expected rejection: %', q;
end $$;
insert into auth.users(id,email) values
 ('a1000000-0000-4000-8000-000000000001','photo-owner@example.invalid'),
 ('a1000000-0000-4000-8000-000000000002','photo-worker@example.invalid');
insert into public.account_approvals(auth_user_id,status,token) values ('a1000000-0000-4000-8000-000000000001','approved','photo-access');
insert into public.employees(id,user_id,auth_user_id,name) values
 ('a2000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002','Synthetic');
insert into public.time_entries(id,user_id,employee_id,employee_name,work_date,start_time,end_time,hours) values
 ('a3000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','Synthetic','2026-10-08','08:00','09:00',1);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select pg_temp.photo_denied($q$update public.time_entries set photo_paths=array['foreign/arbeitsnachweis/a3000000-0000-4000-8000-000000000001/a.jpg']$q$);
select pg_temp.photo_denied($q$update public.time_entries set photo_paths=array['a1000000-0000-4000-8000-000000000001/gobd/a.pdf']$q$);
select pg_temp.photo_denied($q$update public.time_entries set photo_paths=array['a1000000-0000-4000-8000-000000000001/arbeitsnachweis/a3000000-0000-4000-8000-000000000001/../a.pdf']$q$);
select pg_temp.photo_denied($q$update public.time_entries set photo_paths=array['a1000000-0000-4000-8000-000000000001/arbeitsnachweis/a3000000-0000-4000-8000-000000000001/%2e%2e']$q$);
select pg_temp.photo_denied($q$update public.time_entries set photo_paths=array['a1000000-0000-4000-8000-000000000001/arbeitsnachweis/another-entry/a.jpg']$q$);
update public.time_entries set photo_paths=array['a1000000-0000-4000-8000-000000000001/arbeitsnachweis/a3000000-0000-4000-8000-000000000001/a.jpg'];
select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
update public.time_entries set photo_paths=array['a1000000-0000-4000-8000-000000000002/arbeitsnachweis/a3000000-0000-4000-8000-000000000001/b.jpg'];
do $$ begin assert (select photo_paths[1] like '%/b.jpg' from public.time_entries where id='a3000000-0000-4000-8000-000000000001'), 'employee photo upload denied'; end $$;
reset role;
rollback;
