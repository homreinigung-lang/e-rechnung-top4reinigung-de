begin;

drop policy if exists "Assigned employee reads project materials" on public.project_materials;
create policy "Assigned employee reads project materials"
  on public.project_materials for select to authenticated
  using (
    exists (
      select 1
      from public.employees e
      join public.project_assignments pa on pa.employee_id = e.id
      where e.auth_user_id = (select auth.uid())
        and e.user_id = project_materials.user_id
        and pa.project_id = project_materials.project_id
        and pa.employee_id = e.id
    )
  );

drop policy if exists "Assigned employee reads materials" on public.materials;
create policy "Assigned employee reads materials"
  on public.materials for select to authenticated
  using (
    exists (
      select 1
      from public.employees e
      join public.project_assignments pa on pa.employee_id = e.id
      join public.project_materials pm
        on pm.project_id = pa.project_id
       and pm.material_id = materials.id
       and pm.user_id = materials.user_id
      where e.auth_user_id = (select auth.uid())
        and e.user_id = materials.user_id
        and pa.employee_id = e.id
    )
  );

commit;
