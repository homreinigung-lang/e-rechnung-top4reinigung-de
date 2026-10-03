-- Keep the public Steuerberater portal aligned with the owning company's access.
-- Master/Admin companies remain permanently entitled; ordinary companies must
-- still have valid access to the Steuerberater feature.
begin;

create or replace function public.check_accountant_access(_token text, _candidate_hash text)
returns jsonb
language plpgsql
set search_path = public
as $function$
declare
  a public.accountant_access%rowtype;
  attempts integer;
  owner_is_admin boolean;
  company_entitled boolean;
begin
  select * into a
  from public.accountant_access
  where token = _token
  for update;

  if not found or not a.active then
    return jsonb_build_object('status', 'invalid');
  end if;

  if a.expires_at < now() then
    return jsonb_build_object('status', 'expired');
  end if;

  if a.locked_until > now() then
    return jsonb_build_object('status', 'locked');
  end if;

  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = a.user_id
      and ur.role = 'admin'
  ) into owner_is_admin;

  if not owner_is_admin then
    -- A blocked/rejected company must not keep a previously issued public portal token.
    if exists (
      select 1
      from public.account_approvals ap
      where ap.auth_user_id = a.user_id
        and ap.status in ('blocked', 'rejected')
    ) then
      return jsonb_build_object('status', 'invalid');
    end if;

    -- Match the authenticated package gate: an unexpired trial can use all
    -- features; an active paid account needs Enterprise for Steuerberater.
    select exists (
      select 1
      from public.subscriptions s
      where s.user_id = a.user_id
        and (
          (
            s.status = 'trial'
            and (s.renews_on is null or s.renews_on >= current_date)
          )
          or
          (
            s.status = 'active'
            and lower(s.plan) = 'enterprise'
            and (s.renews_on is null or s.renews_on >= current_date)
          )
        )
    ) into company_entitled;

    if not company_entitled then
      return jsonb_build_object('status', 'invalid');
    end if;
  end if;

  if _candidate_hash is null
    or _candidate_hash !~ '^[a-f0-9]{64}$'
    or a.access_code_hash is null
    or a.access_code_hash = ''
    or a.access_code_hash <> _candidate_hash then
    attempts := coalesce(a.failed_attempts, 0) + 1;
    update public.accountant_access
    set failed_attempts = attempts,
        locked_until = case
          when attempts >= 5 then now() + interval '15 minutes'
          else locked_until
        end
    where id = a.id;

    -- Return instead of raising so the failed-attempt increment commits.
    return jsonb_build_object('status', 'invalid');
  end if;

  update public.accountant_access
  set failed_attempts = 0,
      locked_until = null,
      last_used_at = now(),
      activated_at = coalesce(activated_at, now())
  where id = a.id;

  return jsonb_build_object('status', 'ok', 'id', a.id, 'user_id', a.user_id);
end
$function$;

-- This RPC is called only from the server with the service role.
revoke all on function public.check_accountant_access(text, text) from public, anon, authenticated;
grant execute on function public.check_accountant_access(text, text) to service_role;

commit;
