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
create function pg_temp.chat_denied(statement text) returns void language plpgsql as $$
declare rejected boolean := false;
begin
 begin execute statement; exception when insufficient_privilege or raise_exception or check_violation then rejected := true; end;
 if not rejected then raise exception 'Expected rejection: %',statement; end if;
end;
$$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
insert into storage.objects(bucket_id,name) values('chat-dateien','82000000-0000-4000-8000-000000000001/86000000-0000-4000-8000-000000000001/81000000-0000-4000-8000-000000000003/photo.jpg');
-- Drafts are private to their uploader, even before sending.
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin assert(select count(*) from storage.objects where bucket_id='chat-dateien')=0,'draft privacy'; end $$;
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
insert into public.employee_task_reports(id,user_id,employee_id,project_id,assignment_id,work_date,kind,description) values('85000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000001','2026-10-07','problem','Gerät defekt');
insert into public.chat_messages(id,user_id,thread_employee_id,sender_name,sender_role,sender_auth_user_id,body,attachments,assignment_id,work_date,report_id,read_at) values
 ('86000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','Spoofed boss','owner','81000000-0000-4000-8000-000000000001','Material bitte',
 '[{"path":"82000000-0000-4000-8000-000000000001/86000000-0000-4000-8000-000000000001/81000000-0000-4000-8000-000000000003/photo.jpg","name":"Foto.jpg","mime":"image/jpeg","size":100}]',
 '84000000-0000-4000-8000-000000000001','2026-10-07','85000000-0000-4000-8000-000000000001',now());
do $$ begin
 assert(select sender_role='employee' and sender_name='Report worker' and sender_auth_user_id='81000000-0000-4000-8000-000000000003' and read_at is null from public.chat_messages where id='86000000-0000-4000-8000-000000000001'),'sender metadata enforced';
 assert(select unread_count from public.chat_thread_overview())=0,'own message not unread';
end $$;
-- Sender cannot forge read receipts or swap published files.
select pg_temp.chat_denied($q$insert into storage.objects(bucket_id,name) values('chat-dateien','82000000-0000-4000-8000-000000000001/86000000-0000-4000-8000-000000000001/81000000-0000-4000-8000-000000000003/extra.jpg')$q$);
do $$ begin update public.chat_messages set read_at=now();assert not found,'sender may not mark own message read';delete from storage.objects where bucket_id='chat-dateien';assert not found,'published files cannot be deleted';end $$;
select pg_temp.chat_denied($q$insert into public.chat_messages(user_id,thread_employee_id,body,assignment_id,work_date) values('81000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','Wrong task','84000000-0000-4000-8000-000000000002','2026-10-07')$q$);
select pg_temp.chat_denied($q$insert into public.chat_messages(user_id,thread_employee_id,body,assignment_id,work_date) values('81000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','Wrong date','84000000-0000-4000-8000-000000000001','2026-10-01')$q$);
select pg_temp.chat_denied($q$insert into public.chat_messages(user_id,thread_employee_id,body,report_id) values('81000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','Fake report','85000000-0000-4000-8000-000000000002')$q$);
-- Colleague and unrelated company see neither message nor its attachment or overview.
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $$ begin assert(select count(*) from public.chat_messages)=0,'colleague message isolation';assert(select count(*) from storage.objects where bucket_id='chat-dateien')=0,'colleague files isolation';assert(select count(*) from public.chat_thread_overview())=0,'colleague overview';end $$;
select pg_temp.chat_denied($q$insert into storage.objects(bucket_id,name) values('chat-dateien','82000000-0000-4000-8000-000000000001/86000000-0000-4000-8000-000000000002/81000000-0000-4000-8000-000000000004/wrong.jpg')$q$);
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin assert(select count(*) from public.chat_messages)=0,'company messages isolation';assert(select count(*) from storage.objects where bucket_id='chat-dateien')=0,'company files isolation';assert(select count(*) from public.chat_thread_overview())=0,'company overview';update public.chat_messages set read_at=now();assert not found,'company receipts isolation';end $$;
-- Recipient acknowledges once; caller timestamp is never trusted.
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin assert(select count(*) from storage.objects where bucket_id='chat-dateien')=1,'owner file access after send';assert(select unread_count from public.chat_thread_overview())=1,'owner unread count';end $$;
update public.chat_messages set read_at='2000-01-01';
do $$ begin assert(select read_at>'2026-01-01' from public.chat_messages),'server receipt timestamp';assert(select unread_count from public.chat_thread_overview())=0,'acknowledged unread count';end $$;
select pg_temp.chat_denied($q$update public.chat_messages set body='rewritten'$q$);
-- Owner replies; worker can read and acknowledge. Owner cannot acknowledge own reply.
insert into public.chat_messages(id,user_id,thread_employee_id,body) values('86000000-0000-4000-8000-000000000002','81000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','Bestellt');
select pg_temp.chat_denied($q$update public.chat_messages set read_at=now() where id='86000000-0000-4000-8000-000000000002'$q$);
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin assert(select unread_count from public.chat_thread_overview())=1,'worker unread reply';end $$;
update public.chat_messages set read_at=now() where id='86000000-0000-4000-8000-000000000002';
do $$ begin assert(select unread_count from public.chat_thread_overview())=0,'worker receipt';end $$;
-- Blocked users cannot access messages, files, or RPC aggregates.
reset role;
insert into public.account_approvals(auth_user_id,status,token) values('81000000-0000-4000-8000-000000000003','blocked','chat-test-token');
set local role authenticated;
do $$ begin assert(select count(*) from public.chat_messages)=0,'blocked messages';assert(select count(*) from storage.objects where bucket_id='chat-dateien')=0,'blocked attachments';assert(select count(*) from public.chat_thread_overview())=0,'blocked overview';end $$;
set local role anon;
select set_config('request.jwt.claims','{}',true);
select pg_temp.chat_denied('select * from public.chat_thread_overview()');
rollback;
select 'PASS: chat sender identity, read receipts, private drafts and attachments, task references, colleague/tenant/blocked isolation; rolled back';
