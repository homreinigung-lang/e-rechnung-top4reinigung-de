export type TripType = "one_way" | "round_trip";

export type FahrtenbuchEntry = {
  id: string;
  user_id: string;
  vehicle_id: string | null;
  employee_id: string | null;
  trip_date: string;
  trip_time: string | null;
  return_time: string | null;
  trip_type: TripType;
  from_location: string;
  customer_id: string | null;
  customer_name: string;
  to_location: string;
  start_km: number;
  end_km: number;
  distance_km: number;
  notes: string;
  created_at: string;
  updated_at: string;
};

export type Vehicle = {
  id: string;
  user_id: string;
  vehicle_name: string;
  license_plate: string;
};

export type MonthlyOdometer = {
  id: string;
  user_id: string;
  vehicle_id: string;
  month: string;
  start_km: number;
  end_km: number | null;
};

export type Customer = {
  id: string;
  name: string | null;
  company: string | null;
  address_line: string | null;
  postal_code: string | null;
  city: string | null;
  service_address_line: string | null;
  service_postal_code: string | null;
  service_city: string | null;
};

export type CompanyAddress = {
  company_name: string | null;
  address_line: string | null;
  postal_code: string | null;
  city: string | null;
};

export type FormState = {
  id?: string;
  employee_id: string;
  vehicle_id: string;
  trip_date: string;
  trip_time: string;
  return_time: string;
  trip_type: TripType;
  from_location: string;
  customer_id: string;
  customer_name: string;
  to_location: string;
  start_km: string;
  end_km: string;
  notes: string;
};

export function localDateTime() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  const iso = local.toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16), month: iso.slice(0, 7) };
}

export const emptyForm = (): FormState => {
  const now = localDateTime();
  return {
    vehicle_id: "none",
    employee_id: "none",
    trip_date: now.date,
    trip_time: now.time,
    return_time: "",
    trip_type: "one_way",
    from_location: "",
    customer_id: "none",
    customer_name: "",
    to_location: "",
    start_km: "",
    end_km: "",
    notes: "",
  };
};

export function customerLabel(c: Customer) {
  return c.company?.trim() || c.name?.trim() || "Kunde";
}

export function customerAddress(c: Customer) {
  const street = c.service_address_line?.trim() || c.address_line?.trim() || "";
  const postal = c.service_postal_code?.trim() || c.postal_code?.trim() || "";
  const city = c.service_city?.trim() || c.city?.trim() || "";
  return [street, [postal, city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}

export function formatKm(value: number | string | null | undefined) {
  const n = Number(value ?? 0);
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: n % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 1,
  }).format(n);
}

export function formatDate(date: string) {
  return new Intl.DateTimeFormat("de-DE").format(new Date(`${date}T12:00:00`));
}

export function formatTime(time: string | null | undefined) {
  return time ? time.slice(0, 5) : "–";
}

export function tripTypeLabel(type: TripType) {
  return type === "round_trip" ? "Hin- und Rückfahrt" : "Nur Hinfahrt";
}

export function csvEscape(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export function downloadText(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
