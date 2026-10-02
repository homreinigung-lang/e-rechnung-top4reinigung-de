-- Materialverwaltung: Lagerbestand, objektbezogene Ausstattung und Bestellungen.
begin;

create table if not exists public.materials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 180),
  sku text not null default '',
  unit text not null default 'Stk.',
  current_stock numeric(12,2) not null default 0 check (current_stock >= 0),
  min_stock numeric(12,2) not null default 0 check (min_stock >= 0),
  unit_cost numeric(12,2) not null default 0 check (unit_cost >= 0),
  supplier text not null default '',
  notes text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_materials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  material_id uuid not null references public.materials(id) on delete cascade,
  target_stock numeric(12,2) not null default 0 check (target_stock >= 0),
  object_stock numeric(12,2) not null default 0 check (object_stock >= 0),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, project_id, material_id)
);

create table if not exists public.material_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  material_id uuid not null references public.materials(id) on delete restrict,
  quantity numeric(12,2) not null check (quantity > 0),
  status text not null default 'offen'
    check (status in ('offen','bestellt','geliefert','storniert')),
  supplier text not null default '',
  order_date date,
  expected_date date,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists materials_user_active_idx
  on public.materials(user_id, active, name);
create index if not exists project_materials_project_idx
  on public.project_materials(project_id);
create index if not exists project_materials_material_idx
  on public.project_materials(material_id);
create index if not exists material_orders_user_status_idx
  on public.material_orders(user_id, status, created_at desc);
create index if not exists material_orders_project_idx
  on public.material_orders(project_id);

alter table public.materials enable row level security;
alter table public.project_materials enable row level security;
alter table public.material_orders enable row level security;

revoke all on public.materials, public.project_materials, public.material_orders
  from public, anon, authenticated;
grant select, insert, update, delete
  on public.materials, public.project_materials, public.material_orders
  to authenticated;
grant all on public.materials, public.project_materials, public.material_orders to service_role;

drop policy if exists "Owner manages own materials" on public.materials;
create policy "Owner manages own materials"
  on public.materials for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Owner manages own project materials" on public.project_materials;
create policy "Owner manages own project materials"
  on public.project_materials for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Owner manages own material orders" on public.material_orders;
create policy "Owner manages own material orders"
  on public.material_orders for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create or replace function public.materials_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists materials_touch_updated_at_trigger on public.materials;
create trigger materials_touch_updated_at_trigger
before update on public.materials
for each row execute function public.materials_touch_updated_at();

drop trigger if exists project_materials_touch_updated_at_trigger on public.project_materials;
create trigger project_materials_touch_updated_at_trigger
before update on public.project_materials
for each row execute function public.materials_touch_updated_at();

drop trigger if exists material_orders_touch_updated_at_trigger on public.material_orders;
create trigger material_orders_touch_updated_at_trigger
before update on public.material_orders
for each row execute function public.materials_touch_updated_at();

create or replace function public.validate_material_tenant_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or new.user_id <> auth.uid() then
    raise exception 'Nicht angemeldet oder falscher Mandant';
  end if;

  if tg_table_name in ('project_materials','material_orders') then
    if not exists (
      select 1 from public.materials m
      where m.id = new.material_id and m.user_id = new.user_id
    ) then
      raise exception 'Material gehört nicht zu diesem Konto';
    end if;
  end if;

  if tg_table_name = 'project_materials' or
     (tg_table_name = 'material_orders' and new.project_id is not null) then
    if not exists (
      select 1 from public.projects p
      where p.id = new.project_id and p.user_id = new.user_id
    ) then
      raise exception 'Objekt gehört nicht zu diesem Konto';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.validate_material_tenant_refs() from public, anon, authenticated;

drop trigger if exists validate_project_material_tenant_refs_trigger on public.project_materials;
create trigger validate_project_material_tenant_refs_trigger
before insert or update on public.project_materials
for each row execute function public.validate_material_tenant_refs();

drop trigger if exists validate_material_order_tenant_refs_trigger on public.material_orders;
create trigger validate_material_order_tenant_refs_trigger
before insert or update on public.material_orders
for each row execute function public.validate_material_tenant_refs();

commit;
