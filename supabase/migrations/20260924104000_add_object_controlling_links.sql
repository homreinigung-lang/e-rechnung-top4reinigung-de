-- Link invoices and expenses to projects for Objekt-Controlling.
-- Nullable by design so historical/unassigned records remain valid.
-- Existing locked invoices are intentionally not backfilled because GoBD immutability
-- forbids changing finalized documents. Historical revenue is attributed safely at
-- read time only when a customer has exactly one project.
alter table public.documents
  add column if not exists project_id uuid references public.projects(id) on delete set null;

alter table public.expenses
  add column if not exists project_id uuid references public.projects(id) on delete set null;

create index if not exists documents_project_id_idx on public.documents(project_id);
create index if not exists expenses_project_id_idx on public.expenses(project_id);
