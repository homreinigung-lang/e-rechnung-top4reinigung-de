/** Common spoken/written German forms, without changing prices or guessing quantities. */
export function normalizeCalculationLanguage(value: string): string {
  const numbers: Record<string, string> = { ein: "1", eine: "1", einen: "1", einem: "1", einer: "1", eins: "1", zwei: "2", drei: "3", vier: "4", fünf: "5", fuenf: "5", sechs: "6", sieben: "7", acht: "8", neun: "9", zehn: "10", elf: "11", zwölf: "12", zwoelf: "12" };
  return value.trim().toLowerCase()
    .replace(/m\s*(?:\^\s*2|²)/g, "m2")
    .replace(/×/g, "x")
    .replace(/\b(ein|zwei|drei|vier|fünf|fuenf|sechs|sieben)\s+mal\b/g, "$1mal")
    .replace(/\b(?:eineinhalb|anderthalb)\b/g, "1,5")
    .replace(/\bzweieinhalb\b/g, "2,5")
    .replace(/\bdreieinhalb\b/g, "3,5")
    .replace(/\b(?:eine?\s+)?halbe\s+stunde\b/g, "0,5 stunden")
    .replace(/\b(ein|eine|einen|einem|einer|eins|zwei|drei|vier|fünf|fuenf|sechs|sieben|acht|neun|zehn|elf|zwölf|zwoelf)\b(?=\s+(?:stunden?|minuten?|etagen?|hallen?|monate?|wochen|tage)\b)/g, word => numbers[word]!)
    .replace(/\b(ein|zwei|drei|vier|fünf|fuenf|sechs|sieben)mal(?=\s+alle\b)/g, (_match, word: string) => `${numbers[word]}mal`)
    .replace(/\s+/g, " ");
}

export type DescribedDuration = { hours: number; period: "visit" | "month" | "week"; ambiguous: boolean };
export function readDescribedDuration(value: string): DescribedDuration {
  const text = normalizeCalculationLanguage(value);
  const number = (value: string | undefined) => Number((value ?? "0").replace(",", "."));
  const pattern = /(?<![-\d])(?:(\d{1,2}):(\d{2})\s*(?:stunden?|std\.?|h)(?![a-z])|(\d+(?:[.,]\d+)?)\s*(?:stunden?|std\.?|h)(?![a-z])(?:\s*(?:und\s*)?(\d+(?:[.,]\d+)?)\s*(?:minuten?|min\.?)(?![a-z]))?|(\d+(?:[.,]\d+)?)\s*(?:minuten?|min\.?)(?![a-z]))/g;
  const found: DescribedDuration[] = [];
  for (const match of text.matchAll(pattern)) {
    const before = text.slice(Math.max(0, match.index! - 35), match.index).trim();
    const after = text.slice(match.index! + match[0].length);
    if (/(?:fahrt(?:zeit)?|anfahrt|pause|vorbereitung)\s*[:=]?\s*$/.test(before) || /^\s*(?:pro|je|\/)\s*(?:etage|stockwerk|geschoss)\b/.test(after)) continue;
    if (match[1] && number(match[2]) >= 60) return { hours: 0, period: "visit", ambiguous: true };
    const hours = match[1] ? number(match[1]) + number(match[2]) / 60 : match[3] ? number(match[3]) + number(match[4]) / 60 : number(match[5]) / 60;
    const period = /^\s*(?:pro|je|im|\/)\s*monat\b/.test(after) ? "month" : /^\s*(?:pro|je|in der|\/)\s*woche\b/.test(after) ? "week" : "visit";
    found.push({ hours, period, ambiguous: false });
  }
  if (found.length > 1) return { hours: 0, period: "visit", ambiguous: true };
  return found[0] ?? { hours: 0, period: "visit", ambiguous: false };
}
