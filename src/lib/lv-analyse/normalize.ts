import { parseGermanNumber } from "@/lib/lv-form/number";
import { emptyCalculation } from "./calculation";
import type {
  LvFrequency,
  LvItemCategory,
  LvNormalizedItem,
  LvTotalLine,
} from "./types";

let counter = 0;
function nextId(): string {
  counter += 1;
  return `lv-${Date.now().toString(36)}-${counter}`;
}

export function toNumberOrNull(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const n = parseGermanNumber(value);
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

const CATEGORY_RULES: [LvItemCategory, RegExp][] = [
  ["glasreinigung", /(glas|fenster|rahmen|verglasung|jalousie)/i],
  ["grundreinigung", /(grundreinigung|intensivreinigung|erstreinigung|bauendreinigung)/i],
  ["winterdienst", /(winterdienst|schnee|streu)/i],
  ["verbrauchsmaterial", /(verbrauchsmaterial|papierhandt|seife|toilettenpapier|hygieneartikel|spender)/i],
  ["sonderreinigung", /(sonderreinigung|bedarfsreinigung|sonderleistung|teppich|polster|treppenhaus.*sonder)/i],
  ["unterhaltsreinigung", /(unterhaltsreinigung|unterhalt|laufende reinigung|büroreinigung|sanitärreinigung)/i],
];

export function detectCategory(text: string): LvItemCategory {
  for (const [category, re] of CATEGORY_RULES) if (re.test(text)) return category;
  return "sonstiges";
}

const FREQ_RULES: [RegExp, (m: RegExpExecArray) => number][] = [
  [/(\d+)\s*(?:x|mal)\s*(?:pro\s*|je\s*)?woche|(\d+)\s*x\s*wöchentlich/i, (m) => Number(m[1] ?? m[2]) * 52],
  [/(\d+)\s*(?:x|mal)\s*(?:pro\s*|je\s*)?monat|(\d+)\s*x\s*monatlich/i, (m) => Number(m[1] ?? m[2]) * 12],
  [/(\d+)\s*(?:x|mal)\s*(?:pro\s*|je\s*)?jahr|(\d+)\s*x\s*jährlich/i, (m) => Number(m[1] ?? m[2])],
  [/(\d+)\s*(?:x|mal)\s*(?:pro\s*|je\s*)?tag|(\d+)\s*x\s*täglich/i, (m) => Number(m[1] ?? m[2]) * 250],
  [/arbeitstäglich|werktäglich|täglich/i, () => 250],
  [/wöchentlich/i, () => 52],
  [/14[-\s]?tägig|zweiwöchentlich|alle\s*2\s*wochen/i, () => 26],
  [/monatlich/i, () => 12],
  [/vierteljährlich|quartalsweise/i, () => 4],
  [/halbjährlich/i, () => 2],
  [/jährlich/i, () => 1],
];

/** Liest ein Reinigungsintervall aus Freitext und rechnet es auf Einsätze pro Jahr um. */
export function parseFrequency(text: string): LvFrequency {
  if (!text) return { label: "", perYear: null };
  for (const [re, calc] of FREQ_RULES) {
    const m = re.exec(text);
    if (m) {
      const perYear = calc(m);
      return {
        label: m[0].trim(),
        perYear: Number.isFinite(perYear) && perYear > 0 ? perYear : null,
      };
    }
  }
  return { label: "", perYear: null };
}

const AREA_RE = /([\d.]+(?:,\d+)?)\s*(?:m²|m2|qm)\b/i;
const HOURS_RE = /([\d.]+(?:,\d+)?)\s*(?:std|stunden|h)\b/i;

export function detectArea(text: string, quantity: number | null, unit: string): number | null {
  if (/^(m²|m2|qm)$/i.test(unit.trim()) && quantity !== null) return quantity;
  const m = AREA_RE.exec(text);
  return m ? toNumberOrNull(m[1] ?? "") : null;
}

export function detectHours(text: string, quantity: number | null, unit: string): number | null {
  if (/^(std|std\.|stunde|stunden|h)$/i.test(unit.trim()) && quantity !== null) return quantity;
  const m = HOURS_RE.exec(text);
  return m ? toNumberOrNull(m[1] ?? "") : null;
}

export type RawItem = {
  item_number?: unknown;
  description?: unknown;
  category?: unknown;
  quantity?: unknown;
  unit?: unknown;
  frequency?: unknown;
  area_m2?: unknown;
  working_hours?: unknown;
  unit_price?: unknown;
  total_price?: unknown;
  vat_rate?: unknown;
  source_page?: unknown;
  confidence_score?: unknown;
};

/** Führt eine Rohposition (KI, Tabelle oder Regel) in das normalisierte Schema über. */
export function normalizeItem(raw: RawItem, method: string): LvNormalizedItem {
  const description = String(raw.description ?? "").trim();
  const unit = String(raw.unit ?? "").trim();
  const quantity = toNumberOrNull(raw.quantity);
  const unitPrice = toNumberOrNull(raw.unit_price);
  const totalRaw = toNumberOrNull(raw.total_price);
  const freqText = String(raw.frequency ?? "").trim();
  const haystack = `${description} ${freqText} ${unit}`;

  const frequency = freqText
    ? { ...parseFrequency(freqText), label: freqText }
    : parseFrequency(description);

  const area = toNumberOrNull(raw.area_m2) ?? detectArea(description, quantity, unit);
  const hours = toNumberOrNull(raw.working_hours) ?? detectHours(description, quantity, unit);
  const total =
    totalRaw ?? (quantity !== null && unitPrice !== null ? Math.round(quantity * unitPrice * 100) / 100 : null);

  const categoryRaw = String(raw.category ?? "").trim().toLowerCase();
  const category: LvItemCategory =
    categoryRaw && categoryRaw in CATEGORY_KEYS
      ? (categoryRaw as LvItemCategory)
      : detectCategory(haystack);

  const explicit = toNumberOrNull(raw.confidence_score);
  const confidence =
    explicit !== null && explicit >= 0 && explicit <= 1 ? explicit : scoreConfidence(description, quantity, unit, unitPrice);

  const page = toNumberOrNull(raw.source_page);

  return {
    id: nextId(),
    analysis_id: "",
    item_number: String(raw.item_number ?? "").trim(),
    description,
    category,
    quantity,
    unit,
    frequency,
    area_m2: area,
    working_hours: hours,
    unit_price: unitPrice,
    total_price: total,
    vat_rate: toNumberOrNull(raw.vat_rate),
    calculation: emptyCalculation(),
    source_page: page !== null && page > 0 ? Math.round(page) : null,
    confidence_score: Math.round(confidence * 100) / 100,
    source_method: method,
    approved: false,
  };
}

const CATEGORY_KEYS: Record<string, true> = {
  unterhaltsreinigung: true,
  glasreinigung: true,
  grundreinigung: true,
  sonderreinigung: true,
  winterdienst: true,
  verbrauchsmaterial: true,
  sonstiges: true,
};

function scoreConfidence(
  description: string,
  quantity: number | null,
  unit: string,
  unitPrice: number | null,
): number {
  let score = 0.35;
  if (description.length >= 8) score += 0.2;
  if (quantity !== null && quantity > 0) score += 0.2;
  if (unit) score += 0.15;
  if (unitPrice !== null && unitPrice > 0) score += 0.1;
  return Math.min(1, score);
}

/** Entfernt Dubletten; die Position mit der höheren Datendichte gewinnt. */
export function dedupeItems(items: LvNormalizedItem[]): LvNormalizedItem[] {
  const map = new Map<string, LvNormalizedItem>();
  for (const item of items) {
    if (!item.description && !item.item_number) continue;
    const key = `${item.item_number}|${item.description.toLowerCase().replace(/\s+/g, " ").slice(0, 80)}`;
    const existing = map.get(key);
    if (!existing || density(item) > density(existing)) map.set(key, item);
  }
  return [...map.values()];
}

/** Verlässlichkeit des Erkennungswegs: strukturierte Tabellen schlagen Freitextregeln. */
const METHOD_WEIGHT: Record<string, number> = { manuell: 4, tabelle: 3, ki: 2, ocr: 1.5, regel: 0 };

function density(item: LvNormalizedItem): number {
  return (
    (METHOD_WEIGHT[item.source_method] ?? 0) +
    (item.quantity !== null ? 1 : 0) +
    (item.unit ? 1 : 0) +
    (item.unit_price !== null && item.unit_price > 0 ? 1 : 0) +
    (item.total_price !== null && item.total_price > 0 ? 1 : 0) +
    (item.frequency.perYear !== null ? 1 : 0) +
    (item.area_m2 !== null ? 1 : 0) +
    item.confidence_score
  );
}

const TOTAL_LINE_RE =
  /^(.*?(gesamt|summe|angebotssumme|endsumme|nettosumme|bruttosumme|jahrespreis|monatspreis|zwischensumme|mehrwertsteuer|umsatzsteuer|mwst)[^|]*?)[\s|:]+.*?((?:€|EUR)?\s*-?[\d.]+,\d{2})\s*(?:€|EUR)?\s*$/i;

/** Liest reine Summenzeilen (Preisblatt) inklusive Quellseite. */
export function extractTotals(text: string): LvTotalLine[] {
  const out: LvTotalLine[] = [];
  let page: number | null = null;
  for (const line of text.split(/\r?\n/)) {
    const pageMatch = /^---\s*Seite\s+(\d+)\s*---$/i.exec(line.trim());
    if (pageMatch) {
      page = Number(pageMatch[1]);
      continue;
    }
    const m = TOTAL_LINE_RE.exec(line.trim());
    if (!m) continue;
    const amount = toNumberOrNull((m[3] ?? "").replace(/[€\sEUR]/gi, ""));
    if (amount === null) continue;
    const label = (m[1] ?? "").replace(/[|:]+$/, "").replace(/\s+/g, " ").trim();
    if (!label) continue;
    out.push({ label, amount, source_page: page });
  }
  return out.slice(0, 40);
}

/** Ordnet Textzeilen ihrer PDF-Seite zu, damit Positionen eine Quellseite behalten. */
export function pageIndexForText(text: string, needle: string): number | null {
  if (!needle.trim()) return null;
  let page: number | null = null;
  for (const line of text.split(/\r?\n/)) {
    const pageMatch = /^---\s*Seite\s+(\d+)\s*---$/i.exec(line.trim());
    if (pageMatch) {
      page = Number(pageMatch[1]);
      continue;
    }
    if (line.includes(needle.slice(0, Math.min(30, needle.length)))) return page;
  }
  return null;
}
