ALTER TABLE public.document_audit_log DISABLE TRIGGER USER;

DELETE FROM public.document_audit_log;

INSERT INTO public.document_audit_log (user_id, document_id, document_number, action, details, created_at) VALUES
('d4f1b0a3-5f28-481e-8fa4-0a1fad8e7c88','5330ba7a-5a6b-4c85-b22d-5698d04526fc','RE-2026-0001','created','{"typ":"Rechnung","belegdatum":"2026-07-31"}'::jsonb,'2026-08-03 14:30:00+00'),
('d4f1b0a3-5f28-481e-8fa4-0a1fad8e7c88','5330ba7a-5a6b-4c85-b22d-5698d04526fc','RE-2026-0001','finalized','{"nummer":"RE-2026-0001","brutto":2741.50}'::jsonb,'2026-08-03 14:33:05.236979+00'),
('d4f1b0a3-5f28-481e-8fa4-0a1fad8e7c88','5330ba7a-5a6b-4c85-b22d-5698d04526fc','RE-2026-0001','sent','{"kanal":"E-Mail"}'::jsonb,'2026-08-03 14:33:06+00'),
('d4f1b0a3-5f28-481e-8fa4-0a1fad8e7c88','5330ba7a-5a6b-4c85-b22d-5698d04526fc','RE-2026-0001','payment_received','{"paid_at":"2026-08-14"}'::jsonb,'2026-08-14 08:00:00+00'),
('d4f1b0a3-5f28-481e-8fa4-0a1fad8e7c88','77ed1ca7-a57c-4bae-b319-b12370a8085d','AN-2026-0001','created','{"typ":"Angebot","belegdatum":"2026-08-14"}'::jsonb,'2026-08-19 11:08:27.120411+00'),
('d4f1b0a3-5f28-481e-8fa4-0a1fad8e7c88','77ed1ca7-a57c-4bae-b319-b12370a8085d','AN-2026-0001','quote_accepted','{"status":"accepted"}'::jsonb,'2026-08-19 11:10:00+00');

ALTER TABLE public.document_audit_log ENABLE TRIGGER USER;