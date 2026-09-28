import { sollHoursForMonth } from "@/lib/zeitkonto";
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
  start_time?: string | null;
  end_time?: string | null;
  break_minutes?: number | string | null;
};

export type LohnEmployee = {
  id: string;
  name?: string | null;
  personnel_number?: string | null;
  hourly_rate?: number | string | null;
  weekly_hours?: number | string | null;
  contract_type?: string | null;
  contract_start?: string | null;
};

export type LohnartRule = {
  kind?: string | null;
  surcharge_percent?: number | string | null;
  active?: boolean | null;
  time_from?: string | null;
  time_to?: string | null;
};

export type LohnvorbereitungRow = {
  employeeId: string;
  mitarbeiter: string;
  personalNr: string;
  normalstunden: number;
  sonntagstunden: number;
  nachtstunden: number;
  feiertagstunden: number;
  ueberstunden: number;
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


function minutes(value: string | null | undefined) {
  const match = String(value ?? "").match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h > 23 || m > 59) return null;
  return h * 60 + m;
}

function overlapMinutes(start: number, end: number, windowStart: number, windowEnd: number) {
  const segments = windowEnd > windowStart
    ? [[windowStart, windowEnd]]
    : [[windowStart, 1440], [0, windowEnd]];
  let total = 0;
  for (const [a, b] of segments) {
    total += Math.max(0, Math.min(end, b) - Math.max(start, a));
    total += Math.max(0, Math.min(end, b + 1440) - Math.max(start, a + 1440));
  }
  return total;
}

function nightHours(entry: LohnEntry, rule: LohnartRule | undefined) {
  if (!rule?.time_from || !rule?.time_to) return 0;
  const start = minutes(entry.start_time);
  const endRaw = minutes(entry.end_time);
  const from = minutes(rule.time_from);
  const to = minutes(rule.time_to);
  if (start === null || endRaw === null || from === null || to === null) return 0;
  const end = endRaw <= start ? endRaw + 1440 : endRaw;
  const grossMinutes = Math.max(1, end - start);
  const paidHours = n(entry.hours);
  if (paidHours <= 0) return 0;
  const overlap = overlapMinutes(start, end, from, to);
  return round((overlap / grossMinutes) * paidHours);
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
  holidayDates: string[] = [],
): LohnvorbereitungRow[] {
  const surcharge = (kind: string) => {
    const rule = wageTypes.find((w) => w.active !== false && String(w.kind) === kind);
    return n(rule?.surcharge_percent) / 100;
  };

  const holidaySet = new Set(holidayDates);
  const nightRule = wageTypes.find((w) => w.active !== false && String(w.kind) === "night");

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
      let night = 0;
      let holiday = 0;
      let base = 0;
      let supplements = 0;
      let totalWorkHours = 0;

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
        totalWorkHours += hours;
        base += hours * rate;

        if (isSunday(date)) {
          sunday += hours;
          supplements += hours * rate * surcharge("sunday");
        } else {
          normal += hours;
        }

        const nHours = nightHours(entry, nightRule);
        if (nHours > 0) {
          night += nHours;
          supplements += nHours * rate * surcharge("night");
        }

        if (holidaySet.has(date)) {
          holiday += hours;
          supplements += hours * rate * surcharge("holiday");
        }
      }

      const month = String(rows.find((entry) => entry.work_date)?.work_date ?? "").slice(0, 7);
      const monthlySoll = month
        ? sollHoursForMonth(n(employee.weekly_hours), month, employee.contract_start)
        : 0;
      const overtime = monthlySoll > 0 ? Math.max(0, totalWorkHours - monthlySoll) : 0;
      if (overtime > 0) {
        supplements += overtime * n(employee.hourly_rate) * surcharge("overtime");
      }

      return {
        employeeId: employee.id,
        mitarbeiter: String(employee.name ?? ""),
        personalNr: String(employee.personnel_number ?? ""),
        normalstunden: round(normal),
        sonntagstunden: round(sunday),
        nachtstunden: round(night),
        feiertagstunden: round(holiday),
        ueberstunden: round(overtime),
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
        row.nachtstunden ||
        row.feiertagstunden ||
        row.ueberstunden ||
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
    "Nachtstunden": row.nachtstunden.toFixed(2).replace(".", ","),
    "Feiertagsstunden": row.feiertagstunden.toFixed(2).replace(".", ","),
    "Überstunden": row.ueberstunden.toFixed(2).replace(".", ","),
    Urlaubstage: String(row.urlaubstage),
    Kranktage: String(row.kranktage),
    "Sonstige Abwesenheitstage": String(row.sonstigeAbwesenheitstage),
    Grundlohn: row.grundlohn.toFixed(2).replace(".", ","),
    Zuschlaege: row.zuschlaege.toFixed(2).replace(".", ","),
    "Brutto vorbereitet": row.bruttoVorbereitet.toFixed(2).replace(".", ","),
  }));
}
