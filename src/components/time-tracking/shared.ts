export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function de(n: number) {
  return n.toFixed(2).replace(".", ",");
}

export type Employee = {
  id: string;
  name: string;
  role: string;
  hourly_rate: number;
  active: boolean;
  email: string;
  phone: string;
  personnel_number: string;
  auth_user_id: string | null;
  contract_type?: string | null;
  contract_start?: string | null;
  weekly_hours?: number | null;
};

export type EntryForm = {
  id?: string;
  employee_id: string;
  employee_name: string;
  customer_id: string;
  project_id: string;
  work_date: string;
  start_time: string;
  end_time: string;
  break_minutes: string;
  hours: string;
  hourly_rate: string;
  location: string;
  note: string;
};

export const emptyEntry = (): EntryForm => ({
  employee_id: "",
  employee_name: "",
  customer_id: "",
  project_id: "",
  work_date: new Date().toISOString().slice(0, 10),
  start_time: "08:00",
  end_time: "16:00",
  break_minutes: "30",
  hours: "",
  hourly_rate: "",
  location: "",
  note: "",
});

export const CONTRACT_TYPES = [
  "Vollzeit",
  "Teilzeit",
  "Minijob",
  "Aushilfe",
  "Werkstudent",
  "Praktikum",
];

export const emptyEmployee = {
  id: undefined as string | undefined,
  name: "",
  role: "",
  email: "",
  phone: "",
  personnel_number: "",
  hourly_rate: "",
  contract_type: "",
  contract_start: "",
  weekly_hours: "",
};

export function num(v: string) {
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export function computeHours(start: string, end: string, breakMinutes: string) {
  if (!start || !end) return 0;
  const [sh = NaN, sm = NaN] = start.split(":").map(Number);
  const [eh = NaN, em = NaN] = end.split(":").map(Number);
  if ([sh, sm, eh, em].some((x) => Number.isNaN(x))) return 0;
  let minutes = eh * 60 + em - (sh * 60 + sm);
  if (minutes < 0) minutes += 24 * 60;
  minutes -= num(breakMinutes);
  return Math.max(0, Math.round((minutes / 60) * 100) / 100);
}

export function monthKey(d: string) {
  return d.slice(0, 7);
}

export function monthEndDate(monthValue: string) {
  const year = Number(monthValue.slice(0, 4));
  const monthIndex = Number(monthValue.slice(5, 7));
  const day = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();
  return `${monthValue}-${String(day).padStart(2, "0")}`;
}
