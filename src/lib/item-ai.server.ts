import { normalizeCalculationLanguage, readDescribedDuration } from "./calculation-language";
import { findRate, DEFAULT_PERFORMANCE_RATES } from "./leistungswerte";
import { savedSellingBasis, type CompanySellingPricing } from "./company-selling-pricing";
import { generateGeminiJson } from "./gemini-json.server";
import { analysisAiOptions } from "./analysis-ai";
import {
  STAIR_RATE_PER_FLOOR,
  visitsPerMonth,
  recurrenceUnitLabel,
  type RecurrenceUnit,
} from "./constants";

export type GeneratedItem = {
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
};

export type GeneratedCalculation = {
  cleaning_type: string;
  mode: "area" | "hours";
  area_sqm: number;
  hours: number;
  hourly_rate: number;
  price_per_sqm: number;
  frequency: number;
  frequency_unit: RecurrenceUnit;
  floors: number;
  stairs: boolean;
  travel: number;
  note: string;
  items: GeneratedItem[];
  review_questions: string[];
  review_notes: string[];
  billing_period: "once" | "month";
  price_source: "stated" | "estimate" | "job" | "company";
  floor_rate?: number;
  pricing_basis: "area" | "hours" | "floor";
};

const SYSTEM = `Du bist Kalkulations-Assistent einer deutschen Gebäudereinigungsfirma im Saarland.
Erstelle aus der Auftragsbeschreibung eine fachlich plausible, deterministische Kalkulation.
Regeln:
- Alle Texte auf Deutsch, knapp und professionell.
- Stundensätze netto: Unterhalts-/Büro-/Praxis-/Treppenhausreinigung 34–37 EUR/Std.; Grund- und Bauendreinigung 42–45 EUR/Std.; Glas/Fenster 38 EUR/Std.
- Keine erfundenen Kundendaten, Flächen oder Mengen. Unbekannte Zahlen = 0.
- Explizit genannte Fläche, Häufigkeit und Reinigungsart müssen exakt übernommen werden.
- Realistische Leistungswerte als Orientierung: Büro 200–250 m²/Std., Flur 300 m²/Std., Sanitär/WC 60 m²/Std., Teeküche 100 m²/Std., Treppenhaus 120 m²/Std.
- Wiederkehrende Leistungen auf Monatsbasis: wöchentlich = 52/12 Einsätze/Monat, 14-täglich = 26/12, monatlich = 1. „Täglich“ ohne genannte Arbeitstage ist unklar; keine 5 oder 7 Tage unterstellen.
- Praxisreinigung als eigene Reinigungsart behandeln. Desinfektion nur aufnehmen, wenn ausdrücklich vereinbart; Fensterreinigung nicht automatisch ergänzen.
- Keine Doppelerfassung von Sanitär, Küche oder Flur, wenn bereits in einer Gesamtfläche enthalten.
- Treppenhaus bei Erwähnung als eigene Position; mindestens 12,50 EUR je Etage.
- Keine Umsatzsteuer und keine Summenzeile in items.
- Preise und Mengen auf 2 Nachkommastellen runden.`;

const ITEM_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    description: { type: "string" },
    quantity: { type: "number" },
    unit: { type: "string" },
    unit_price: { type: "number" },
  },
  required: ["description", "quantity", "unit", "unit_price"],
};

const ITEMS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: { items: { type: "array", items: ITEM_SCHEMA } },
  required: ["items"],
};

function canonicalPrompt(prompt: string): string {
  return prompt.trim().replace(/\s+/g, " ");
}

function num(v: unknown): number {
  const raw = String(v ?? "").replace(/\s/g, "");
  const german = /^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(raw)
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw.replace(",", ".");
  const n = typeof v === "number" ? v : Number(german);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
}

function round2(v: number) {
  return Math.round(v * 100) / 100;
}

function normalizeItems(value: unknown): GeneratedItem[] {
  const list = Array.isArray(value) ? value : [];
  return list
    .slice(0, 12)
    .map((entry) => {
      const it = (entry ?? {}) as Record<string, unknown>;
      return {
        description: String(it["description"] ?? "")
          .trim()
          .slice(0, 200),
        quantity: num(it["quantity"]) || 1,
        unit:
          String(it["unit"] ?? "Std.")
            .trim()
            .slice(0, 20) || "Std.",
        unit_price: num(it["unit_price"]),
      };
    })
    .filter((item) => item.description);
}

function normalizedText(prompt: string) {
  return normalizeCalculationLanguage(prompt);
}

