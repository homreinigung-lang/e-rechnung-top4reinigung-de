-- Synthetic regression tests through the public RPC, not the privileged helper.
BEGIN;
INSERT INTO auth.users (id,email) VALUES
 ('71000000-0000-4000-8000-000000000001','storno-owner@example.invalid'),
 ('71000000-0000-4000-8000-000000000002','storno-other@example.invalid');
INSERT INTO public.documents
 (id,user_id,type,number,status,issue_date,reverse_charge,tax_mode,vat_rate,net_total,vat_amount,total,is_storno,locked_at)
SELECT
 ('72000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
 '71000000-0000-4000-8000-000000000001'::uuid,
 'invoice', 'STORNO-TEST-' || n,
 (CASE WHEN n=1 THEN 'draft' WHEN n=5 THEN 'cancelled' ELSE 'sent' END)::public.doc_status,
 CURRENT_DATE,false,'domestic',19,100,19,119,n=3,NULL
FROM generate_series(1,7) n;
INSERT INTO public.document_items(document_id,user_id,position,description,quantity,unit,unit_price)
VALUES ('72000000-0000-4000-8000-000000000007','71000000-0000-4000-8000-000000000001',1,'Synthetic cleaning',1,'Std',100);
UPDATE public.documents SET cancels_document_id='72000000-0000-4000-8000-000000000007'
 WHERE id='72000000-0000-4000-8000-000000000004';
UPDATE public.documents SET deleted_at=now()
 WHERE id='72000000-0000-4000-8000-000000000006';
UPDATE public.documents SET locked_at=now()
 WHERE number LIKE 'STORNO-TEST-%' AND id<>'72000000-0000-4000-8000-000000000002';
CREATE FUNCTION pg_temp.storno_denied(source_id uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE rejected boolean := false; before_count bigint;
BEGIN
 SELECT count(*) INTO before_count FROM public.documents;
 BEGIN
   PERFORM public.create_storno(source_id,'Synthetic regression');
 EXCEPTION WHEN raise_exception THEN rejected := true;
 END;
 ASSERT rejected, 'invalid source was accepted through public.create_storno';
 ASSERT (SELECT count(*) FROM public.documents)=before_count, 'rejected storno created documents';
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
-- Draft with a lock, issued-looking row without a lock, both storno markers,
-- already cancelled and deleted invoices must all be rejected.
SELECT pg_temp.storno_denied(('72000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid)
FROM generate_series(1,6) n;
DO $$
DECLARE reversal uuid;
BEGIN
 reversal := public.create_storno('72000000-0000-4000-8000-000000000007','Synthetic valid reversal');
 ASSERT (SELECT is_storno AND cancels_document_id='72000000-0000-4000-8000-000000000007'
   AND locked_at IS NOT NULL AND net_total=-100 AND vat_amount=-19 AND total=-119
   FROM public.documents WHERE id=reversal), 'valid reversal was not preserved';
 ASSERT (SELECT unit_price=-100 FROM public.document_items WHERE document_id=reversal), 'reversal item mismatch';
 ASSERT (SELECT status='cancelled' AND cancelled_by_document_id=reversal
   FROM public.documents WHERE id='72000000-0000-4000-8000-000000000007'), 'source cancellation mismatch';
 ASSERT (SELECT count(*) FROM public.document_audit_log WHERE document_id IN
   (reversal,'72000000-0000-4000-8000-000000000007') AND action IN ('storno_created','cancelled'))=2, 'audit mismatch';
 PERFORM pg_temp.storno_denied(reversal);
 PERFORM pg_temp.storno_denied('72000000-0000-4000-8000-000000000007');
END $$;
SELECT set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
SELECT pg_temp.storno_denied('72000000-0000-4000-8000-000000000007');
ROLLBACK;
SELECT 'PASS: public storno RPC rejects invalid sources and preserves valid reversal, items and audit; rolled back';
