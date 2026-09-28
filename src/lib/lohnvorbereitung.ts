export type LohnEntry = {
  employee_id?: string | null;
  employee_name?: string | null;
  work_date?: string | null;
  hours?: number | string | null;
  hourly_rate?: number | string | null;
  entry_type?: string | null;
  absence_reason?: string | null;
  approval_status?: string | null;
  completed_at?: string | null;
};

export type LohnEmployee = {
  id: string;
  name?: string | null;
  personnel_number?: string | null;
  hourly_rate?: number | string | null;
  weekly_hours?: number | string | null;
  contract_type?: string | null;
};

export type LohnartRule = {
  kind?: string | null;
  surcharge_percent?: number | string | null;
  active?: boolean | null;
};

export type LohnvorbereitungRow = {
  employeeId: string;
  mitarbeiter: string;
  personalNr: string;
  normalstunden: number;
  sonntagstunden: number;
  urlaubstage: number;
  kranktage: number;
  sonstigeAbwesenheitstage: number;
  grundlohn: number;
  zuschlaege: number;
  bruttoVorbereitet: number;
};

const n = (value: unknown) => Number(value ?? 0) || 0;
const round = (value: number) => Math.round(value * 100) / 100;

function isSunday(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  return new Date(date + "T12:00:00Z").getUTCDay() === 0;
}

function absenceKind(entry: LohnEntry): "vacation" | "sick" | "other" | null {
  const type = String(entry.entry_type ?? "work").toLowerCase();
  if (type === "work") return null;
  const reason = String(entry.absence_reason ?? "").toLowerCase();
  if (type === "vacation" || reason.includes("urlaub") || reason.includes("vacation")) return "vacation";
  if (type === "sick" || reason.includes("krank") || reason.includes("sick")) return "sick";
  return "other";
}

export function buildLohnvorbereitung(
  entries: LohnEntry[],
  employees: LohnEmployee[],
  wageTypes: LohnartRule[],
): LohnvorbereitungRow[] {
  const surcharge = (kind: string) => {
    const rule = wageTypes.find((w) => w.active !== false && String(w.kind) === kind);
    return n(rule?.surcharge_percent) / 100;
  };

  return employees
    .map((employee) => {
      const rows = entries.filter(
        (entry) =>
          entry.employee_id === employee.id &&
          String(entry.approval_status ?? "approved") === "approved",
      );
      const vacation = new Set<string>();
      const sick = new Set<string>();
      const other = new Set<string>();
      let normal = 0;
      let sunday = 0;
      let base = 0;
      let supplements = 0;

      for (const entry of rows) {
        const date = String(entry.work_date ?? "");
        const absence = absenceKind(entry);
        if (absence) {
          if (!date) continue;
          if (absence === "vacation") vacation.add(date);
          else if (absence === "sick") sick.add(date);
          else other.add(date);
          continue;
        }

        const hours = n(entry.hours);
        if (hours <= 0) continue;
        const rate = n(entry.hourly_rate) || n(employee.hourly_rate);
        base += hours * rate;

        if (isSunday(date)) {
          sunday += hours;
          supplements += hours * rate * surcharge("sunday");
        } else {
          normal += hours;
        }
      }

      return {
        employeeId: employee.id,
        mitarbeiter: String(employee.name ?? ""),
        personalNr: String(employee.personnel_number ?? ""),
        normalstunden: round(normal),
        sonntagstunden: round(sunday),
        urlaubstage: vacation.size,
        kranktage: sick.size,
        sonstigeAbwesenheitstage: other.size,
        grundlohn: round(base),
        zuschlaege: round(supplements),
        bruttoVorbereitet: round(base + supplements),
      };
    })
    .filter(
      (row) =>
        row.normalstunden ||
        row.sonntagstunden ||
        row.urlaubstage ||
        row.kranktage ||
        row.sonstigeAbwesenheitstage,
    )
    .sort((a, b) => (a.personalNr || a.mitarbeiter).localeCompare(b.personalNr || b.mitarbeiter, "de"));
}

export function lohnvorbereitungCsvRows(rows: LohnvorbereitungRow[]) {
  return rows.map((row) => ({
    Mitarbeiter: row.mitarbeiter,
    "Personal-Nr.": row.personalNr,
    Normalstunden: row.normalstunden.toFixed(2).replace(".", ","),
    "Sonntagsstunden": row.sonntagstunden.toFixed(2).replace(".", ","),
    Urlaubstage: String(row.urlaubstage),
    Kranktage: String(row.kranktage),
    "Sonstige Abwesenheitstage": String(row.sonstigeAbwesenheitstage),
    Grundlohn: row.grundlohn.toFixed(2).replace(".", ","),
    Zuschlaege: row.zuschlaege.toFixed(2).replace(".", ","),
    "Brutto vorbereitet": row.bruttoVorbereitet.toFixed(2).replace(".", ","),
  }));
}