function countedObjectArea(text: string): number {
  const perRoom = text.match(/\b(\d+)\s*(?:hallen?|büros?|bueros?|räume|raeume|zimmer|etagen?)\s*(?:mit\s+)?(?:jeweils|je)\s*(?:ca\.?\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)\s*(?:m2|qm|quadratmeter)\b/i);
  return perRoom ? Number(perRoom[1]) * num(perRoom[2]) : 0;
}

function explicitArea(prompt: string): number {
  const text = normalizedText(prompt);
  const total = text.match(/(?:insgesamt|gesamtfläche|gesamtflaeche)\s*(?:von|:)?\s*(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)\s*(?:m2|qm|quadratmeter)\b/i);
  if (total) return num(total[1]);
  const counted = countedObjectArea(text);
  if (counted > 0) return counted;
  const match = text.match(
    /(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)\s*(?:m2|qm|quadratmeter)\b/i,
  );
  return match ? num(match[1]) : 0;
}

/** Only split an explicitly additional corridor with one unambiguous area.
 * Total/included areas must keep their existing calculation without a surcharge.
 */
function additionalCorridorArea(prompt: string): number {
  const text = normalizedText(prompt);
  if (
    !/\b(?:mit|zusätzlich|zusaetzlich|zusätzlicher|zusaetzlicher|plus|separat)\b/.test(text) ||
    /\b(?:gesamt\w*|insgesamt|inkl\w*|einschließlich|einschliesslich|enthalten)\b/.test(text)
  )
    return 0;
  const areaPattern = /(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)\s*(?:m2|qm|quadratmeter)\b/g;
  const areas = [...text.matchAll(areaPattern)];
  if (areas.length !== 1) return 0;
  const area = areas[0]!;
  const before = text.slice(0, area.index).trim();
  const after = text.slice(area.index + area[0].length).trim();
  return /\bflur(?:fläche|flaeche|reinigung)?\s*(?:(?:mit|von|ca\.?)\s*)?$/.test(before) ||
    /^(?:zusätzliche[rnms]?\s+|zusaetzliche[rnms]?\s+)?flur(?:fläche|flaeche|reinigung)?\b/.test(
      after,
    )
    ? num(area[1])
    : 0;
}

/** Explicit room areas are priced by room type, rather than silently discarded. */
function roomAreaBreakdown(prompt: string) {
  const text = normalizedText(prompt);
  const room = "(?:teeküche|teekueche|küche|kueche|wc|toiletten?|sanitär(?:raum)?|sanitaer(?:raum)?|badezimmer|bad|flur)";
  const amount = "(\\d{1,3}(?:\\.\\d{3})+(?:,\\d+)?|\\d+(?:[.,]\\d+)?)\\s*(?:m2|qm|quadratmeter)\\b";
  const pattern = new RegExp(`(${room})\\s*(?:(?:mit|von|ca\\.?)\\s*)?[:=]?\\s*${amount}|${amount}\\s*(${room})\\b`, "gi");
  const rooms = [...text.matchAll(pattern)].map((m) => ({
    name: m[1] || m[4]!, area: num(m[2] || m[3]), index: m.index!,
  }));
  const firstArea = text.search(/\d[\d.,]*\s*(?:m2|qm|quadratmeter)\b/);
  // The primary office area must precede additional room areas.
  if (!rooms.length || rooms.some((r) => r.index <= firstArea)) return null;
  const included = /\b(?:inkl\w*|einschließlich|einschliesslich|enthalten|davon|gesamt\w*|insgesamt)\b/.test(text);
  return { rooms, included };
}

