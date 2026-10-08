-- Protect the privileged retention job from user-controlled references.
-- Existing references are untouched; new writes must point to this exact entry.
create or replace function public.validate_time_entry_photo_paths()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  employee_auth uuid;
  path text;
  parts text[];
begin
  select e.auth_user_id into employee_auth from public.employees e
    where e.id = new.employee_id and e.user_id = new.user_id;
  foreach path in array coalesce(new.photo_paths, array[]::text[]) loop
    parts := string_to_array(path, '/');
    if path is null or cardinality(parts) <> 4
      or parts[1] not in (new.user_id::text, coalesce(employee_auth::text, new.user_id::text))
      or parts[2] <> 'arbeitsnachweis' or parts[3] <> new.id::text
      or parts[4] in ('', '.', '..') or parts[4] ~ '[%\\[:cntrl:]]' then
      raise exception 'Invalid work photo path' using errcode = '23514';
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function public.validate_time_entry_photo_paths() from public, anon, authenticated;
drop trigger if exists validate_time_entry_photo_paths on public.time_entries;
create trigger validate_time_entry_photo_paths
  before insert or update of photo_paths, user_id, employee_id, id on public.time_entries
  for each row execute function public.validate_time_entry_photo_paths();
