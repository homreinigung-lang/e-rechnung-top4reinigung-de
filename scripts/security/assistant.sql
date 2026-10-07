-- Synthetic fixtures only, executed by the loopback-only security test runner.
begin;
insert into auth.users(id,email) values
 ('81000000-0000-4000-8000-000000000001','report-owner@example.invalid'),
 ('81000000-0000-4000-8000-000000000002','other-owner@example.invalid'),
 ('81000000-0000-4000-8000-000000000003','report-worker@example.invalid'),
 ('81000000-0000-4000-8000-000000000004','colleague@example.invalid');
create function pg_temp.assistant_denied(statement text) returns void language plpgsql as $$
declare denied boolean := false;
begin
 begin execute statement; exception when insufficient_privilege or raise_exception or check_violation then denied:=true; end;
 if not denied then raise exception 'Expected rejection: %',statement; end if;
end;
$$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
insert into public.assistant_requests(user_id,created_at) values('81000000-0000-4000-8000-000000000003','2000-01-01');
do $$ begin assert(select min(created_at)>current_date from public.assistant_requests),'server quota timestamps';end $$;
select pg_temp.assistant_denied($q$insert into public.assistant_requests(user_id) values('81000000-0000-4000-8000-000000000001')$q$);
select pg_temp.assistant_denied('delete from public.assistant_requests');
select pg_temp.assistant_denied('update public.assistant_requests set created_at=now()');
insert into public.assistant_requests(user_id) select '81000000-0000-4000-8000-000000000003'::uuid from generate_series(1,7);
select pg_temp.assistant_denied('insert into public.assistant_requests default values');
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin assert(select count(*) from public.assistant_requests)=0,'other account quota isolation';end $$;
insert into public.assistant_requests default values;
-- Prove rolling 24-hour quota independently of the minute limit.
reset role;
alter table public.assistant_requests disable trigger assistant_request_validation;
insert into public.assistant_requests(user_id,created_at) select '81000000-0000-4000-8000-000000000001'::uuid,now()-interval '2 hours' from generate_series(1,80);
alter table public.assistant_requests enable trigger assistant_request_validation;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select pg_temp.assistant_denied('insert into public.assistant_requests default values');
reset role;
insert into public.account_approvals(auth_user_id,status,token) values('81000000-0000-4000-8000-000000000002','blocked','assistant-test-token');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin assert(select count(*) from public.assistant_requests)=0,'blocked quota visibility';end $$;
select pg_temp.assistant_denied('insert into public.assistant_requests default values');
set local role anon;
select set_config('request.jwt.claims','{}',true);
select pg_temp.assistant_denied('insert into public.assistant_requests default values');
rollback;
select 'PASS: assistant account isolation, blocked and anonymous access, immutable server quota timestamps, minute and rolling day limits; rolled back';
