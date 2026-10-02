-- Backfill the blocked-account guard onto every public table that currently has RLS.
-- The original guard migration ran before several newer modules were created, so those
-- tables never received its restrictive policy.
begin;

do $$
declare
  t text;
begin
  for t in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'r'
       and c.relrowsecurity
  loop
    execute format(
      'drop policy if exists %I on public.%I',
      'Gesperrte Konten ausgeschlossen',
      t
    );

    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated '
      'using ((select public.is_account_active())) '
      'with check ((select public.is_account_active()))',
      'Gesperrte Konten ausgeschlossen',
      t
    );
  end loop;
end
$$;

commit;
