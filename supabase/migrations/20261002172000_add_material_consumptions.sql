begin;

create table if not exists public.material_consumptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  material_id uuid not null references public.materials(id) on delete restrict,
  quantity numeric(12,2) not null check (quantity > 0),
  unit_cost numeric(12,2) not null default 0 check (unit_cost >= 0),
  consumed_on date not null default current_date,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists material_consumptions_user_date_idx
  on public.material_consumptions(user_id, consumed_on desc);
create index if not exists material_consumptions_project_date_idx
  on public.material_consumptions(project_id, consumed_on desc);
create index if not exists material_consumptions_material_idx
  on public.material_consumptions(material_id);

alter table public.material_consumptions enable row level security;

revoke all on public.material_consumptions from public, anon, authenticated;
grant select, insert, update, delete on public.material_consumptions to authenticated;
grant all on public.material_consumptions to service_role;

drop policy if exists "Owner manages own material consumptions" on public.material_consumptions;
create policy "Owner manages own material consumptions"
  on public.material_consumptions for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create or replace function public.validate_material_consumption_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or new.user_id <> auth.uid() then
    raise exception 'Nicht angemeldet oder falscher Mandant';
  end if;

  if not exists (
    select 1 from public.projects p
    where p.id = new.project_id and p.user_id = new.user_id
  ) then
    raise exception 'Objekt gehört nicht zu diesem Konto';
  end if;

  if not exists (
    select 1 from public.materials m
    where m.id = new.material_id and m.user_id = new.user_id and m.active = true
  ) then
    raise exception 'Material gehört nicht zu diesem Konto oder ist archiviert';
  end if;

  if not exists (
    select 1 from public.project_materials pm
    where pm.user_id = new.user_id
      and pm.project_id = new.project_id
      and pm.material_id = new.material_id
  ) then
    raise exception 'Material ist diesem Objekt noch nicht zugeordnet';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.validate_material_consumption_refs() from public, anon, authenticated;

drop trigger if exists validate_material_consumption_refs_trigger on public.material_consumptions;
create trigger validate_material_consumption_refs_trigger
before insert or update on public.material_consumptions
for each row execute function public.validate_material_consumption_refs();

create or replace function public.apply_material_consumption_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  if tg_op = 'INSERT' then
    update public.project_materials
       set object_stock = object_stock - new.quantity
     where user_id = new.user_id
       and project_id = new.project_id
       and material_id = new.material_id
       and object_stock >= new.quantity;
    get diagnostics affected = row_count;
    if affected <> 1 then
      raise exception 'Nicht genügend Bestand im Objekt';
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    update public.project_materials
       set object_stock = object_stock + old.quantity
     where user_id = old.user_id
       and project_id = old.project_id
       and material_id = old.material_id;
    return old;
  else
    update public.project_materials
       set object_stock = object_stock + old.quantity
     where user_id = old.user_id
       and project_id = old.project_id
       and material_id = old.material_id;

    update public.project_materials
       set object_stock = object_stock - new.quantity
     where user_id = new.user_id
       and project_id = new.project_id
       and material_id = new.material_id
       and object_stock >= new.quantity;
    get diagnostics affected = row_count;
    if affected <> 1 then
      raise exception 'Nicht genügend Bestand im Objekt';
    end if;
    return new;
  end if;
end;
$$;

revoke all on function public.apply_material_consumption_stock() from public, anon, authenticated;

drop trigger if exists apply_material_consumption_stock_trigger on public.material_consumptions;
create trigger apply_material_consumption_stock_trigger
after insert or update or delete on public.material_consumptions
for each row execute function public.apply_material_consumption_stock();

commit;
