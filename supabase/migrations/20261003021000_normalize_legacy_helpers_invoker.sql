-- SECURITY: historical migrations recreated several RLS helper functions as
-- SECURITY DEFINER after earlier hardening. Production already runs these as
-- invoker functions; make full migration replay converge on the same state.
begin;

do $normalize_helpers$
declare
  fn record;
begin
  for fn in
    select p.oid,
           n.nspname,
           p.proname,
           pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       and p.proname = any(array[
         'employee_self_update_allowed',
         'is_employee_account',
         'my_employee_id',
         'my_employee_owner',
         'owns_employee_auth_user',
         'plan_allows_reverse_charge',
         'time_entry_photo_update_allowed'
       ])
  loop
    execute format(
      'alter function %I.%I(%s) security invoker',
      fn.nspname,
      fn.proname,
      fn.args
    );
  end loop;
end
$normalize_helpers$;

commit;
