CREATE TABLE public.employees (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  role text not null default '',
  hourly_rate numeric not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employees TO authenticated;
GRANT ALL ON public.employees TO service_role;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own employees" ON public.employees FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER t_employees_updated BEFORE UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.time_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete set null,
  employee_name text not null default '',
  customer_id uuid references public.customers(id) on delete set null,
  work_date date not null default CURRENT_DATE,
  start_time time,
  end_time time,
  break_minutes integer not null default 0,
  hours numeric not null default 0,
  hourly_rate numeric not null default 0,
  location text not null default '',
  note text not null default '',
  billed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.time_entries TO authenticated;
GRANT ALL ON public.time_entries TO service_role;
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own time entries" ON public.time_entries FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER t_time_entries_updated BEFORE UPDATE ON public.time_entries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_time_entries_date ON public.time_entries (user_id, work_date DESC);