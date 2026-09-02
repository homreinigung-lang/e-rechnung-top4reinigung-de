-- 1) Obsolete Storno-Variante ohne Pflicht-Stornogrund entfernen (GoBD: Grund immer erforderlich)
DROP FUNCTION IF EXISTS public.create_storno(uuid);

-- 2) EXECUTE-Rechte auf sensible Funktionen einschraenken (Defense-in-depth)
DO $$
DECLARE
  fn text;
  fns text[] := ARRAY[
    'public.create_storno(uuid, text)',
    'public.purge_entity(text, uuid)',
    'public.restore_entity(text, uuid)',
    'public.trash_entity(text, uuid)',
    'public.finalize_document(uuid)',
    'public.next_document_number(text)',
    'public.next_customer_number()',
    'public.list_trash()',
    'public.link_employee_account()',
    'public.my_employee_id()',
    'public.my_employee_owner()',
    'public.owns_document(uuid)',
    'public.owns_employee_auth_user(uuid)',
    'public.is_employee_account(uuid)',
    'public.has_role(uuid, public.app_role)',
    'public.plan_allows_reverse_charge(uuid)',
    'public.gen_invite_code()',
    'public.get_platform_payment()',
    'public.employee_self_update_allowed(uuid, uuid, uuid, text, text, numeric, boolean, text, text, date, numeric)',
    'public.time_entry_photo_update_allowed(uuid, uuid, uuid, text, uuid, date, time, time, integer, numeric, numeric, text, text, boolean, uuid, text, text, text, timestamptz, uuid, text, timestamptz)'
  ];
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    IF to_regprocedure(fn) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', fn);
    END IF;
  END LOOP;
END $$;