function explicitFrequency(prompt: string): { value: number; unit: RecurrenceUnit } | null {
  const text = normalizedText(prompt).replace(/inderwoche/g, "in der woche");
  const connector = "(?:pro\\s+|in\\s+(?:der|dem)\\s+|inder\\s+|im\\s+|die\\s+|je\\s+|/\\s*)?";

  const fortnight = text.match(/\b(?:(\d+)\s*(?:x|mal)\s+)?alle\s+(?:(?:14|vierzehn)\s*tage|2\s*wochen)\b/i);
  if (fortnight) return { value: fortnight[1] ? Number(fortnight[1]) : 1, unit: "fortnight" };
  if (/\b(?:jede\s+zweite\s+woche|14[- ]?tägig|14[- ]?taegig)\b/i.test(text)) return { value: 1, unit: "fortnight" };
  if (/\b(?:jeden\s+zweiten\s+monat)\b/i.test(text)) return { value: 0.5, unit: "month" };
  const months = text.match(/\balle\s+(\d+)\s*monate\b/i);
  if (months && Number(months[1]) > 0) return { value: 1 / Number(months[1]), unit: "month" };
  const days = text.match(
    /\b([1-7])\s*(?:tage?n?|einsätze?)\s*(?:pro|in der|die|je|\/)\s*woche\b/i,
  );
  if (days) return { value: Number(days[1]), unit: "week" };
  if (
    /\b(?:14[- ]?tägig|14[- ]?taegig|zweiwöchentlich|zweiwoechentlich|alle\s+(?:2|zwei)\s+wochen)\b/i.test(
      text,
    )
  ) {
    return { value: 1, unit: "fortnight" };
  }
  if (/\b(?:mo\s*[-–]\s*fr|montag\s+bis\s+freitag|werktäglich|werktags)\b/i.test(text)) {
    return { value: 5, unit: "week" };
  }
  if (/\b(?:mo\s*[-–]\s*sa|montag\s+bis\s+samstag)\b/i.test(text)) {
    return { value: 6, unit: "week" };
  }
  if (
    /\b(?:mo\s*[-–]\s*so|montag\s+bis\s+sonntag|sieben\s+tage\s+(?:pro|die)\s+woche)\b/i.test(text)
  ) {
    return { value: 7, unit: "week" };
  }

  // Deutsche Zahlwörter ("einmal", "zweimal" …) statt Ziffern – z. B. aus
  // Spracheingabe oder Autokorrektur – müssen exakt wie Ziffern zählen.
  const wordNumbers: Record<string, number> = {
    einmal: 1,
    zweimal: 2,
    dreimal: 3,
    viermal: 4,
    fünfmal: 5,
    fuenfmal: 5,
    sechsmal: 6,
    siebenmal: 7,
  };
  for (const [word, value] of Object.entries(wordNumbers)) {
    if (
      new RegExp(`\\b${word}\\b\\s*${connector}(?:woche|wöchentlich|woechentlich)\\b`, "i").test(
        text,
      )
    )
      return { value, unit: "week" };
  }
  for (const [word, value] of Object.entries(wordNumbers)) {
    if (new RegExp(`\\b${word}\\b\\s*${connector}(?:monat|monatlich)\\b`, "i").test(text))
      return { value, unit: "month" };
  }

  let match = text.match(
    new RegExp(
      `(\\d+(?:[.,]\\d+)?)\\s*[-–—]?\\s*(?:x|mal|mall)\\s*${connector}(?:woche|wöchentlich|woechentlich)\\b`,
      "i",
    ),
  );
  if (match) return { value: num(match[1]), unit: "week" };

  match = text.match(
    new RegExp(
      `(\\d+(?:[.,]\\d+)?)\\s*[-–—]?\\s*(?:x|mal|mall)\\s*${connector}(?:monat|monatlich)\\b`,
      "i",
    ),
  );
  if (match) return { value: num(match[1]), unit: "month" };

  // Umgangssprachlich wird die Anzahl häufig ohne „mal“ geschrieben.
  match = text.match(/\b(\d+(?:[.,]\d+)?)\s*(?:pro|je|in der|\/)\s*woche\b/i);
  if (match) return { value: num(match[1]), unit: "week" };
  match = text.match(/\b(\d+(?:[.,]\d+)?)\s*(?:pro|je|im|\/)\s*monat\b/i);
  if (match) return { value: num(match[1]), unit: "month" };

  if (/\b(?:wöchentlich|woechentlich|jede\s+woche)\b/i.test(text))
    return { value: 1, unit: "week" };
  if (/\b(?:monatlich|jeden\s+monat)\b/i.test(text)) return { value: 1, unit: "month" };
  return null;
}

function explicitCleaningType(prompt: string): string | null {
  const text = normalizedText(prompt);
  const matches: { type: string; index: number }[] = [];
  const patterns: [string, RegExp][] = [
    ["praxis", /\b(?:praxis|praxen|praxisreinigung|arztpraxis|zahnarztpraxis)\b/i],
    ["buero", /\b(?:büro|buero|büroreinigung|bueroreinigung)\b/i],
    ["wohn", /\b(?:wohnung|wohnungsreinigung|haushaltsreinigung|privathaushalt)\b/i],
    ["grund", /\b(?:grund[- ]?reinigung|tiefenreinigung)\b/i],
    ["bau", /\b(?:bauend[- ]?reinigung|bau[- ]?reinigung)\b/i],
    ["unterhalt", /\b(?:unterhaltsreinigung|unterhalt|hallen?[- ]?reinigung)\b/i],
    ["treppenhaus", /\b(?:treppenhausreinigung|treppenhaus|treppe)\b/i],
    ["glas", /\b(?:glas[- ]?reinigung|fenster[- ]?reinigung|fenster)\b/i],
  ];
  for (const [type, pattern] of patterns) {
    const index = text.search(pattern);
    if (index >= 0) matches.push({ type, index });
  }
  return matches.sort((a, b) => a.index - b.index)[0]?.type ?? (/\bhallen?\b/i.test(text) ? "unterhalt" : null);
}

