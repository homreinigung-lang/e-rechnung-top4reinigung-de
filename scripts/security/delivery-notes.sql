-- Disposable local database only. Synthetic rows; all changes are rolled back.
begin;
insert into auth.users(id,email) values
 ('d1300000-0000-4000-8000-000000000001','delivery-owner@example.invalid'),
 ('d1300000-0000-4000-8000-000000000002','delivery-other@example.invalid');
create function pg_temp.delivery_denied(statement text) returns void language plpgsql as $$
declare denied boolean := false;
begin
  begin execute statement; exception when insufficient_privilege or raise_exception or check_violation then denied := true; end;
  assert denied, 'Expected delivery-note rejection';
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d1300000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into public.documents(id,user_id,type,number,tax_mode,reverse_charge,vat_rate)
values ('d1310000-0000-4000-8000-000000000001','d1300000-0000-4000-8000-000000000001','invoice','RE-DELIVERY-TEST','domestic',false,19);
insert into public.document_delivery_notes(document_id,user_id,data)
select 'd1310000-0000-4000-8000-000000000001','d1300000-0000-4000-8000-000000000001',
  jsonb_build_object('number','LS-TEST','month','2026-10','orderNumber','20012640','deliveryAddress','Testobjekt',
    'supplierSignature',null,'customerSignature',null,'rows',jsonb_agg(jsonb_build_object(
      'date',case when i=1 then '2026-10-01' else '' end,'toiletPaper',case when i=1 then '2' else '' end,
      'handTowels',case when i=1 then '3' else '' end,'soap',case when i=1 then '1,5' else '' end,'signature',null) order by i))
from generate_series(1,5) i;
select set_config('request.jwt.claims','{"sub":"d1300000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
 assert (select count(*) from public.document_delivery_notes)=0,'tenant cannot read signatures';
 update public.document_delivery_notes set scan_path=null;
 assert not found,'tenant cannot edit signatures';
end $$;
select set_config('request.jwt.claims','{"sub":"d1300000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select pg_temp.delivery_denied($q$update public.document_delivery_notes set data=jsonb_set(data,'{rows,0,soap}','"-1"')$q$);
select pg_temp.delivery_denied($q$update public.document_delivery_notes set data=jsonb_set(data,'{rows,0,date}','"2026-11-01"')$q$);
select pg_temp.delivery_denied($q$update public.document_delivery_notes set scan_path='foreign/scan.pdf'$q$);
update public.document_delivery_notes set data=jsonb_set(data,'{rows,0,signature}',
 '{"name":"Max Muster","image":"data:image/png;base64,YWJj","signedAt":"2026-10-30T12:00:00.000Z"}');
select pg_temp.delivery_denied($q$update public.document_delivery_notes set data=jsonb_set(data,'{rows,0,soap}','"4"')$q$);
select pg_temp.delivery_denied($q$update public.document_delivery_notes set data=jsonb_set(data,'{orderNumber}','"changed"')$q$);
update public.document_delivery_notes set data=jsonb_set(data,'{rows,0,signature}','null');
update public.document_delivery_notes set data=jsonb_set(data,'{rows,0,soap}','"2"');
do $$ begin assert (select version from public.document_delivery_notes)>=4,'version advances on each saved change'; end $$;
select pg_temp.delivery_denied($q$select public.finalize_invoice_package('d1310000-0000-4000-8000-000000000001',3)$q$);
select pg_temp.delivery_denied($q$select public.finalize_invoice_package('d1310000-0000-4000-8000-000000000001',4)$q$);
update public.document_delivery_notes set data=jsonb_set(data,'{customerSignature}',
 '{"name":"Max Muster","image":"data:image/png;base64,YWJj","signedAt":"2026-10-30T12:00:00.000Z"}');
select pg_temp.delivery_denied($q$update public.document_delivery_notes set data=jsonb_set(data,'{rows,0,soap}','"9"')$q$);
update public.document_delivery_notes set data=jsonb_set(data,'{customerSignature}','null');
update public.document_delivery_notes set scan_path='d1300000-0000-4000-8000-000000000001/delivery-notes/d1310000-0000-4000-8000-000000000001/scan.pdf';
select pg_temp.delivery_denied($q$update public.document_delivery_notes set data=jsonb_set(data,'{rows,0,soap}','"9"')$q$);
reset role;
update public.documents set locked_at=now() where id='d1310000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.delivery_denied('update public.document_delivery_notes set scan_path=null');
select pg_temp.delivery_denied('delete from public.document_delivery_notes');
rollback;
select 'delivery-note isolation, signed quantities, version guard, scans and invoice locking passed';
