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
 ('84000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001','2026-10-05',null),
 ('84000000-0000-4000-8000-000000000002','81000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000002','83000000-0000-4000-8000-000000000001','2026-10-05',null);
create function pg_temp.denied(q text) returns void language plpgsql as $$
declare rejected boolean:=false;
begin begin execute q; exception when insufficient_privilege or raise_exception or check_violation then rejected:=true; end; assert rejected,'Expected rejection'; end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
insert into public.project_delivery_notes(id,project_id,user_id,data)
select '85000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001',jsonb_build_object('quantityMode','individual','number','LS-WORKER','month','2026-10','orderNumber','','deliveryAddress','Test site','supplierSignature',null,'customerSignature',null,'rows',jsonb_agg(jsonb_build_object('date',case when i=1 then '2026-10-07' else '' end,'toiletPaper',case when i=1 then '32' else '' end,'handTowels','','soap','','signature',null) order by i)) from generate_series(1,5) i;
do $$ begin assert (select count(*) from public.project_delivery_notes)=1; assert (select count(*) from public.documents)=0; end $$;
select pg_temp.denied($q$update public.project_delivery_notes set data=jsonb_set(data,'{deliveryAddress}','"Other"')$q$);
select pg_temp.denied($q$update public.project_delivery_notes set data=jsonb_set(data,'{rows,0,date}','"2026-10-01"')$q$);
update public.project_delivery_notes set data=jsonb_set(data,'{rows,0,signature}','{"name":"Bauleiter Test","image":"data:image/png;base64,YWJj","signedAt":"2026-10-30T12:00:00Z"}');
select pg_temp.denied($q$update public.project_delivery_notes set data=jsonb_set(data,'{rows,0,signature}','null')$q$);
select pg_temp.denied($q$update public.project_delivery_notes set data=jsonb_set(data,'{rows,0,soap}','"5"')$q$);
select pg_temp.denied($q$update public.project_delivery_notes set data=jsonb_set(data,'{supplierSignature}','{"name":"Fake","image":"data:image/png;base64,YWJj","signedAt":"2026-10-30T12:00:00Z"}')$q$);
update public.project_delivery_notes set data=jsonb_set(data,'{customerSignature}','{"name":"Bauleiter Monat","image":"data:image/png;base64,YWJj","signedAt":"2026-10-30T12:00:00Z"}');
select pg_temp.denied($q$update public.project_delivery_notes set data=jsonb_set(data,'{customerSignature}','null')$q$);
select pg_temp.denied($q$update public.project_delivery_notes set data=jsonb_set(data,'{rows,1,soap}','"2"')$q$);
do $$ begin delete from public.project_delivery_notes; assert not found; end $$;
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin assert (select count(*) from public.project_delivery_notes)=0; end $$;
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin assert (select data->'rows'->0->'signature'->>'name' from public.project_delivery_notes)='Bauleiter Test'; end $$;
update public.project_delivery_notes set data=jsonb_set(data,'{customerSignature}','null');
update public.project_delivery_notes set data=jsonb_set(data,'{rows,0,signature}','null');
update public.project_delivery_notes set scan_path='81000000-0000-4000-8000-000000000001/delivery-notes/85000000-0000-4000-8000-000000000001/signed.pdf';
insert into public.documents(id,user_id,type,number,project_id,tax_mode,reverse_charge,vat_rate) values ('86000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','invoice','RE-WORKER','83000000-0000-4000-8000-000000000001','domestic',false,19);
select public.attach_project_delivery_note('85000000-0000-4000-8000-000000000001','86000000-0000-4000-8000-000000000001',(select version from public.project_delivery_notes));
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select pg_temp.denied($q$update public.project_delivery_notes set data=data$q$);
rollback;
select 'PASS: worker delivery signatures, access restrictions, invoice freeze';
