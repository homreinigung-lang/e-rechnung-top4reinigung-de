alter table public.recurring_invoices
  add column if not exists anchor_day smallint;

-- Recover the original anchor for existing series as far as historical runs allow.
-- Example: if a series ran on Jan 31, Feb 28 and then drifted to Mar 28,
-- the maximum historical run day restores the intended anchor 31.
update public.recurring_invoices r
set anchor_day = greatest(
  extract(day from r.next_run)::integer,
  coalesce((
    select max(extract(day from d.recurring_run_date)::integer)
    from public.documents d
    where d.recurring_invoice_id = r.id
      and d.recurring_run_date is not null
  ), 0)
)::smallint
where r.anchor_day is null;

create or replace function public.set_recurring_invoice_anchor_day()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.anchor_day is null then
    new.anchor_day := extract(day from new.next_run)::smallint;
  end if;
  if new.anchor_day < 1 or new.anchor_day > 31 then
    raise exception 'anchor_day muss zwischen 1 und 31 liegen';
  end if;
  return new;
end
$$;

drop trigger if exists set_recurring_invoice_anchor_day on public.recurring_invoices;
create trigger set_recurring_invoice_anchor_day
before insert on public.recurring_invoices
for each row execute function public.set_recurring_invoice_anchor_day();

alter table public.recurring_invoices
  alter column anchor_day set not null;

alter table public.recurring_invoices
  drop constraint if exists recurring_invoices_anchor_day_check;

alter table public.recurring_invoices
  add constraint recurring_invoices_anchor_day_check
  check (anchor_day between 1 and 31);
