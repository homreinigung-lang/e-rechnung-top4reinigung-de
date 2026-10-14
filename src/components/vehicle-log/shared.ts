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


type OdometerTrip = Pick<FahrtenbuchEntry, "vehicle_id" | "trip_date" | "trip_time" | "created_at" | "end_km">;

/** Latest by journey date/time, independent of list filters and input order. */
export function latestOdometerTrip(entries: OdometerTrip[], vehicleId?: string) {
  return entries
    .filter((entry) => vehicleId === undefined || (entry.vehicle_id ?? "none") === vehicleId)
    .reduce<OdometerTrip | undefined>((latest, entry) => {
      const key = (trip: OdometerTrip) => `${trip.trip_date}|${trip.trip_time ?? ""}|${trip.created_at}`;
      return !latest || key(entry) > key(latest) ? entry : latest;
    }, undefined);
}

export function newTripForm(entries: OdometerTrip[]): FormState {
  const latest = latestOdometerTrip(entries);
  return {
    ...emptyForm(),
    vehicle_id: latest?.vehicle_id ?? "none",
    start_km: latest ? String(latest.end_km) : "",
  };
}

export function selectTripVehicle(form: FormState, vehicleId: string, entries: OdometerTrip[]): FormState {
  const latest = latestOdometerTrip(entries, vehicleId);
  return {
    ...form,
    vehicle_id: vehicleId,
    // Editing a recorded trip must retain its stored odometer readings.
    start_km: form.id ? form.start_km : latest ? String(latest.end_km) : "",
  };
}


/** Advisory for new trips; historical edits retain their original readings. */
export function tripOdometerWarning(form: FormState, entries: OdometerTrip[]): string | null {
  if (form.id || form.vehicle_id === "none") return null;
  const latest = latestOdometerTrip(entries, form.vehicle_id);
  if (!latest || !Number.isFinite(latest.end_km)) return null;
  const lowerFields = [
    ["Start-km", form.start_km],
    ["End-km", form.end_km],
  ].filter(([, raw]) => {
    if (!raw?.trim()) return false;
    const value = Number(raw.replace(",", "."));
    return Number.isFinite(value) && value >= 0 && value < latest.end_km;
  }).map(([label]) => label);
  if (!lowerFields.length) return null;
  return `Achtung: ${lowerFields.join(" und ")} ${lowerFields.length > 1 ? "liegen" : "liegt"} unter dem letzten End-km-Stand dieses Fahrzeugs (${formatKm(latest.end_km)} km vom ${formatDate(latest.trip_date)}). Bitte Kilometerstand prüfen.`;
}

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
