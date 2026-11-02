export type WasteBin = "rest" | "gelb" | "papier" | "bio";
export type WasteCollection = { bin_type: WasteBin; collection_date: string };
const patterns: Record<WasteBin, RegExp> = {
  rest: /restmüll|restabfall|schwarze tonne/i,
  gelb: /gelbe tonne|gelber sack|leichtverpackung/i,
  papier: /papier|pappe|blaue tonne/i,
  bio: /bioabfall|biomüll|biotonne/i,
};
export function parseWasteLines(text: string, selected: readonly WasteBin[]): WasteCollection[] {
  const found = new Map<string, WasteCollection>();
  for (const line of text.split(/\r?\n/)) {
    const matches = [...line.matchAll(/\b(\d{1,2})\.(\d{1,2})\.(20\d{2})\b/g)];
    if (matches.length !== 1) continue;
    const match = matches[0];
    const day = Number(match[1]), month = Number(match[2]), year = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) continue;
    const types = selected.filter(bin => patterns[bin].test(line));
    if (types.length !== 1) continue; // ambiguous lines must be entered manually
    const collection_date = `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    const entry = {bin_type:types[0],collection_date};
    found.set(`${entry.bin_type}:${collection_date}`,entry);
  }
  return [...found.values()].sort((a,b)=>a.collection_date.localeCompare(b.collection_date));
}
export function isWasteDue(date: string, today: string, reminderDays: number): boolean {
  const target = Date.parse(date+"T12:00:00Z"), now = Date.parse(today+"T12:00:00Z");
  return Number.isFinite(target)&&Number.isFinite(now)&&target>=now&&target-now<=reminderDays*86400000;
}
