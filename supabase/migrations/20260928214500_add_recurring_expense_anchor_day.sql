alter table public.recurring_expenses
  add column if not exists anchor_day smallint;

update public.recurring_expenses
set anchor_day = extract(day from next_run)::smallint
where anchor_day is null;

create or replace function public.set_recurring_expense_anchor_day()
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

drop trigger if exists set_recurring_expense_anchor_day on public.recurring_expenses;
create trigger set_recurring_expense_anchor_day
before insert on public.recurring_expenses
for each row execute function public.set_recurring_expense_anchor_day();

alter table public.recurring_expenses
  alter column anchor_day set not null;

alter table public.recurring_expenses
  drop constraint if exists recurring_expenses_anchor_day_check;

alter table public.recurring_expenses
  add constraint recurring_expenses_anchor_day_check
  check (anchor_day between 1 and 31);
