/** Gesetzliche Feiertage im Saarland (inkl. Fronleichnam, Mariä Himmelfahrt, Allerheiligen). */

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function addDays(d: Date, n: number) {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

/** Ostersonntag nach der Gaußschen Osterformel. */
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

const cache = new Map<number, Map<string, string>>();

/** Alle saarländischen Feiertage eines Jahres als Map „YYYY-MM-DD“ → Name. */
export function saarlandHolidays(year: number): Map<string, string> {
  const cached = cache.get(year);
  if (cached) return cached;

  const easter = easterSunday(year);
  const map = new Map<string, string>([
    [`${year}-01-01`, "Neujahr"],
    [iso(addDays(easter, -2)), "Karfreitag"],
    [iso(easter), "Ostersonntag"],
    [iso(addDays(easter, 1)), "Ostermontag"],
    [`${year}-05-01`, "Tag der Arbeit"],
    [iso(addDays(easter, 39)), "Christi Himmelfahrt"],
    [iso(addDays(easter, 49)), "Pfingstsonntag"],
    [iso(addDays(easter, 50)), "Pfingstmontag"],
    [iso(addDays(easter, 60)), "Fronleichnam"],
    [`${year}-08-15`, "Mariä Himmelfahrt"],
    [`${year}-10-03`, "Tag der Deutschen Einheit"],
    [`${year}-11-01`, "Allerheiligen"],
    [`${year}-12-25`, "1. Weihnachtstag"],
    [`${year}-12-26`, "2. Weihnachtstag"],
  ]);

  cache.set(year, map);
  return map;
}

/** Feiertagsname für ein ISO-Datum oder null. */
export function holidayName(isoDate: string): string | null {
  const year = Number(isoDate.slice(0, 4));
  if (!Number.isFinite(year)) return null;
  return saarlandHolidays(year).get(isoDate) ?? null;
}
