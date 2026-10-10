export type Employee = {
  id: string;
  name: string;
  role: string;
  weekly_hours: number | null;
  user_id: string;
};

export type Project = {
  id: string;
  name: string | null;
  city: string | null;
  address_line: string | null;
  postal_code: string | null;
  status: string | null;
  customer_id?: string | null;
};

export type Customer = {
  id: string;
  name: string;
  company: string | null;
  city: string | null;
  address_line: string | null;
  postal_code: string | null;
};

export type GridObject = Project & { customerId?: string; virtual?: boolean };

export type Assignment = {
  id: string;
  project_id: string;
  employee_id: string;
  hours_per_week: number | null;
  day_hours: unknown;
  day_times?: unknown;
  assignment_role: string | null;
  start_date: string | null;
  end_date: string | null;
};

export function isoDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function mondayOf(date: Date) {
  const d = new Date(date);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - (day - 1));
  d.setHours(12, 0, 0, 0);
  return d;
}

export function addDays(date: Date, n: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export type CalculationPlanSeed = {
  projectId: string;
  monthlyHours: number;
  visitsPerMonth: number;
};
