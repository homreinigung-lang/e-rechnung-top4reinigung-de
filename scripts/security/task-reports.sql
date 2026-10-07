-- Synthetic fixtures only, executed by the loopback-only security test runner.
begin;
insert into auth.users(id,email) values
 ('81000000-0000-4000-8000-000000000001','report-owner@example.invalid'),
 ('81000000-0000-4000-8000-000000000002','other-owner@example.invalid'),
 ('81000000-0000-4000-8000-000000000003','report-worker@example.invalid'),
 ('81000000-0000-4000-8000-000000000004','colleague@example.invalid');
insert into public.employees(id,user_id,auth_user_id,name) values
 ('82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000003','Report worker'),
 ('82000000-0000-4000-8000-000000000002','81000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000004','Colleague');
insert into public.projects(id,user_id,name) values
 ('83000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','Report site'),
 ('83000000-0000-4000-8000-000000000002','81000000-0000-4000-8000-000000000002','Other site');
insert into public.project_assignments(id,user_id,employee_id,project_id,start_date,end_date) values
 ('84000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001','2026-10-05','2026-10-11'),
 ('84000000-0000-4000-8000-000000000002','81000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000002','83000000-0000-4000-8000-000000000001','2026-10-05','2026-10-11');
create function pg_temp.report_denied(statement text) returns void language plpgsql as $$
declare rejected boolean := false;
begin
 begin execute statement; exception when insufficient_privilege or raise_exception or check_violation then rejected := true; end;
 if not rejected then raise exception 'Expected rejection: %',statement; end if;
end;
$$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
insert into public.employee_task_reports(id,user_id,employee_id,project_id,assignment_id,work_date,kind,material_name,quantity,unit,description,photo_paths) values
 ('85000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000001','2026-10-07','material','Müllbeutel',2,'Rollen','Bitte nachfüllen',array['81000000-0000-4000-8000-000000000003/einsatzmeldungen/85000000-0000-4000-8000-000000000001/test.jpg']);
do $$ begin
 assert (select count(*) from public.employee_task_reports)=1,'worker report visibility';
 update public.employee_task_reports set status='erledigt'; assert not found,'employee must not change processing status';
end $$;
select pg_temp.report_denied($q$insert into public.employee_task_reports(user_id,employee_id,project_id,assignment_id,work_date,kind,description) values ('81000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000002','83000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000002','2026-10-07','problem','Colleague spoof')$q$);
select pg_temp.report_denied($q$insert into public.employee_task_reports(user_id,employee_id,project_id,assignment_id,work_date,kind,description) values ('81000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000002','84000000-0000-4000-8000-000000000001','2026-10-07','problem','Foreign site')$q$);
select pg_temp.report_denied($q$insert into public.employee_task_reports(user_id,employee_id,project_id,assignment_id,work_date,kind,description) values ('81000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000001','2026-11-07','problem','Wrong date')$q$);
select pg_temp.report_denied($q$insert into public.employee_task_reports(user_id,employee_id,project_id,assignment_id,work_date,kind,description,photo_paths) values ('81000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000001','2026-10-07','problem','Foreign photo',array['81000000-0000-4000-8000-000000000002/private.jpg'])$q$);
-- Another worker in the same company cannot read this report.
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $$ begin assert (select count(*) from public.employee_task_reports)=0,'colleague reports'; end $$;
-- Another company cannot read or answer it.
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin assert (select count(*) from public.employee_task_reports)=0,'cross-tenant reports'; update public.employee_task_reports set admin_reply='wrong'; assert not found,'cross-tenant response'; end $$;
-- Owner can respond, but cannot rewrite employee evidence.
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
update public.employee_task_reports set status='in_bearbeitung',admin_reply='Material bestellt';
do $$ begin assert (select count(*) from public.employee_task_reports where admin_reply='Material bestellt' and status='in_bearbeitung')=1,'owner response'; end $$;
select pg_temp.report_denied($q$update public.employee_task_reports set description='rewritten'$q$);
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin assert (select admin_reply from public.employee_task_reports limit 1)='Material bestellt','worker response visibility'; end $$;
set local role anon;
select set_config('request.jwt.claims','{}',true);
select pg_temp.report_denied('select * from public.employee_task_reports');
rollback;
select 'PASS: report creation, tenant/colleague isolation, photos, dates, immutable evidence and admin replies; rolled back';
