-- Forward-only changes. No existing invoice, file, user or number is rewritten.
BEGIN;
SET LOCAL lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.next_document_number(_kind text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  y integer := EXTRACT(YEAR FROM CURRENT_DATE)::integer;
  previous integer;
  highest integer;
  v integer;
  prefix text;
  kind_type public.doc_type;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Nicht angemeldet'; END IF;
  IF _kind NOT IN ('invoice','storno','order','quote') OR _kind IS NULL THEN
    RAISE EXCEPTION 'Unbekannte Belegart';
  END IF;
  prefix := CASE _kind WHEN 'invoice' THEN 'RE-' WHEN 'storno' THEN 'ST-' WHEN 'order' THEN 'AB-' ELSE 'AN-' END;
  kind_type := CASE WHEN _kind IN ('invoice','storno') THEN 'invoice'::public.doc_type WHEN _kind='order' THEN 'order'::public.doc_type ELSE 'quote'::public.doc_type END;
  INSERT INTO public.number_sequences(user_id,kind,year,last_value)
    VALUES(uid,_kind,y,0) ON CONFLICT (user_id,kind,year) DO NOTHING;
  -- Serialize reservations before reading existing numbers, including trash.
  SELECT last_value INTO previous FROM public.number_sequences
    WHERE user_id=uid AND kind=_kind AND year=y FOR UPDATE;
  SELECT coalesce(max(substring(number from '[0-9]+$')::integer),0) INTO highest
    FROM public.documents
    WHERE user_id=uid AND type=kind_type AND number ~ ('^'||prefix||y::text||'-[0-9]+$');
  v := greatest(previous,highest)+1;
  UPDATE public.number_sequences SET last_value=v, updated_at=now()
    WHERE user_id=uid AND kind=_kind AND year=y;
  RETURN prefix||y::text||'-'||lpad(v::text,greatest(4,length(v::text)),'0');
END $$;
REVOKE ALL ON FUNCTION public.next_document_number(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_document_number(text) TO authenticated;

-- Preserve installed overloads and business logic; add a lock before checking
-- whether a document was already finalized/cancelled. Abort on unexpected SQL.
DO $$
DECLARE f record; definition text; replacement text;
BEGIN
  FOR f IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('finalize_document','create_storno')
  LOOP
    definition := pg_get_functiondef(f.oid);
    replacement := replace(definition,
      'WHERE id = _id AND user_id = uid;',
      'WHERE id = _id AND user_id = uid FOR UPDATE;');
    IF replacement=definition AND strpos(definition,'WHERE id = _id AND user_id = uid FOR UPDATE;')=0 THEN
      RAISE EXCEPTION 'Unexpected invoice function definition; review required';
    END IF;
    EXECUTE replacement;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.consume_mail_budget(
  _email_hash text, _ip_hash text,
  _email_limit integer DEFAULT 3, _email_minutes integer DEFAULT 15,
  _ip_limit integer DEFAULT 20, _ip_minutes integer DEFAULT 60
) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF _email_hash !~ '^[a-f0-9]{64}$' OR _email_hash IS NULL
     OR (_ip_hash <> '' AND _ip_hash !~ '^[a-f0-9]{64}$') OR _ip_hash IS NULL
     OR _email_limit NOT BETWEEN 1 AND 100 OR _ip_limit NOT BETWEEN 1 AND 1000
     OR _email_minutes NOT BETWEEN 1 AND 1440 OR _ip_minutes NOT BETWEEN 1 AND 1440
     OR _email_limit IS NULL OR _ip_limit IS NULL OR _email_minutes IS NULL OR _ip_minutes IS NULL THEN
    RAISE EXCEPTION 'Invalid throttle arguments';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('mail-email:'||_email_hash,0));
  IF _ip_hash <> '' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('mail-ip:'||_ip_hash,0));
  END IF;
  IF (SELECT count(*) FROM public.auth_mail_throttle WHERE scope='email' AND key_hash=_email_hash
      AND created_at > now()-make_interval(mins=>_email_minutes)) >= _email_limit THEN RETURN false; END IF;
  IF _ip_hash <> '' AND (SELECT count(*) FROM public.auth_mail_throttle WHERE scope='ip' AND key_hash=_ip_hash
      AND created_at > now()-make_interval(mins=>_ip_minutes)) >= _ip_limit THEN RETURN false; END IF;
  INSERT INTO public.auth_mail_throttle(scope,key_hash) VALUES('email',_email_hash);
  IF _ip_hash <> '' THEN INSERT INTO public.auth_mail_throttle(scope,key_hash) VALUES('ip',_ip_hash); END IF;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.consume_mail_budget(text,text,integer,integer,integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_mail_budget(text,text,integer,integer,integer,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.check_accountant_access(_token text, _candidate_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE a public.accountant_access%ROWTYPE; attempts integer;
BEGIN
  SELECT * INTO a FROM public.accountant_access WHERE token=_token FOR UPDATE;
  IF NOT FOUND OR NOT a.active THEN RETURN jsonb_build_object('status','invalid'); END IF;
  IF a.expires_at < now() THEN RETURN jsonb_build_object('status','expired'); END IF;
  IF a.locked_until > now() THEN RETURN jsonb_build_object('status','locked'); END IF;
  IF _candidate_hash IS NULL OR _candidate_hash !~ '^[a-f0-9]{64}$'
    OR a.access_code_hash IS NULL OR a.access_code_hash='' OR a.access_code_hash <> _candidate_hash THEN
    attempts := coalesce(a.failed_attempts,0)+1;
    UPDATE public.accountant_access SET failed_attempts=attempts,
      locked_until=CASE WHEN attempts >= 5 THEN now()+interval '15 minutes' ELSE locked_until END
      WHERE id=a.id;
    -- Return instead of raising: the failed-attempt increment must commit.
    RETURN jsonb_build_object('status','invalid');
  END IF;
  UPDATE public.accountant_access SET failed_attempts=0,locked_until=NULL,
    last_used_at=now(),activated_at=coalesce(activated_at,now()) WHERE id=a.id;
  RETURN jsonb_build_object('status','ok','id',a.id,'user_id',a.user_id);
END $$;
REVOKE ALL ON FUNCTION public.check_accountant_access(text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_accountant_access(text,text) TO service_role;
COMMIT;
