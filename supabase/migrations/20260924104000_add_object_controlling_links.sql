-- Link invoices and expenses to projects for Objekt-Controlling.
-- Nullable by design so historical/unassigned records remain valid.
alter table public.documents
  add column if not exists project_id uuid references public.projects(id) on delete set null;

alter table public.expenses
  add column if not exists project_id uuid references public.projects(id) on delete set null;

create index if not exists documents_project_id_idx on public.documents(project_id);
create index if not exists expenses_project_id_idx on public.expenses(project_id);

-- Safe historical backfill: only documents whose customer belongs to exactly one
-- project of the same tenant can be assigned unambiguously.
with unique_customer_project as (
  select user_id, customer_id, min(id::text)::uuid as project_id
  from public.projects
  where customer_id is not null
  group by user_id, customer_id
  having count(*) = 1
)
update public.documents d
set project_id = p.project_id
from unique_customer_project p
where d.project_id is null
  and d.user_id = p.user_id
  and d.customer_id = p.customer_id;
