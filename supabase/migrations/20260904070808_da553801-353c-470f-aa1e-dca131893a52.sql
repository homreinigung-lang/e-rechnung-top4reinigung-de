ALTER TABLE public.accountant_access ADD COLUMN IF NOT EXISTS access_code_hash text NOT NULL DEFAULT '';

UPDATE public.accountant_access
   SET access_code_hash = encode(sha256(convert_to(upper(btrim(access_code)) || ':' || token, 'UTF8')), 'hex')
 WHERE access_code_hash = '' AND coalesce(access_code, '') <> '';

UPDATE public.accountant_access SET access_code = '' WHERE coalesce(access_code, '') <> '';