function statedPrice(prompt: string, unit: "m2" | "hour"): number {
  const text = normalizedText(prompt);
  const suffix = unit === "m2" ? "(?:m2|qm|quadratmeter)" : "(?:std\\.?|stunden?)";
  const match = text.match(
    new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(?:€|eur|euro)\\s*(?:pro|je|/)\\s*${suffix}\\b`, "i"),
  );
  if (match) return num(match[1]);
  // Common dictated wording: "38€ kostet stunden" / "38 Euro die Stunde".
  if (unit === "hour") {
    const spoken = text.match(/(\d+(?:[.,]\d+)?)\s*(?:€|eur|euro)\s*(?:kostet?\s*(?:die\s*)?|die\s+|je\s+)(?:stunden?|std\.?)(?![a-z])/i);
    if (spoken) return num(spoken[1]);
  }
  return 0;
}

function explicitFloors(prompt: string): number {
  const match = normalizedText(prompt).match(/\b(\d{1,2})\s*(?:etagen?|stockwerke?|geschosse?)\b/i);
  return match ? num(match[1]) : 0;
}

function defaultsFor(type: string) {
  switch (type) {
    case "praxis":
      return { pricePerSqm: 0.4, hourlyRate: 35, performance: 0, label: "Praxisreinigung" };
    case "buero":
      return { pricePerSqm: 0.4, hourlyRate: 35, performance: 225, label: "Büroreinigung" };
    case "wohn":
      return { pricePerSqm: 0.4, hourlyRate: 35, performance: 0, label: "Wohnungsreinigung" };
    case "grund":
      return { pricePerSqm: 1.9, hourlyRate: 43, performance: 80, label: "Grundreinigung" };
    case "bau":
      return { pricePerSqm: 2.6, hourlyRate: 44, performance: 70, label: "Bauendreinigung" };
    case "glas":
      return {
        pricePerSqm: 1.4,
        hourlyRate: 38,
        performance: 100,
        label: "Glas- und Fensterreinigung",
      };
    case "treppenhaus":
      return { pricePerSqm: 0.6, hourlyRate: 35, performance: 120, label: "Treppenhausreinigung" };
    default:
      return { pricePerSqm: 0.35, hourlyRate: 35, performance: 225, label: "Unterhaltsreinigung" };
  }
}

function deterministicBaseItem(args: {
  type: string;
  area: number;
  hours: number;
  floors: number;
  frequency: number;
  frequencyUnit: RecurrenceUnit;
  billingPeriod: "once" | "month";
  pricePerSqm: number;
  hourlyRate: number;
  floorRate?: number;
}): GeneratedItem | null {
  if (
    !(args.area > 0 || args.hours > 0 || (args.type === "treppenhaus" && args.floors > 0)) ||
    !(args.frequency > 0)
  )
    return null;
  const monthlyVisits = visitsPerMonth(args.frequency, args.frequencyUnit);
  const exactPerVisit =
    args.area > 0
      ? args.area * args.pricePerSqm
      : args.hours > 0
        ? args.hours * args.hourlyRate
        : args.floors * (args.floorRate ?? STAIR_RATE_PER_FLOOR);
  const perVisit = round2(exactPerVisit);
  const turnus =
    args.billingPeriod === "once"
      ? "einmalig"
      : args.frequencyUnit === "week"
        ? `${args.frequency}× wöchentlich`
        : args.frequencyUnit === "month"
          ? `${args.frequency}× monatlich`
          : `${args.frequency}× ${recurrenceUnitLabel(args.frequencyUnit)}`;
  return {
    description: `${defaultsFor(args.type).label} (${args.area > 0 ? `${String(args.area).replace(".", ",")} m²` : args.hours > 0 ? `${String(args.hours).replace(".", ",")} Std. je Einsatz` : `${args.floors} Etagen`}, ${turnus})`,
    quantity: 1,
    unit: args.billingPeriod === "once" ? "Pauschal" : "Monat",
    // Der monatliche Betrag wird einmal gerundet. 21,67 × 80 € würde bei
    // fünf Einsätzen/Woche andernfalls 27 Cent zu hoch ausfallen.
    unit_price: args.billingPeriod === "once" ? perVisit : round2(exactPerVisit * monthlyVisits),
  };
}

export async function generateItems(prompt: string): Promise<GeneratedItem[]> {
  const parsed = await generateGeminiJson({
    ...analysisAiOptions(process.env["GEMINI_MODEL_CALC"]),
    system: `${SYSTEM}\nAntworte ausschließlich mit JSON gemäß Schema.`,
    prompt: `Erstelle 3 bis 10 sinnvolle Angebotspositionen für: ${canonicalPrompt(prompt)}`,
    schema: ITEMS_SCHEMA,
  });
  return normalizeItems(parsed["items"]);
}

export async function generateCalculation(
  prompt: string,
  recurrence?: { value: number; unit: RecurrenceUnit },
  companyPricing?: CompanySellingPricing,
): Promise<GeneratedCalculation> {
  const statedType = explicitCleaningType(prompt);
  const cleaningType = statedType ?? "unterhalt";
  const defaults = defaultsFor(cleaningType);

  const recurring = ["praxis", "buero", "unterhalt", "treppenhaus"].includes(cleaningType);
  const statedArea = explicitArea(prompt);
  // In an area-cleaning description, colloquial "210 m" denotes floor area.
  // Keep glass/stair or explicitly linear dimensions ambiguous.
  const unconfirmedArea = statedArea > 0 ? 0 : num(normalizedText(prompt).match(/(\d+(?:[.,]\d+)?)\s*m\b/i)?.[1]);
  const inferredArea = statedType && !["glas", "treppenhaus"].includes(statedType) &&
    !/\b(?:laufmeter|lfm|länge|laenge|lang|breit|breite|hoch|höhe|hoehe)\b/i.test(normalizedText(prompt))
    ? unconfirmedArea : 0;
  const floors = explicitFloors(prompt);
  const corridorArea =
    cleaningType === "treppenhaus" && floors > 0 ? additionalCorridorArea(prompt) : 0;
  // The corridor's m² are not the staircase's area. Keep the staircase on
  // its floor basis and add the corridor as its own proposal below.
  const primaryArea = corridorArea > 0 ? 0 : statedArea || inferredArea;
  const breakdown = ["buero", "praxis", "unterhalt", "wohn"].includes(cleaningType) ? roomAreaBreakdown(prompt) : null;
  const roomArea = breakdown?.rooms.reduce((sum, r) => sum + r.area, 0) ?? 0;
  const area = primaryArea + (breakdown && !breakdown.included ? roomArea : 0);

  const statedFrequency = recurrence ?? explicitFrequency(prompt);
  const annualFrequency =
    !statedFrequency &&
    /\b(?:\d+\s*[-–—]?\s*(?:x|mal)\s*(?:(?:pro|im|je)\s*|\/\s*)?jahr|(?:einmal|zweimal|dreimal)\s*(?:pro|im|je)\s*jahr|jährlich|jaehrlich|halbjährlich|halbjaehrlich)\b/i.test(
      normalizedText(prompt),
    );
  const ambiguousDaily =
    /\b(?:täglich|taeglich|jeden\s+tag)\b/i.test(normalizedText(prompt)) && !statedFrequency;
  const explicitOnce =
    recurrence?.unit === "once" ||
    (/\b(?:einmalig|einmalige|einmaligen|einmaliger|einmaliges|einmal)\b/i.test(
      normalizedText(prompt),
    ) &&
      !statedFrequency);
  const billingPeriod = explicitOnce ? "once" : recurring || statedFrequency ? "month" : "once";
  const frequency = explicitOnce
    ? 1
    : ambiguousDaily || annualFrequency
      ? 0
      : (statedFrequency?.value ?? (recurring && !explicitOnce ? 0 : 1));
  const frequencyUnit = statedFrequency?.unit ?? "month";

  const statedSqmPrice = statedPrice(prompt, "m2");
  const statedHourlyRate = statedPrice(prompt, "hour");
  const saved = companyPricing ? savedSellingBasis(companyPricing, cleaningType, defaults.label) : null;
  const hourlyRate = statedHourlyRate || (saved ? saved.hourlyRate : defaults.hourlyRate);
  let pricePerSqm = statedSqmPrice || (saved ? (saved.sqmPerHour > 0 ? hourlyRate / saved.sqmPerHour : 0) : defaults.pricePerSqm);
  const floorRate = saved ? hourlyRate * saved.minutesPerFloor / 60 : STAIR_RATE_PER_FLOOR;
  // Keep visit durations distinct from explicitly stated weekly/monthly totals.
  // Period totals are distributed over the known recurrence, never multiplied again.
  const duration = readDescribedDuration(prompt);
  const periodVisits = duration.period === "month" ? visitsPerMonth(frequency, frequencyUnit) : duration.period === "week" ? visitsPerMonth(frequency, frequencyUnit) / (52 / 12) : 1;
  const periodNeedsRecurrence = duration.period !== "visit" && (billingPeriod === "once" || frequency <= 0);
  const hours = duration.ambiguous || periodNeedsRecurrence ? 0 : duration.hours / (periodVisits || 1);
  if (area > 0 && hours > 0 && !statedSqmPrice) pricePerSqm = hours * hourlyRate / area;
  let pricingBasis: "area" | "hours" | "floor" = area > 0 ? "area" : hours > 0 ? "hours" : "floor";
  let calculatedHours = hours || (saved ? (area > 0 && saved.sqmPerHour > 0 ? area / saved.sqmPerHour : floors > 0 && saved.minutesPerFloor > 0 ? floors * saved.minutesPerFloor / 60 : 0) : 0);

  if (hours > 0 && !statedSqmPrice) pricingBasis = "hours";
  const roomNotes: string[] = [];
  const missingRoomRates: string[] = [];
  if (breakdown && primaryArea > 0 && hours <= 0) {
    const baseArea = breakdown.included ? primaryArea - roomArea : primaryArea;
    const basePerformance = saved ? saved.sqmPerHour : defaults.performance;
    const rates = companyPricing?.rates ?? [];
    const fallbackRates = DEFAULT_PERFORMANCE_RATES.map((r) => ({ ...r, id: r.label, active: true }));
    if (baseArea >= 0 && basePerformance > 0) {
      calculatedHours = baseArea / basePerformance;
      roomNotes.push(`Hauptfläche: ${baseArea} m² ÷ ${basePerformance} m²/Std.`);
      for (const room of breakdown.rooms) {
        const usage_type = /küche|kueche/.test(room.name) ? "Küche" : /flur/.test(room.name) ? "Flur" : "WC";
        const rate = findRate(rates, { usage_type }) ?? (companyPricing ? null : findRate(fallbackRates, { usage_type }));
        if (!rate || rate.sqm_per_hour <= 0) { missingRoomRates.push(room.name); continue; }
        calculatedHours += room.area / rate.sqm_per_hour;
        roomNotes.push(`${room.name}: ${room.area} m² ÷ ${rate.sqm_per_hour} m²/Std.${rates.includes(rate) ? "" : " (Richtwert)"}`);
      }
      if (!statedSqmPrice) {
        pricePerSqm = calculatedHours * hourlyRate / area;
        pricingBasis = "hours";
      }
    }
  }
  const reviewQuestions: string[] = [];
  if (missingRoomRates.length) reviewQuestions.push(`Bitte passende Leistungswerte (m²/Std.) für ${missingRoomRates.join(" und ")} in den Firmendaten speichern.`);
  if (/\b(?:insgesamt|gesamtfläche|gesamtflaeche)\b/.test(normalizedText(prompt)) && countedObjectArea(normalizedText(prompt)) > statedArea) reviewQuestions.push("Die Gesamtfläche ist kleiner als die Summe der genannten Einzelflächen. Bitte Gesamtfläche oder Fläche je Objekt prüfen.");
  if (duration.ambiguous) reviewQuestions.push("Bitte die gesamte Reinigungsdauer je Einsatz eindeutig angeben, z. B. 1 Stunde 30 Minuten.");
  if (periodNeedsRecurrence && frequency > 0) reviewQuestions.push("Die Zeit ist als Wochen-/Monatssumme angegeben. Bitte den wiederkehrenden Turnus ergänzen.");
  if (["buero", "praxis", "unterhalt", "wohn"].includes(cleaningType) && hours <= 0 && !statedSqmPrice) {
    const text = normalizedText(prompt);
    const missingRooms = [
      { pattern: /\b(?:teeküche|teekueche|küche|kueche)\b/, label: "Küche/Teeküche" },
      { pattern: /\b(?:wc|toiletten?|sanitär|sanitaer|badezimmer|bad)\b/, label: "WC/Sanitär" },
    ].filter(({ pattern }) => pattern.test(text) && !breakdown?.rooms.some((room) => pattern.test(room.name)));
    if (missingRooms.length)
      reviewQuestions.push(`Bitte die Flächen für ${missingRooms.map((room) => room.label).join(" und ")} in m² ergänzen und angeben, ob sie zusätzlich oder in der Gesamtfläche enthalten sind. Sie werden nicht stillschweigend mit dem Büro-Leistungswert berechnet.`);
  }
  if (breakdown && !recurrence) {
    const frequencies = prompt.split(/[,;!\n]/).map(explicitFrequency).filter((entry) => entry !== null);
    if (frequencies.some((entry) => entry.value !== frequency || entry.unit !== frequencyUnit))
      reviewQuestions.push("Bitte die unterschiedlichen Reinigungsturnusse von Hauptfläche und Zusatzräumen getrennt angeben.");
  }
  if (breakdown?.included && roomArea > primaryArea)
    reviewQuestions.push("Die enthaltenen Raumflächen überschreiten die Gesamtfläche. Bitte Flächen prüfen.");
  if (saved && !statedSqmPrice && !statedHourlyRate && saved.hourlyRate <= 0)
    reviewQuestions.push("Welcher Netto-Verkaufspreis pro Stunde gilt für diesen Auftrag? Bitte oben eingeben oder im Auftragstext nennen.");
  if (saved && (area > 0 || corridorArea > 0) && !statedSqmPrice && hours <= 0 && saved.sqmPerHour <= 0)
    reviewQuestions.push("Bitte einen passenden Leistungswert (m²/Std.) für diese Reinigungsart speichern.");
  if (saved && pricingBasis === "floor" && floors > 0 && saved.minutesPerFloor <= 0)
    reviewQuestions.push("Bitte Minuten je Etage in den gespeicherten Treppenhaus-Leistungswerten ergänzen.");
  if (unconfirmedArea > 0 && inferredArea <= 0) {
    reviewQuestions.push(`Sind mit ${unconfirmedArea} m eine Fläche von ${unconfirmedArea} m² gemeint? Bitte die Fläche mit m² oder qm angeben.`);
  }
  if (corridorArea > 0 && hours > 0) {
    reviewQuestions.push(
      "Beziehen sich die Stunden auf das Treppenhaus, den Flur oder beide Leistungen?",
    );
  }
  if (corridorArea > 0 && !recurrence) {
    const frequencies = prompt
      .split(/[,;!\n]|\bflur(?:reinigung)?\b/i)
      .map(explicitFrequency)
      .filter((v) => v !== null);
    if (frequencies.some((v) => v.value !== frequency || v.unit !== frequencyUnit)) {
      reviewQuestions.push(
        "Bitte Treppenhaus und Flur mit ihrem jeweiligen Turnus getrennt kalkulieren.",
      );
    }
  }
  if (ambiguousDaily)
    reviewQuestions.push(
      "An welchen Tagen wird gereinigt: Montag bis Freitag, sieben Tage oder ein anderer Turnus?",
    );
  else if (annualFrequency)
    reviewQuestions.push(
      "Jährlichen Turnus durch 'einmalig' je Einsatz ersetzen oder für eine Monatspauschale die Einsätze pro Monat angeben.",
    );
  else if (frequency <= 0 && recurring) {
    reviewQuestions.push("Wie viele Einsätze pro Woche oder Monat sind vorgesehen?");
  }
  if (frequency > (frequencyUnit === "week" ? 7 : 31)) {
    reviewQuestions.push(
      "Bitte den Turnus prüfen: Die Anzahl der Einsätze ist für den Zeitraum ungewöhnlich hoch.",
    );
  }
  if (!statedType) {
    reviewQuestions.push("Welche Reinigungsart soll kalkuliert werden?");
  }
  if (area <= 0 && unconfirmedArea <= 0 && duration.hours <= 0 && !(cleaningType === "treppenhaus" && floors > 0)) {
    reviewQuestions.push(
      "Wie groß ist die Fläche in m² oder wie viele Stunden dauert ein Einsatz?",
    );
  }
  const reviewNotes: string[] = [...roomNotes];
  if (duration.period !== "visit" && !periodNeedsRecurrence && duration.hours > 0) reviewNotes.push(`Die angegebenen ${duration.hours} Stunden pro ${duration.period === "month" ? "Monat" : "Woche"} wurden auf die geplanten Einsätze verteilt, nicht je Besuch erneut berechnet.`);
  if (inferredArea > 0) reviewNotes.push(`Die Angabe „${inferredArea} m“ wurde als ${inferredArea} m² Reinigungsfläche verstanden.`);
  const extraServices = [
    ["glas", /\b(?:glas|fenster|scheiben)(?:reinigung)?\b/i, "Fenster/Glas"],
    ["treppenhaus", /\b(?:treppe|treppenhaus)(?:reinigung)?\b/i, "Treppenhaus"],
    ["extra", /\bdesinfektion\b/i, "Desinfektion"],
    ["extra", /\bmüllentsorgung\b/i, "Müllentsorgung"],
  ] as const;
  for (const [type, pattern, label] of extraServices) {
    if (type !== cleaningType && pattern.test(normalizedText(prompt))) {
      reviewNotes.push(
        `${label} ist eine weitere Leistung: Umfang und Turnus gesondert kalkulieren.`,
      );
    }
  }
  if (cleaningType === "praxis") {
    reviewNotes.push(
      "Sanitär, Desinfektion, Abfall und Materialeinsatz vor dem Angebot abstimmen.",
    );
  }
  if (
    !saved && (((area > 0 || corridorArea > 0) && !statedSqmPrice) ||
    (area <= 0 && hours > 0 && !statedHourlyRate))
  ) {
    reviewNotes.push(
      "Der verwendete Einheitspreis ist ein Richtwert. Eigene Kosten und vereinbarten Preis prüfen.",
    );
  }
  if (!saved && pricingBasis === "floor" && cleaningType === "treppenhaus") {
    reviewNotes.push("Der Etagenpreis ist ein Richtwert. Treppenfläche und Aufwand prüfen.");
  }
  if (saved && saved.hourlyRate > 0) {
    if (companyPricing?.source === "company" && companyPricing.costBasis && !statedHourlyRate && !statedSqmPrice) {
      const basis = companyPricing.costBasis;
      reviewNotes.push(`Aus gespeicherten Firmendaten berechnet: Selbstkosten ${basis.selfCostPerHour.toFixed(2).replace(".", ",")} €/Std. + ${basis.profitMarkupPercent} % Gewinnaufschlag = ${hourlyRate.toFixed(2).replace(".", ",")} €/Std. netto.`);
    }
    reviewNotes.push(`Verkaufspreis für diesen Auftrag: ${hourlyRate.toFixed(2).replace(".", ",")} €/Std. netto. Interne Kosten werden separat geprüft.`);
    if (!roomNotes.length && saved.sqmPerHour > 0 && area > 0) reviewNotes.push(`Gespeicherter Leistungswert „${saved.label}“: ${saved.sqmPerHour} m²/Std.; ${area} m² ÷ ${saved.sqmPerHour} = ${round2(calculatedHours)} Std. je Einsatz.`);
  }
  const baseItem = deterministicBaseItem({
    type: cleaningType,
    area,
    hours: pricingBasis === "hours" ? calculatedHours : hours,
    floors,
    frequency,
    frequencyUnit,
    billingPeriod,
    pricePerSqm,
    hourlyRate,
    floorRate,
  });

  if (baseItem && breakdown) {
    const scope = breakdown.rooms.map((room) => `${room.name} ${String(room.area).replace(".", ",")} m²`).join(" + ");
    baseItem.description = `${defaults.label} (${String(primaryArea).replace(".", ",")} m² ${breakdown.included ? "gesamt, davon" : "+"} ${scope}; ${billingPeriod === "once" ? "einmalig" : `${frequency}× ${recurrenceUnitLabel(frequencyUnit)}`})`;
  }

  // Die KI liefert nur Kontext. Mengen, Turnus und zusätzliche Positionen
  // dürfen ohne eindeutige Angaben nicht in das Angebot geraten.
  const items = reviewQuestions.length === 0 && baseItem ? [baseItem] : [];
  if (items.length > 0 && corridorArea > 0) {
    const corridorItem = deterministicBaseItem({
      type: cleaningType,
      area: corridorArea,
      hours: 0,
      floors: 0,
      frequency,
      frequencyUnit,
      billingPeriod,
      pricePerSqm,
      hourlyRate,
    });
    if (corridorItem)
      items.push({
        ...corridorItem,
        description: corridorItem.description.replace(
          "Treppenhausreinigung",
          "Zusätzliche Flurreinigung",
        ),
      });
    reviewNotes.push(
      "Treppenhaus nach Etagen und zusätzlicher Flur nach m² getrennt kalkuliert. Prüfen, dass der Flur nicht bereits im Etagenpreis enthalten ist.",
    );
  }

  return {
    cleaning_type: cleaningType,
    mode: pricingBasis === "hours" ? "hours" : "area",
    area_sqm: area,
    hours: calculatedHours,
    floor_rate: floorRate,
    hourly_rate: hourlyRate,
    price_per_sqm: pricePerSqm,
    frequency,
    frequency_unit: frequencyUnit,
    floors,
    stairs: /\b(?:treppenhaus|treppe)\b/i.test(normalizedText(prompt)),
    travel: 0,
    note: "",
    items,
    review_questions: reviewQuestions,
    review_notes: reviewNotes,
    billing_period: billingPeriod,
    price_source: statedSqmPrice || statedHourlyRate ? "stated" : saved ? (companyPricing?.source ?? "job") :
      area > 0 || corridorArea > 0
        ? statedSqmPrice > 0
          ? "stated"
          : "estimate"
        : statedHourlyRate > 0
          ? "stated"
          : "estimate",
    pricing_basis: pricingBasis,
  };
}
