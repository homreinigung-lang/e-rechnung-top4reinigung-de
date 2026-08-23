export type GeneratedItem = {
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
};

const SYSTEM = `Du bist Kalkulations-Assistent einer deutschen Gebäudereinigungsfirma.
Aus der Beschreibung des Auftrags erstellst du eine realistische Leistungsaufstellung (Positionen) für ein Angebot.
Regeln:
- Alle Texte auf Deutsch, fachlich und knapp (max. 140 Zeichen pro Position).
- Marktübliche Nettopreise in EUR für das Saarland/Deutschland.
- Stundensätze: Unterhalts-/Büro-/Treppenhausreinigung 34–37 EUR/Std., Grund- und Bauendreinigung 42–45 EUR/Std.
- Glas- und Fensterreinigung IMMER mit dem höheren Fixsatz von 38,00 EUR pro Stunde kalkulieren.
- unit_price darf NIEMALS 0 sein. Jede Position braucht einen realistischen Preis.
- Werden Treppen, Treppenhaus oder mehrere Etagen erwähnt, MUSS eine eigene Position "Treppenhausreinigung" mit der Etagenanzahl als Menge und mindestens 12,50 EUR je Etage enthalten sein.
- Einheiten nur: Std., m², Stk., Etage, Pauschal, Monat.
- Mengen und Preise auf 2 Nachkommastellen runden, keine Cent-Bruchteile.
- 3 bis 10 Positionen, keine Umsatzsteuer, keine Summenzeile.
- Arbeite deterministisch: identische Eingaben müssen identische Mengen, Einheiten und Preise ergeben. Nutze keine Preisspannen oder Zufallswerte.
Antworte ausschließlich mit reinem JSON.`;

function canonicalPrompt(prompt: string): string {
  return prompt.trim().replace(/\s+/g, " ");
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
}

export async function generateItems(prompt: string): Promise<GeneratedItem[]> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("KI-Dienst ist nicht konfiguriert.");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      temperature: 0,
      top_p: 1,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: canonicalPrompt(prompt) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "positionen",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              items: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    description: { type: "string" },
                    quantity: { type: "number" },
                    unit: { type: "string" },
                    unit_price: { type: "number" },
                  },
                  required: ["description", "quantity", "unit", "unit_price"],
                },
              },
            },
            required: ["items"],
          },
        },
      },
    }),
  });

  if (res.status === 429) throw new Error("KI-Limit erreicht. Bitte später erneut versuchen.");
  if (res.status === 402) throw new Error("KI-Guthaben aufgebraucht.");
  if (!res.ok) throw new Error(`Vorschlag fehlgeschlagen (${res.status}).`);

  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = json.choices?.[0]?.message?.content ?? "";
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return [];

  let parsed: { items?: unknown } = {};
  try {
    parsed = JSON.parse(match[0]) as { items?: unknown };
  } catch {
    return [];
  }
  const list = Array.isArray(parsed.items) ? parsed.items : [];
  return list.slice(0, 12).map((entry) => {
    const it = (entry ?? {}) as Record<string, unknown>;
    return {
      description: String(it["description"] ?? "").slice(0, 200),
      quantity: num(it["quantity"]) || 1,
      unit: String(it["unit"] ?? "Std.").slice(0, 20) || "Std.",
      unit_price: num(it["unit_price"]),
    };
  });
}

// ---------------------------------------------------------------------------
// Kalkulations-Assistent: liefert zusätzlich die Eckdaten für das Hauptformular
// ---------------------------------------------------------------------------

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

const CALC_SYSTEM = `${SYSTEM}
Zusätzlich schätzt du die Eckdaten der Kalkulation:
- cleaning_type: einer von unterhalt | grund | bau | glas | treppenhaus | buero
- mode: "area" wenn eine Fläche genannt oder ableitbar ist, sonst "hours"
- area_sqm, hours, hourly_rate, price_per_sqm (m²-Preis netto: unterhalt 0,55 · grund 1,90 · bau 2,60 · glas 1,40 · treppenhaus 0,75 · buero 0,65)
- frequency + frequency_unit (week|month), floors, stairs (Treppenhaus enthalten?), travel (Anfahrtspauschale netto, 0 wenn unbekannt)
- note: kurze deutsche Bemerkung zur Leistung.
Unbekannte Zahlen mit 0 belegen.`;

export async function generateCalculation(prompt: string): Promise<GeneratedCalculation> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("KI-Dienst ist nicht konfiguriert.");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      temperature: 0,
      top_p: 1,
      messages: [
        { role: "system", content: CALC_SYSTEM },
        { role: "user", content: canonicalPrompt(prompt) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "kalkulation",
          strict: true,
          schema: {
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
              items: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    description: { type: "string" },
                    quantity: { type: "number" },
                    unit: { type: "string" },
                    unit_price: { type: "number" },
                  },
                  required: ["description", "quantity", "unit", "unit_price"],
                },
              },
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
          },
        },
      },
    }),
  });

  if (res.status === 429) throw new Error("KI-Limit erreicht. Bitte später erneut versuchen.");
  if (res.status === 402) throw new Error("KI-Guthaben aufgebraucht.");
  if (!res.ok) throw new Error(`Analyse fehlgeschlagen (${res.status}).`);

  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = json.choices?.[0]?.message?.content ?? "";
  const match = raw.match(/\{[\s\S]*\}/);
  const parsed = match ? (JSON.parse(match[0]) as Record<string, unknown>) : {};

  const types = ["unterhalt", "grund", "bau", "glas", "treppenhaus", "buero"];
  const list = Array.isArray(parsed["items"]) ? (parsed["items"] as unknown[]) : [];

  return {
    cleaning_type: types.includes(String(parsed["cleaning_type"]))
      ? String(parsed["cleaning_type"])
      : "unterhalt",
    mode: parsed["mode"] === "hours" ? "hours" : "area",
    area_sqm: num(parsed["area_sqm"]),
    hours: num(parsed["hours"]),
    hourly_rate: num(parsed["hourly_rate"]),
    price_per_sqm: num(parsed["price_per_sqm"]),
    frequency: num(parsed["frequency"]),
    frequency_unit: parsed["frequency_unit"] === "week" ? "week" : "month",
    floors: num(parsed["floors"]),
    stairs: Boolean(parsed["stairs"]),
    travel: num(parsed["travel"]),
    note: String(parsed["note"] ?? "").slice(0, 500),
    items: list.slice(0, 12).map((entry) => {
      const it = (entry ?? {}) as Record<string, unknown>;
      return {
        description: String(it["description"] ?? "").slice(0, 200),
        quantity: num(it["quantity"]) || 1,
        unit: String(it["unit"] ?? "Std.").slice(0, 20) || "Std.",
        unit_price: num(it["unit_price"]),
      };
    }),
  };
}
