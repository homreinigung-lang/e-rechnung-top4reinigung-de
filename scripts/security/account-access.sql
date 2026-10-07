-- Synthetic accounts only. Executed in the disposable loopback database.
begin;
insert into auth.users(id,email) values
 ('91000000-0000-4000-8000-000000000001','company-a@example.invalid'),
 ('91000000-0000-4000-8000-000000000002','company-b@example.invalid'),
 ('91000000-0000-4000-8000-000000000003','worker-a@example.invalid'),
 ('91000000-0000-4000-8000-000000000004','worker-b@example.invalid'),
 ('91000000-0000-4000-8000-000000000005','platform-admin@example.invalid');
insert into public.user_roles(user_id,role) values
 ('91000000-0000-4000-8000-000000000005','admin') on conflict do nothing;
insert into public.account_approvals(id,auth_user_id,status,token) values
 ('92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','approved','access-a'),
 ('92000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000002','approved','access-b'),
 ('92000000-0000-4000-8000-000000000005','91000000-0000-4000-8000-000000000005','approved','access-admin');
insert into public.employees(id,user_id,auth_user_id,name,active) values
 ('93000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000003','Worker A',true),
 ('93000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000004','Worker B',true);
insert into public.time_entries(user_id,employee_id,employee_name,hours) values
 ('91000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','Worker A',1);
create function pg_temp.access_denied(statement text) returns void language plpgsql as $$
declare denied boolean := false;
begin
 begin execute statement; exception when insufficient_privilege or raise_exception then denied:=true; end;
 if not denied then raise exception 'Expected rejection: %',statement; end if;
end;
$$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin
 assert public.get_account_access_status()='none','worker starts active';
 assert (select count(*) from public.time_entries)=1,'worker reads own time';
end $$;
select pg_temp.access_denied($q$select public.prepare_company_account_deletion('92000000-0000-4000-8000-000000000001')$q$);
reset role;
update public.account_approvals set status='blocked' where id='92000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ begin
 assert public.get_account_access_status()='blocked','parent-company block reaches worker';
 assert (select count(*) from public.time_entries)=0,'blocked worker loses existing JWT data access';
end $$;
select pg_temp.access_denied('insert into public.assistant_requests default values');
select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $$ begin assert public.get_account_access_status()='none','other-company worker remains active'; end $$;
insert into public.assistant_requests default values;
reset role;
update public.account_approvals set status='approved' where id='92000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin assert public.get_account_access_status()='none','unblock restores worker access'; end $$;
reset role;
update public.employees set active=false where id='93000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ begin assert public.get_account_access_status()='blocked','inactive worker cannot enter portal'; end $$;
reset role;
update public.employees set active=true where id='93000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000005","role":"authenticated"}',true);
select pg_temp.access_denied($q$select public.prepare_company_account_deletion('92000000-0000-4000-8000-000000000005')$q$);
select public.prepare_company_account_deletion('92000000-0000-4000-8000-000000000001');
-- Retrying is allowed, but reactivation during deletion is not.
select public.prepare_company_account_deletion('92000000-0000-4000-8000-000000000001');
select pg_temp.access_denied($q$update public.account_approvals set status='approved' where id='92000000-0000-4000-8000-000000000001'$q$);
select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin assert public.get_account_access_status()='blocked','pending deletion fails closed'; end $$;
reset role;
delete from auth.users where id='91000000-0000-4000-8000-000000000001';
delete from public.account_approvals where id='92000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ begin assert public.get_account_access_status()='blocked','deleted user cannot use an unexpired JWT after approval cleanup'; end $$;
set local role anon;
select set_config('request.jwt.claims','{}',true);
select pg_temp.access_denied('select public.get_account_access_status()');
select pg_temp.access_denied($q$select public.prepare_company_account_deletion('92000000-0000-4000-8000-000000000002')$q$);
rollback;
select 'PASS: inherited company bans, unaffected other companies, inactive workers, admin-only retryable deletion, reactivation race and deleted JWT denial; rolled back';
