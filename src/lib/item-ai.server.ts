import { generateGeminiJson } from "./gemini-json.server";

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
};

const SYSTEM = `Du bist Kalkulations-Assistent einer deutschen Gebäudereinigungsfirma im Saarland.
Erstelle aus der Auftragsbeschreibung eine fachlich plausible, deterministische Kalkulation.
Regeln:
- Alle Texte auf Deutsch, knapp und professionell.
- Stundensätze netto: Unterhalts-/Büro-/Treppenhausreinigung 34–37 EUR/Std.; Grund- und Bauendreinigung 42–45 EUR/Std.; Glas/Fenster 38 EUR/Std.
- Keine erfundenen Kundendaten, Flächen oder Mengen. Unbekannte Zahlen = 0.
- Explizit genannte Fläche, Häufigkeit und Reinigungsart müssen exakt übernommen werden.
- Realistische Leistungswerte als Orientierung: Büro 200–250 m²/Std., Flur 300 m²/Std., Sanitär/WC 60 m²/Std., Teeküche 100 m²/Std., Treppenhaus 120 m²/Std.
- Wiederkehrende Leistungen auf Monatsbasis: wöchentlich = 4,33 Einsätze/Monat, 14-täglich = 2, monatlich = 1.
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

const CALC_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    cleaning_type: { type: "string" },
    mode: { type: "string" },
    area_sqm: { type: "number" },
    hours: { type: "number" },
    hourly_rate: { type: "number" },
    price_per_sqm: { type: "number" },
    frequency: { type: "number" },
    frequency_unit: { type: "string" },
    floors: { type: "number" },
    stairs: { type: "boolean" },
    travel: { type: "number" },
    note: { type: "string" },
    items: { type: "array", items: ITEM_SCHEMA },
  },
  required: [
    "cleaning_type",
    "mode",
    "area_sqm",
    "hours",
    "hourly_rate",
    "price_per_sqm",
    "frequency",
    "frequency_unit",
    "floors",
    "stairs",
    "travel",
    "note",
    "items",
  ],
};

function canonicalPrompt(prompt: string): string {
  return prompt.trim().replace(/\s+/g, " ");
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(",", "."));
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
        description: String(it["description"] ?? "").trim().slice(0, 200),
        quantity: num(it["quantity"]) || 1,
        unit: String(it["unit"] ?? "Std.").trim().slice(0, 20) || "Std.",
        unit_price: num(it["unit_price"]),
      };
    })
    .filter((item) => item.description);
}

function normalizedText(prompt: string) {
  return canonicalPrompt(prompt)
    .toLowerCase()
    .replace(/²/g, "2")
    .replace(/\s+/g, " ");
}

function explicitArea(prompt: string): number {
  const text = normalizedText(prompt);
  const match = text.match(/(\d+(?:[.,]\d+)?)\s*(?:m2|qm|quadratmeter)\b/i);
  return match ? num(match[1]) : 0;
}

function explicitFrequency(prompt: string): { value: number; unit: "week" | "month" } | null {
  const text = normalizedText(prompt).replace(/inderwoche/g, "in der woche");
  const connector = "(?:pro\\s+|in\\s+der\\s+|inder\\s+|im\\s+)?";

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
    if (new RegExp(`\\b${word}\\b\\s*${connector}woche\\b`, "i").test(text)) return { value, unit: "week" };
  }
  for (const [word, value] of Object.entries(wordNumbers)) {
    if (new RegExp(`\\b${word}\\b\\s*${connector}monat\\b`, "i").test(text)) return { value, unit: "month" };
  }

  let match = text.match(new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(?:x|mal|mall)\\s*${connector}woche\\b`, "i"));
  if (match) return { value: num(match[1]), unit: "week" };

  match = text.match(new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(?:x|mal|mall)\\s*${connector}monat\\b`, "i"));
  if (match) return { value: num(match[1]), unit: "month" };

  if (/\b(?:wöchentlich|woechentlich|jede\s+woche)\b/i.test(text)) return { value: 1, unit: "week" };
  if (/\b(?:monatlich|jeden\s+monat)\b/i.test(text)) return { value: 1, unit: "month" };
  if (/\b(?:14[- ]?tägig|14[- ]?taegig|zweiwöchentlich|zweiwoechentlich)\b/i.test(text)) {
    return { value: 2, unit: "month" };
  }
  return null;
}

function explicitCleaningType(prompt: string): string | null {
  const text = normalizedText(prompt);
  if (/\b(?:büro|buero|büroreinigung|bueroreinigung)\b/i.test(text)) return "buero";
  if (/\b(?:grundreinigung|tiefenreinigung)\b/i.test(text)) return "grund";
  if (/\b(?:bauendreinigung|baureinigung)\b/i.test(text)) return "bau";
  if (/\b(?:glasreinigung|fensterreinigung|fenster)\b/i.test(text)) return "glas";
  if (/\b(?:treppenhaus|treppe)\b/i.test(text)) return "treppenhaus";
  if (/\b(?:unterhaltsreinigung|unterhalt)\b/i.test(text)) return "unterhalt";
  return null;
}

function defaultsFor(type: string) {
  switch (type) {
    case "buero":
      return { pricePerSqm: 0.4, hourlyRate: 35, performance: 225, label: "Büroreinigung" };
    case "grund":
      return { pricePerSqm: 1.9, hourlyRate: 43, performance: 80, label: "Grundreinigung" };
    case "bau":
      return { pricePerSqm: 2.6, hourlyRate: 44, performance: 70, label: "Bauendreinigung" };
    case "glas":
      return { pricePerSqm: 1.4, hourlyRate: 38, performance: 100, label: "Glas- und Fensterreinigung" };
    case "treppenhaus":
      return { pricePerSqm: 0.6, hourlyRate: 35, performance: 120, label: "Treppenhausreinigung" };
    default:
      return { pricePerSqm: 0.35, hourlyRate: 35, performance: 225, label: "Unterhaltsreinigung" };
  }
}

function deterministicBaseItem(args: {
  type: string;
  area: number;
  frequency: number;
  frequencyUnit: "week" | "month";
  pricePerSqm: number;
}): GeneratedItem | null {
  if (!(args.area > 0) || !(args.frequency > 0)) return null;
  const defaults = defaultsFor(args.type);
  const visitsPerMonth = args.frequencyUnit === "week" ? args.frequency * 4.33 : args.frequency;
  const perVisit = round2(args.area * (args.pricePerSqm > 0 ? args.pricePerSqm : defaults.pricePerSqm));
  const turnus =
    args.frequencyUnit === "week"
      ? `${args.frequency}× wöchentlich`
      : `${args.frequency}× monatlich`;
  return {
    description: `${defaults.label} (${String(args.area).replace(".", ",")} m², ${turnus})`,
    quantity: round2(visitsPerMonth),
    unit: "Einsatz",
    unit_price: perVisit,
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
  const parsed = await generateGeminiJson({
    model: process.env["GEMINI_MODEL_CALC"] || "gemini-3.6-flash",
    system: `${SYSTEM}\nAntworte ausschließlich mit JSON gemäß Schema.`,
    prompt: `Analysiere diese Reinigungsanfrage für die Kalkulation: ${canonicalPrompt(prompt)}\ncleaning_type: unterhalt|grund|bau|glas|treppenhaus|buero. mode: area|hours. frequency_unit: week|month. Explizit genannte Fläche und Häufigkeit müssen exakt übernommen werden. Unbekannte Werte mit 0 bzw. leerem Text ausgeben.`,
    schema: CALC_SCHEMA,
  });

  const types = ["unterhalt", "grund", "bau", "glas", "treppenhaus", "buero"];
  const aiType = String(parsed["cleaning_type"] ?? "");
  const statedType = explicitCleaningType(prompt);
  const cleaningType = statedType ?? (types.includes(aiType) ? aiType : "unterhalt");
  const defaults = defaultsFor(cleaningType);

  const statedArea = explicitArea(prompt);
  const area = statedArea > 0 ? statedArea : num(parsed["area_sqm"]);

  const statedFrequency = explicitFrequency(prompt);
  const frequency = statedFrequency?.value ?? num(parsed["frequency"]);
  const frequencyUnit = statedFrequency?.unit ?? (parsed["frequency_unit"] === "week" ? "week" : "month");

  const pricePerSqm = num(parsed["price_per_sqm"]) || defaults.pricePerSqm;
  const hourlyRate = num(parsed["hourly_rate"]) || defaults.hourlyRate;
  const hours = num(parsed["hours"]) || (area > 0 ? round2(area / defaults.performance) : 0);

  const normalizedAiItems = normalizeItems(parsed["items"]);
  const baseItem = deterministicBaseItem({
    type: cleaningType,
    area,
    frequency,
    frequencyUnit,
    pricePerSqm,
  });

  // Bei klar angegebenen Fläche + Turnus ist die Hauptposition deterministisch.
  // So kann die KI keine abweichende Fläche, 1 Std. oder falschen Turnus erfinden.
  const items = baseItem
    ? [
        baseItem,
        ...normalizedAiItems.filter((item) => {
          const d = item.description.toLowerCase();
          return !/(büro|buero|unterhalt|grundreinigung|bauendreinigung|glas|fenster|treppenhaus)/i.test(d);
        }),
      ].slice(0, 12)
    : normalizedAiItems;

  return {
    cleaning_type: cleaningType,
    mode: area > 0 ? "area" : parsed["mode"] === "hours" ? "hours" : "area",
    area_sqm: area,
    hours,
    hourly_rate: hourlyRate,
    price_per_sqm: pricePerSqm,
    frequency,
    frequency_unit: frequencyUnit,
    floors: num(parsed["floors"]),
    stairs: Boolean(parsed["stairs"]),
    travel: num(parsed["travel"]),
    note: String(parsed["note"] ?? "").trim().slice(0, 500),
    items,
  };
}
