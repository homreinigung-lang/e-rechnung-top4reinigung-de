import { recurrenceUnitLabel, visitsPerMonth, type RecurrenceUnit } from "./constants";
import { formatNumber, parsePositiveNumber, roundCents } from "./format";

const units: RecurrenceUnit[] = ["week", "fortnight", "month", "quarter", "year"];
const rhythm = /(?:;\s*)?Turnus: [^;\n]*/gu;

export function readQuoteRecurrence(description: string): { frequency: string; unit: RecurrenceUnit } | null {
  if (/Turnus: einmalige Reinigung/u.test(description)) return { frequency: "1", unit: "once" };
  const source = description.includes("Turnus: ") ? description.split("Turnus: ").at(-1)! : description;
  for (const unit of units) {
    const label = recurrenceUnitLabel(unit).split(" (")[0]!;
    const match = source.match(new RegExp("(?:Turnus: )?(\\d+(?:[.,]\\d+)?)\\s*(?:×\\s*)?" + label));
    if (match) return { frequency: match[1]!, unit };
  }
  return null;
}

export function quoteRecurrencePosition(input: {
  description: string; frequency: string; unit: RecurrenceUnit; pricePerVisit: string;
}) {
  const frequency = input.unit === "once" ? 1 : parsePositiveNumber(input.frequency);
  const price = parsePositiveNumber(input.pricePerVisit);
  if (!(frequency > 0) || !(price > 0)) throw new Error("Bitte Anzahl und Netto-Preis je Einsatz angeben.");
  const visits = visitsPerMonth(frequency, input.unit);
  const cadence = input.unit === "once" ? "einmalige Reinigung" : `${formatNumber(frequency)} × ${recurrenceUnitLabel(input.unit)}`;
  const description = input.description.replace(rhythm, "")
    .replace(/, (?:durchschnittlich )?\d+(?:[.,]\d+)? Einsätze\/Monat/gu, "")
    .replace(/, \d+(?:[.,]\d+)? (?:pro Woche|alle 2 Wochen \(14-tägig\)|pro Monat|pro Quartal|pro Jahr) – Monatsdurchschnitt/gu, "")
    .trim();
  return {
    description: description + `; Turnus: ${cadence}`,
    quantity: 1,
    unit: input.unit === "once" ? "Einsatz" : "Monat",
    unit_price: roundCents(price * visits),
  };
}
