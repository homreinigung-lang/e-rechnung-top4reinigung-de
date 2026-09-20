import { generateGeminiJson } from "./gemini-json.server";
import { STAIR_RATE_PER_FLOOR, WEEKS_PER_MONTH } from "./constants";

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
  frequency_unit: "week" | "month";
  floors: number;
  stairs: boolean;
  travel: number;
  note: string;
  items: GeneratedItem[];
  review_questions: string[];
  review_notes: string[];
  billing_period: "once" | "month";
  price_source: "stated" | "estimate";
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
  return canonicalPrompt(prompt)
    .toLowerCase()
    .replace(/²/g, "2")
    .replace(/×/g, "x")
    .replace(/\s+/g, " ");
}

function explicitArea(prompt: string): number {
  const text = normalizedText(prompt);
  const match = text.match(
    /(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)\s*(?:m2|qm|quadratmeter)\b/i,
  );
  return match ? num(match[1]) : 0;
}

function explicitFrequency(prompt: string): { value: number; unit: "week" | "month" } | null {
  const text = normalizedText(prompt).replace(/inderwoche/g, "in der woche");
  const connector = "(?:pro\\s+|in\\s+der\\s+|inder\\s+|im\\s+|die\\s+|je\\s+|/\\s*)?";

  const days = text.match(
    /\b([1-7])\s*(?:tage?n?|einsätze?)\s*(?:pro|in der|die|je|\/)\s*woche\b/i,
  );
  if (days) return { value: Number(days[1]), unit: "week" };
  if (
    /\b(?:14[- ]?tägig|14[- ]?taegig|zweiwöchentlich|zweiwoechentlich|alle\s+(?:2|zwei)\s+wochen)\b/i.test(
      text,
    )
  ) {
    return { value: 0.5, unit: "week" };
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
    ["unterhalt", /\b(?:unterhaltsreinigung|unterhalt)\b/i],
    ["treppenhaus", /\b(?:treppenhausreinigung|treppenhaus|treppe)\b/i],
    ["glas", /\b(?:glas[- ]?reinigung|fenster[- ]?reinigung|fenster)\b/i],
  ];
  for (const [type, pattern] of patterns) {
    const index = text.search(pattern);
    if (index >= 0) matches.push({ type, index });
  }
  return matches.sort((a, b) => a.index - b.index)[0]?.type ?? null;
}

