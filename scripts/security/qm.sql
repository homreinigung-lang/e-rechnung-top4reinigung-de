-- Loopback-only synthetic fixtures; the transaction is rolled back.
begin;
insert into auth.users(id,email) values
 ('91000000-0000-4000-8000-000000000001','qm-owner@example.invalid'),
 ('91000000-0000-4000-8000-000000000002','qm-other@example.invalid'),
 ('91000000-0000-4000-8000-000000000003','qm-worker@example.invalid'),
 ('91000000-0000-4000-8000-000000000004','qm-colleague@example.invalid');
insert into public.employees(id,user_id,auth_user_id,name) values
 ('92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000003','QM worker'),
 ('92000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000004','QM colleague');
create function pg_temp.qm_denied(statement text) returns void language plpgsql as $$
declare rejected boolean:=false;
begin
 begin execute statement; exception when insufficient_privilege or raise_exception or check_violation then rejected:=true; end;
 if not rejected then raise exception 'Expected rejection: %',statement; end if;
end;
$$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into public.qm_cases(id,user_id,assigned_employee_id,title,description,action_note,employee_instruction,due_date) values
 ('93000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','Nachreinigung','PRIVATE CUSTOMER DESCRIPTION','PRIVATE ADMIN NOTE','Boden nachreinigen','2026-10-08');
insert into public.qm_cases(id,user_id,assigned_employee_id,title) values
 ('93000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','Nicht veröffentlichter interner Fall');
select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin
 assert (select count(*) from public.qm_employee_tasks)=1,'own assigned task';
 assert (select instruction from public.qm_employee_tasks limit 1)='Boden nachreinigen','safe work instruction';
 assert (select count(*) from public.qm_cases)=0,'internal QM cases stay private';
 assert (select count(*) from public.qm_case_events)=0,'internal history stays private';
end $$;
select pg_temp.qm_denied('update public.qm_employee_tasks set status=''erledigt''');
select pg_temp.qm_denied('select app_private.publish_qm_employee_task()');
select pg_temp.qm_denied($q$insert into public.qm_employee_feedback(case_id,user_id,employee_id,kind,message) values ('93000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000002','bearbeitet','Spoof colleague')$q$);
select pg_temp.qm_denied($q$insert into public.qm_employee_feedback(case_id,user_id,employee_id,kind,message,photo_paths) values ('93000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','bearbeitet','Foreign photo',array['foreign/private.jpg'])$q$);
insert into storage.objects(bucket_id,name) values ('qm-dateien','93000000-0000-4000-8000-000000000001/94000000-0000-4000-8000-000000000001/91000000-0000-4000-8000-000000000003/photo.jpg');
insert into public.qm_employee_feedback(id,case_id,user_id,employee_id,kind,message,photo_paths) values
 ('94000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','bearbeitet','Boden gereinigt',array['93000000-0000-4000-8000-000000000001/94000000-0000-4000-8000-000000000001/91000000-0000-4000-8000-000000000003/photo.jpg']);
select pg_temp.qm_denied('update public.qm_employee_feedback set message=''rewritten''');
do $$ begin delete from storage.objects where bucket_id='qm-dateien'; assert not found,'submitted evidence cannot be deleted'; end $$;
select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $$ begin assert (select count(*) from public.qm_employee_tasks)=0,'colleague isolation'; assert (select count(*) from public.qm_employee_feedback)=0,'colleague feedback isolation'; assert (select count(*) from public.qm_latest_feedback)=0,'view preserves RLS'; assert (select count(*) from storage.objects where bucket_id='qm-dateien')=0,'colleague photo isolation'; end $$;
select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin assert (select count(*) from public.qm_employee_tasks)=0,'tenant isolation'; assert (select count(*) from public.qm_employee_feedback)=0,'tenant feedback isolation'; end $$;
select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
 assert (select status from public.qm_cases limit 1)='neu','worker feedback never closes the case';
 assert (select count(*) from public.qm_employee_feedback)=1,'owner sees response';
 assert (select count(*) from storage.objects where bucket_id='qm-dateien')=1,'owner sees evidence';
end $$;
update public.qm_cases set assigned_employee_id='92000000-0000-4000-8000-000000000002';
select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin assert (select count(*) from public.qm_employee_tasks)=0,'old worker loses task on reassignment'; assert (select count(*) from public.qm_employee_feedback)=0,'old worker loses feedback access'; end $$;
select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $$ begin assert (select count(*) from public.qm_employee_tasks)=1,'new worker sees assigned task'; assert (select count(*) from public.qm_employee_feedback)=0,'new worker cannot see predecessor feedback'; end $$;
select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
update public.qm_cases set status='erledigt',solution='Nacharbeit geprüft';
select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $$ begin assert (select status from public.qm_employee_tasks limit 1)='erledigt','closure visible to employee'; end $$;
select pg_temp.qm_denied($q$insert into public.qm_employee_feedback(case_id,user_id,employee_id,kind,message) values ('93000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000002','bearbeitet','Already closed')$q$);
reset role;
update public.employees set active=false where id='92000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $$ begin assert (select count(*) from public.qm_employee_tasks)=0,'inactive employee denied'; end $$;
set local role anon;
select set_config('request.jwt.claims','{}',true);
select pg_temp.qm_denied('select * from public.qm_employee_tasks');
select pg_temp.qm_denied('select * from public.qm_employee_feedback');
rollback;
select 'PASS: QM publication, private internal notes, tenant and colleague isolation, immutable feedback/photos, reassignment and administration-only closure; rolled back';
