-- Synthetic fixtures only; the entire test is rolled back.
BEGIN;
INSERT INTO auth.users(id,email) VALUES
 ('a1300000-0000-4000-8000-000000000001','tax-basis@example.invalid'),
 ('a1300000-0000-4000-8000-000000000002','tax-pro@example.invalid');
INSERT INTO public.subscriptions(user_id,plan,status) VALUES
 ('a1300000-0000-4000-8000-000000000001','basis','active'),
 ('a1300000-0000-4000-8000-000000000002','pro','active')
ON CONFLICT(user_id) DO UPDATE SET plan=EXCLUDED.plan,status=EXCLUDED.status;
DO $$ BEGIN
 ASSERT NOT has_function_privilege('anon','public.enforce_plan_tax_mode()','EXECUTE');
 ASSERT NOT has_function_privilege('authenticated','public.enforce_plan_tax_mode()','EXECUTE');
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"a1300000-0000-4000-8000-000000000001","role":"authenticated"}',true);
INSERT INTO public.documents(id,user_id,type,number,status,tax_mode,reverse_charge,vat_rate,net_total,vat_amount,total) VALUES
 ('a1310000-0000-4000-8000-000000000001','a1300000-0000-4000-8000-000000000001','invoice','TAX-DOMESTIC','draft','domestic',false,19,1000,190,1190),
 ('a1310000-0000-4000-8000-000000000002','a1300000-0000-4000-8000-000000000001','quote','TAX-13B','draft','domestic_reverse_charge',true,0,1000,0,1000),
 ('a1310000-0000-4000-8000-000000000003','a1300000-0000-4000-8000-000000000001','invoice','TAX-KU','draft','kleinunternehmer',false,0,1000,0,1000);
CREATE FUNCTION pg_temp.tax_denied(statement text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE rejected boolean := false;
BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN insufficient_privilege OR raise_exception THEN rejected := true; END;
 ASSERT rejected, 'expected subscription/GoBD denial';
END $$;
SELECT pg_temp.tax_denied($s$INSERT INTO public.documents(user_id,number,tax_mode,reverse_charge) VALUES ('a1300000-0000-4000-8000-000000000001','TAX-EU-DENIED','eu_reverse_charge',true)$s$);
SELECT pg_temp.tax_denied($s$INSERT INTO public.documents(user_id,number,tax_mode,reverse_charge) VALUES ('a1300000-0000-4000-8000-000000000001','TAX-LEGACY-DENIED','domestic',true)$s$);
SELECT pg_temp.tax_denied($s$UPDATE public.documents SET tax_mode='eu_reverse_charge' WHERE number='TAX-13B'$s$);
UPDATE public.documents SET notes='Synthetic round trip' WHERE number='TAX-13B';
-- Tax data copied by quote -> invoice must remain exempt from the EU plan gate.
INSERT INTO public.documents(id,user_id,type,number,status,tax_mode,reverse_charge,vat_rate,net_total,vat_amount,total)
SELECT 'a1310000-0000-4000-8000-000000000004',user_id,'invoice','TAX-13B-INVOICE','draft',tax_mode,reverse_charge,vat_rate,net_total,vat_amount,total FROM public.documents WHERE number='TAX-13B';
INSERT INTO public.document_items(document_id,user_id,position,description,quantity,unit,unit_price)
VALUES ('a1310000-0000-4000-8000-000000000004','a1300000-0000-4000-8000-000000000001',1,'Synthetic cleaning',4,'Std',250);
DO $$ BEGIN
 ASSERT (SELECT tax_mode='domestic_reverse_charge' AND reverse_charge AND vat_rate=0 AND net_total=1000 AND vat_amount=0 AND total=1000 FROM public.documents WHERE number='TAX-13B-INVOICE');
END $$;
RESET ROLE;
UPDATE public.documents SET status='sent',locked_at=now() WHERE number='TAX-13B-INVOICE';
SET LOCAL ROLE authenticated;
SELECT pg_temp.tax_denied($s$UPDATE public.documents SET tax_mode='domestic',vat_rate=19,vat_amount=190,total=1190 WHERE number='TAX-13B-INVOICE'$s$);
DO $$ DECLARE reversal uuid; BEGIN
 reversal := public.create_storno('a1310000-0000-4000-8000-000000000004','Synthetic tax regression');
 ASSERT (SELECT tax_mode='domestic_reverse_charge' AND reverse_charge AND vat_rate=0 AND net_total=-1000 AND vat_amount=0 AND total=-1000 AND locked_at IS NOT NULL FROM public.documents WHERE id=reversal), 'storno changed domestic tax mode or amounts';
 ASSERT (SELECT unit_price=-250 FROM public.document_items WHERE document_id=reversal), 'storno item mismatch';
END $$;
SELECT set_config('request.jwt.claims','{"sub":"a1300000-0000-4000-8000-000000000002","role":"authenticated"}',true);
INSERT INTO public.documents(user_id,number,tax_mode,reverse_charge,vat_rate,net_total,vat_amount,total)
VALUES ('a1300000-0000-4000-8000-000000000002','TAX-EU-PRO','eu_reverse_charge',true,0,1000,0,1000);
INSERT INTO public.documents(user_id,number,tax_mode,reverse_charge,vat_rate,net_total,vat_amount,total)
VALUES ('a1300000-0000-4000-8000-000000000002','TAX-LEGACY-PRO','domestic',true,0,1000,0,1000);
RESET ROLE;
UPDATE public.subscriptions SET plan='basis' WHERE user_id='a1300000-0000-4000-8000-000000000002';
SET LOCAL ROLE authenticated;
UPDATE public.documents SET tax_mode='eu_reverse_charge',notes='Retained after downgrade' WHERE number='TAX-EU-PRO';
UPDATE public.documents SET reverse_charge=true,notes='Legacy retained after downgrade' WHERE number='TAX-LEGACY-PRO';
DO $$ BEGIN
 ASSERT (SELECT tax_mode='eu_reverse_charge' AND reverse_charge AND total=1000 FROM public.documents WHERE number='TAX-EU-PRO');
 ASSERT (SELECT reverse_charge AND total=1000 FROM public.documents WHERE number='TAX-LEGACY-PRO');
END $$;
ROLLBACK;
SELECT 'PASS: domestic cleaning tax persistence, Basis/Pro gate, legacy gate, EU downgrade, locked invoice and storno; rolled back';
