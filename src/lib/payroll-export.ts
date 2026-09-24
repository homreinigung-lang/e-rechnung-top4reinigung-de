export type PayrollEntry = {
  employee_id?: string | null;
  employee_name?: string | null;
  personnel_number?: string | null;
  contract_type?: string | null;
  weekly_hours?: number | string | null;
  hourly_rate?: number | string | null;
  work_date?: string | null;
  hours?: number | string | null;
  lohnart?: string | null;
  entry_type?: string | null;
  absence_reason?: string | null;
  approval_status?: string | null;
};

export type PayrollSummaryRow = {
  Mitarbeiter: string;
  "Personal-Nr.": string;
  Vertragsart: string;
  "Wochenstunden": string;
  "Ist-Stunden": string;
  "Stundensatz": string;
  "Arbeitslohn": string;
  "Urlaubstage (U)": string;
  "Kranktage (K)": string;
  "Sonstige Abwesenheitstage (S)": string;
};

function num(value: unknown) {
  return Number(value ?? 0) || 0;
}

function de(value: number) {
  return value.toFixed(2).replace(".", ",");
}

export function payrollCode(entry: PayrollEntry) {
  const existing = String(entry.lohnart ?? "").toUpperCase();
  if (["A", "U", "K", "F", "S"].includes(existing)) return existing;

  const type = String(entry.entry_type ?? "work").toLowerCase();
  if (type === "work") return "A";
  const reason = String(entry.absence_reason ?? "").toLowerCase();
  if (reason.includes("krank") || reason.includes("sick") || type === "sick") return "K";
  if (reason.includes("urlaub") || reason.includes("vacation") || type === "vacation") return "U";
  if (reason.includes("feiertag") || reason.includes("holiday") || type === "holiday") return "F";
  return "S";
}

export function buildPayrollSummary(entries: PayrollEntry[]): PayrollSummaryRow[] {
  const grouped = new Map<
    string,
    {
      name: string;
      personnelNumber: string;
      contractType: string;
      weeklyHours: number;
      hourlyRate: number;
      hours: number;
      wage: number;
      vacationDays: Set<string>;
      sickDays: Set<string>;
      otherDays: Set<string>;
    }
  >();

  for (const entry of entries) {
    if (String(entry.approval_status ?? "approved") !== "approved") continue;

    const key =
      String(entry.employee_id ?? "").trim() ||
      String(entry.personnel_number ?? "").trim() ||
      String(entry.employee_name ?? "Ohne Zuordnung");

    const current =
      grouped.get(key) ??
      {
        name: String(entry.employee_name ?? "Ohne Zuordnung"),
        personnelNumber: String(entry.personnel_number ?? ""),
        contractType: String(entry.contract_type ?? ""),
        weeklyHours: num(entry.weekly_hours),
        hourlyRate: num(entry.hourly_rate),
        hours: 0,
        wage: 0,
        vacationDays: new Set<string>(),
        sickDays: new Set<string>(),
        otherDays: new Set<string>(),
      };

    const code = payrollCode(entry);
    const date = String(entry.work_date ?? "");

    if (code === "A") {
      const hours = num(entry.hours);
      const rate = num(entry.hourly_rate || current.hourlyRate);
      current.hours += hours;
      current.wage += hours * rate;
      if (!current.hourlyRate && rate) current.hourlyRate = rate;
    } else if (date) {
      if (code === "U") current.vacationDays.add(date);
      else if (code === "K") current.sickDays.add(date);
      else current.otherDays.add(date);
    }

    if (!current.personnelNumber && entry.personnel_number)
      current.personnelNumber = String(entry.personnel_number);
    if (!current.contractType && entry.contract_type)
      current.contractType = String(entry.contract_type);
    if (!current.weeklyHours && entry.weekly_hours)
      current.weeklyHours = num(entry.weekly_hours);

    grouped.set(key, current);
  }

  return [...grouped.values()]
    .sort((a, b) =>
      (a.personnelNumber || a.name).localeCompare(b.personnelNumber || b.name, "de"),
    )
    .map((row) => ({
      Mitarbeiter: row.name,
      "Personal-Nr.": row.personnelNumber,
      Vertragsart: row.contractType,
      Wochenstunden: row.weeklyHours ? de(row.weeklyHours) : "",
      "Ist-Stunden": de(row.hours),
      Stundensatz: de(row.hourlyRate),
      Arbeitslohn: de(row.wage),
      "Urlaubstage (U)": String(row.vacationDays.size),
      "Kranktage (K)": String(row.sickDays.size),
      "Sonstige Abwesenheitstage (S)": String(row.otherDays.size),
    }));
}
