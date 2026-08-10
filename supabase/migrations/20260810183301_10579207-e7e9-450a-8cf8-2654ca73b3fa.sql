CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  mode text NOT NULL DEFAULT 'floorplan',
  status text NOT NULL DEFAULT 'open',
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name text NOT NULL DEFAULT '',
  contact_email text NOT NULL DEFAULT '',
  contact_phone text NOT NULL DEFAULT '',
  address_line text NOT NULL DEFAULT '',
  postal_code text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  source_file_path text NOT NULL DEFAULT '',
  source_file_name text NOT NULL DEFAULT '',
  expected_room_count integer NOT NULL DEFAULT 0,
  executive_summary text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  hourly_rate numeric NOT NULL DEFAULT 0,
  sqm_per_hour numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own projects" ON public.projects FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER t_projects_updated BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.project_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 1,
  name text NOT NULL DEFAULT '',
  floor text NOT NULL DEFAULT '',
  usage_type text NOT NULL DEFAULT '',
  area_sqm numeric NOT NULL DEFAULT 0,
  frequency text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  confirmed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_rooms TO authenticated;
GRANT ALL ON public.project_rooms TO service_role;
ALTER TABLE public.project_rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own project rooms" ON public.project_rooms FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER t_project_rooms_updated BEFORE UPDATE ON public.project_rooms FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.project_lv_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 1,
  section text NOT NULL DEFAULT '',
  title text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  quantity numeric NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT '',
  unit_price numeric NOT NULL DEFAULT 0,
  deadline date,
  evidence text NOT NULL DEFAULT '',
  critical boolean NOT NULL DEFAULT false,
  done boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_lv_items TO authenticated;
GRANT ALL ON public.project_lv_items TO service_role;
ALTER TABLE public.project_lv_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own project lv items" ON public.project_lv_items FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER t_project_lv_items_updated BEFORE UPDATE ON public.project_lv_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.project_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assignment_role text NOT NULL DEFAULT '',
  start_date date,
  end_date date,
  hours_per_week numeric NOT NULL DEFAULT 0,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, employee_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_assignments TO authenticated;
GRANT ALL ON public.project_assignments TO service_role;
ALTER TABLE public.project_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own project assignments" ON public.project_assignments FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "employee reads own assignments" ON public.project_assignments FOR SELECT TO authenticated USING (employee_id = public.my_employee_id());
CREATE TRIGGER t_project_assignments_updated BEFORE UPDATE ON public.project_assignments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();