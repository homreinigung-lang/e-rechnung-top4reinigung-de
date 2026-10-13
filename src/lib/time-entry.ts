export const BREAK_CHOICES = [0, 15, 30, 45, 60] as const;

export function toMinutes(time: string): number | null {
  if (!/^\d{2}:\d{2}$/.test(time)) return null;
  const [hours, minutes] = time.split(":").map(Number);
  if (hours === undefined || minutes === undefined || hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function workedHours(start: string, end: string, pause: number): number {
  const s = toMinutes(start),
    e = toMinutes(end);
  if (s === null || e === null || e <= s || !Number.isFinite(pause)) return 0;
  return Math.max(0, Math.round(((e - s - Math.max(0, pause)) / 60) * 100) / 100);
}

export function clockTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
