begin;

-- Trigger function: pin search_path so object resolution cannot be influenced by caller context.
do $$
begin
  if to_regprocedure('public.guard_company_accounting_chart_change()') is not null then
    execute 'alter function public.guard_company_accounting_chart_change() set search_path = public';
  end if;
end
$$;

-- Explicitly scope SECURITY DEFINER RPC execution. Some older local replay snapshots
-- do not contain every production function, so hardening is conditional and repeatable.
do $$
declare
  fn text;
  funcs text[] := array[
    'public.create_storno(uuid)',
    'public.current_subscription_access()',
    'public.finalize_document(uuid)',
    'public.has_role(uuid,public.app_role)',
    'public.is_account_active()',
    'public.link_employee_account()',
    'public.list_trash()',
    'public.next_customer_number()',
    'public.next_document_number(text)',
    'public.owns_document(uuid)',
    'public.purge_entity(text,uuid)',
    'public.restore_entity(text,uuid)',
    'public.trash_entity(text,uuid)'
  ];
begin
  foreach fn in array funcs loop
    if to_regprocedure(fn) is not null then
      execute format('revoke all on function %s from public, anon', fn);
      execute format('grant execute on function %s to authenticated, service_role', fn);
    end if;
  end loop;
end
$$;

commit;