function statedPrice(prompt: string, unit: "m2" | "hour"): number {
  const text = normalizedText(prompt);
  const suffix = unit === "m2" ? "(?:m2|qm|quadratmeter)" : "(?:std\\.?|stunden?)";
  const match = text.match(
    new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(?:€|eur|euro)\\s*(?:pro|je|/)\\s*${suffix}\\b`, "i"),
  );
  return match ? num(match[1]) : 0;
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
  frequencyUnit: "week" | "month";
  billingPeriod: "once" | "month";
  pricePerSqm: number;
  hourlyRate: number;
}): GeneratedItem | null {
  if (
    !(args.area > 0 || args.hours > 0 || (args.type === "treppenhaus" && args.floors > 0)) ||
    !(args.frequency > 0)
  )
    return null;
  const visitsPerMonth =
    args.frequencyUnit === "week" ? args.frequency * WEEKS_PER_MONTH : args.frequency;
  const perVisit =
    args.area > 0
      ? round2(args.area * args.pricePerSqm)
      : args.hours > 0
        ? round2(args.hours * args.hourlyRate)
        : round2(args.floors * STAIR_RATE_PER_FLOOR);
  const turnus =
    args.billingPeriod === "once"
      ? "einmalig"
      : args.frequencyUnit === "week"
        ? args.frequency === 0.5
          ? "14-täglich"
          : `${args.frequency}× wöchentlich`
        : `${args.frequency}× monatlich`;
  return {
    description: `${defaultsFor(args.type).label} (${args.area > 0 ? `${String(args.area).replace(".", ",")} m²` : args.hours > 0 ? `${String(args.hours).replace(".", ",")} Std. je Einsatz` : `${args.floors} Etagen`}, ${turnus})`,
    quantity: 1,
    unit: args.billingPeriod === "once" ? "Pauschal" : "Monat",
    // Der monatliche Betrag wird einmal gerundet. 21,67 × 80 € würde bei
    // fünf Einsätzen/Woche andernfalls 27 Cent zu hoch ausfallen.
    unit_price: args.billingPeriod === "once" ? perVisit : round2(perVisit * visitsPerMonth),
  };
}

export async function generateItems(prompt: string): Promise<GeneratedItem[]> {
  const parsed = await generateGeminiJson({
    model: process.env["GEMINI_MODEL_CALC"] || "gemini-3.6-flash",
    system: `${SYSTEM}\nAntworte ausschließlich mit JSON gemäß Schema.`,
    prompt: `Erstelle 3 bis 10 sinnvolle Angebotspositionen für: ${canonicalPrompt(prompt)}`,
    schema: ITEMS_SCHEMA,
  });
  return normalizeItems(parsed["items"]);
}

export async function generateCalculation(prompt: string): Promise<GeneratedCalculation> {
  const statedType = explicitCleaningType(prompt);
  const cleaningType = statedType ?? "unterhalt";
  const defaults = defaultsFor(cleaningType);

  const recurring = ["praxis", "buero", "unterhalt", "treppenhaus"].includes(cleaningType);
  const statedArea = explicitArea(prompt);
  const area = statedArea;

  const statedFrequency = explicitFrequency(prompt);
  const annualFrequency =
    !statedFrequency &&
    /\b(?:\d+\s*[-–—]?\s*(?:x|mal)\s*(?:(?:pro|im|je)\s*|\/\s*)?jahr|(?:einmal|zweimal|dreimal)\s*(?:pro|im|je)\s*jahr|jährlich|jaehrlich|halbjährlich|halbjaehrlich)\b/i.test(
      normalizedText(prompt),
    );
  const ambiguousDaily =
    /\b(?:täglich|taeglich|jeden\s+tag)\b/i.test(normalizedText(prompt)) && !statedFrequency;
  const explicitOnce =
    /\b(?:einmalig|einmalige|einmaligen|einmaliger|einmaliges|einmal)\b/i.test(
      normalizedText(prompt),
    ) && !statedFrequency;
  const billingPeriod = explicitOnce ? "once" : recurring || statedFrequency ? "month" : "once";
  const frequency =
    ambiguousDaily || annualFrequency
      ? 0
      : (statedFrequency?.value ?? (recurring && !explicitOnce ? 0 : 1));
  const frequencyUnit = statedFrequency?.unit ?? "month";

  const statedSqmPrice = statedPrice(prompt, "m2");
  const statedHourlyRate = statedPrice(prompt, "hour");
  const pricePerSqm = statedSqmPrice || defaults.pricePerSqm;
  const hourlyRate = statedHourlyRate || defaults.hourlyRate;
  // „21,65 Stunden“ kann sonst eine Monatssumme statt Stunden pro Einsatz sein.
  // Nur eine explizit genannte Dauer je Einsatz wird in das Stundenfeld übernommen.
  const hoursMatch = normalizedText(prompt).match(
    /(\d+(?:[.,]\d+)?)\s*(?:stunden?|std\.?|h)\b(?:\s*(?:pro|je)\s*(?:einsatz|besuch|reinigung))?/i,
  );
  const hours = hoursMatch ? num(hoursMatch[1]) : 0;
  const floors = explicitFloors(prompt);
  const pricingBasis = area > 0 ? "area" : hours > 0 ? "hours" : "floor";

  const reviewQuestions: string[] = [];
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
  if (area <= 0 && hours <= 0 && !(cleaningType === "treppenhaus" && floors > 0)) {
    reviewQuestions.push(
      "Wie groß ist die Fläche in m² oder wie viele Stunden dauert ein Einsatz?",
    );
  }
  const reviewNotes: string[] = [];
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
  if ((area > 0 && !statedSqmPrice) || (area <= 0 && hours > 0 && !statedHourlyRate)) {
    reviewNotes.push(
      "Der verwendete Einheitspreis ist ein Richtwert. Eigene Kosten und vereinbarten Preis prüfen.",
    );
  }
  if (pricingBasis === "floor" && cleaningType === "treppenhaus") {
    reviewNotes.push("Der Etagenpreis ist ein Richtwert. Treppenfläche und Aufwand prüfen.");
  }
  const baseItem = deterministicBaseItem({
    type: cleaningType,
    area,
    hours,
    floors,
    frequency,
    frequencyUnit,
    billingPeriod,
    pricePerSqm,
    hourlyRate,
  });

  // Die KI liefert nur Kontext. Mengen, Turnus und zusätzliche Positionen
  // dürfen ohne eindeutige Angaben nicht in das Angebot geraten.
  const items = reviewQuestions.length === 0 && baseItem ? [baseItem] : [];

  return {
    cleaning_type: cleaningType,
    mode: pricingBasis === "hours" ? "hours" : "area",
    area_sqm: area,
    hours,
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
    price_source:
      area > 0
        ? statedSqmPrice > 0
          ? "stated"
          : "estimate"
        : statedHourlyRate > 0
          ? "stated"
          : "estimate",
    pricing_basis: pricingBasis,
  };
}
