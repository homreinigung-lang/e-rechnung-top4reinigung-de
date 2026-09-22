-- Run ONLY with replay-local.mjs against the dedicated synthetic database.
BEGIN;
INSERT INTO auth.users (id,email) VALUES
 ('10000000-0000-4000-8000-000000000001','owner-a@example.invalid'),
 ('10000000-0000-4000-8000-000000000002','owner-b@example.invalid'),
 ('10000000-0000-4000-8000-000000000003','employee-a@example.invalid');
INSERT INTO public.documents(id,user_id,number,reverse_charge,tax_mode,vat_rate) VALUES
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','TEST-A',false,'domestic',19),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','TEST-B',false,'domestic',19);
INSERT INTO public.document_items(document_id,user_id,description) VALUES
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Synthetic A'),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','Synthetic B');
INSERT INTO public.employees(id,user_id,auth_user_id,name,hourly_rate) VALUES
 ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','Synthetic employee A',20),
 ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002',NULL,'Synthetic employee B',30);
INSERT INTO public.time_entries(user_id,employee_id,start_time,end_time,hours,hourly_rate) VALUES
 ('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','08:00','09:00',1,20),
 ('10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002','08:00','09:00',1,30);
INSERT INTO public.accountant_access(user_id,token,access_code) VALUES
 ('10000000-0000-4000-8000-000000000001','synthetic-a',''),('10000000-0000-4000-8000-000000000002','synthetic-b','');
INSERT INTO public.fahrtenbuch_vehicles(id,user_id,license_plate) VALUES
 ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','TEST-A'),
 ('40000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','TEST-B');
INSERT INTO public.fahrtenbuch_entries(user_id,vehicle_id,employee_id,from_location,to_location,start_km,end_km) VALUES
 ('10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','A','B',0,10),
 ('10000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002',NULL,'C','D',0,10);
-- This is a local stand-in table, never the live Storage service.
INSERT INTO storage.objects(bucket_id,name) VALUES
 ('firmen-dateien','10000000-0000-4000-8000-000000000001/test.pdf'),
 ('firmen-dateien','10000000-0000-4000-8000-000000000002/test.pdf');
CREATE FUNCTION pg_temp.denied(statement text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE rejected boolean := false;
BEGIN
  BEGIN EXECUTE statement;
  EXCEPTION WHEN insufficient_privilege OR raise_exception OR foreign_key_violation THEN rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Expected denial: %', statement; END IF;
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM public.documents)=1, 'cross-tenant document read';
  ASSERT (SELECT count(*) FROM public.document_items)=1, 'cross-tenant items read';
  ASSERT (SELECT count(*) FROM public.employees)=1, 'cross-tenant employees read';
  ASSERT (SELECT count(*) FROM public.time_entries)=1, 'cross-tenant payroll read';
  ASSERT (SELECT count(*) FROM public.accountant_access)=1, 'cross-tenant accountant read';
  ASSERT (SELECT count(*) FROM public.fahrtenbuch_vehicles)=1, 'cross-tenant vehicles read';
  ASSERT (SELECT count(*) FROM public.fahrtenbuch_entries)=1, 'cross-tenant trips read';
  ASSERT (SELECT count(*) FROM storage.objects)=1, 'cross-tenant files read';
  UPDATE public.documents SET notes='attacker' WHERE user_id='10000000-0000-4000-8000-000000000002';
  ASSERT NOT FOUND, 'cross-tenant document update';
  DELETE FROM public.document_items WHERE user_id='10000000-0000-4000-8000-000000000002';
  ASSERT NOT FOUND, 'cross-tenant item delete';
END $$;
SELECT pg_temp.denied($q$INSERT INTO public.document_items(document_id,user_id) VALUES ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001')$q$);
SELECT pg_temp.denied($q$UPDATE public.documents SET user_id='10000000-0000-4000-8000-000000000002' WHERE number='TEST-A'$q$);
SELECT pg_temp.denied($q$SELECT public.finalize_document('20000000-0000-4000-8000-000000000002')$q$);
SELECT pg_temp.denied($q$SELECT public.create_storno('20000000-0000-4000-8000-000000000002'::uuid, 'Synthetic reason')$q$);
SELECT pg_temp.denied($q$SELECT public.purge_entity('document','20000000-0000-4000-8000-000000000001')$q$);
SELECT pg_temp.denied($q$INSERT INTO storage.objects(bucket_id,name) VALUES ('firmen-dateien','10000000-0000-4000-8000-000000000002/attack.pdf')$q$);
SELECT pg_temp.denied($q$UPDATE storage.objects SET name='10000000-0000-4000-8000-000000000002/moved.pdf'$q$);
SELECT pg_temp.denied($q$INSERT INTO public.fahrtenbuch_entries(user_id,vehicle_id,from_location,to_location,start_km,end_km) VALUES ('10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002','X','Y',0,1)$q$);
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM public.documents)=0, 'employee invoice access';
  ASSERT (SELECT count(*) FROM public.employees)=1, 'employee colleague access';
  ASSERT (SELECT count(*) FROM public.time_entries)=1, 'employee payroll scope';
  ASSERT (SELECT count(*) FROM public.accountant_access)=0, 'employee accountant access';
  ASSERT (SELECT count(*) FROM public.fahrtenbuch_entries)=1, 'employee trip scope';
  ASSERT (SELECT count(*) FROM public.fahrtenbuch_vehicles)=1, 'employee vehicle scope';
END $$;
SELECT pg_temp.denied($q$UPDATE public.employees SET hourly_rate=999 WHERE auth_user_id='10000000-0000-4000-8000-000000000003'$q$);
SELECT pg_temp.denied($q$UPDATE public.time_entries SET hours=999$q$);
SELECT pg_temp.denied($q$INSERT INTO public.fahrtenbuch_entries(user_id,vehicle_id,employee_id,from_location,to_location,start_km,end_km) VALUES ('10000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001','X','Y',0,1)$q$);
INSERT INTO public.fahrtenbuch_entries(user_id,vehicle_id,employee_id,from_location,to_location,start_km,end_km) VALUES
 ('10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','Allowed','Trip',10,20);
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims','{}',true);
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM public.documents)=0, 'anonymous invoices';
  ASSERT (SELECT count(*) FROM public.accountant_access)=0, 'anonymous accountant tokens';
  ASSERT (SELECT count(*) FROM storage.objects)=0, 'anonymous files';
END $$;
SELECT pg_temp.denied($q$SELECT public.finalize_document('20000000-0000-4000-8000-000000000001')$q$);
SELECT pg_temp.denied($q$SELECT public.next_document_number('invoice')$q$);
ROLLBACK;
SELECT 'PASS: synthetic tenant, employee, accountant, storage and invoice permission cases; rolled back';
