export function monthlyDistance(start: string, end: string): number | null {
  if (!start.trim() || !end.trim()) return null;
  const first = Number(start);
  const last = Number(end);
  if (!Number.isFinite(first) || !Number.isFinite(last) || first < 0 || last < first) return null;
  return Math.round((last - first) * 10) / 10;
}

export function tripsForMonth<T extends { trip_date: string }>(entries: T[], month: string): T[] {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return [];
  return entries.filter((entry) => entry.trip_date.startsWith(`${month}-`));
}

export function monthlyMileage(start: number, end: number | null, business: number) {
  if (end === null)
    throw new Error(
      "Bitte den Kilometerstand am Monatsende speichern, bevor das Monats-PDF erstellt wird.",
    );
  const total = monthlyDistance(String(start), String(end));
  if (total === null || !Number.isFinite(business) || business < 0) {
    throw new Error("Bitte die gespeicherten Monatskilometer prüfen.");
  }
  if (Math.round(total * 10) < Math.round(business * 10)) {
    throw new Error(
      "Die Monatsstrecke ist kleiner als die geschäftlichen Kilometer. Bitte Monatsstände und Fahrten prüfen.",
    );
  }
  return {
    startKm: start,
    endKm: end,
    totalKm: total,
    businessKm: Math.round(business * 10) / 10,
    privateKm: Math.round((total - business) * 10) / 10,
  };
}
