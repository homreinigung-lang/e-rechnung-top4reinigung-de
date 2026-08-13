export type ScannedRoom = {
  name: string;
  floor: string;
  usage_type: string;
  area_sqm: number;
  /** Bodenbelag / Oberflächenbeschaffenheit, z. B. "Teppich", "Fliesen", "PVC". */
  floor_covering: string;
};

export type ScannedLvItem = {
  section: string;
  title: string;
  description: string;
  quantity: number;
  unit: string;
  deadline: string; // JJJJ-MM-TT oder ""
  evidence: string;
  critical: boolean;
};

export type ScannedProject = {
  project_name: string;
  address_line: string;
  postal_code: string;
  city: string;
  customer_name: string;
  expected_room_count: number;
  executive_summary: string;
  /** Stichpunktartige Eckdaten, z. B. "Erkannte Fläche: ca. 120 m² Büro". */
  highlights: string[];
  /** Ausdrücklich genannte Kundenanforderungen. */
  requirements: string[];
  rooms: ScannedRoom[];
  items: ScannedLvItem[];
};

const EMPTY: ScannedProject = {
  project_name: "",
  address_line: "",
  postal_code: "",
  city: "",
  customer_name: "",
  expected_room_count: 0,
  executive_summary: "",
  highlights: [],
  requirements: [],
  rooms: [],
  items: [],
};

function num(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return 0;
  const cleaned = value.replace(/[^\d.,-]/g, "").trim();
  if (!cleaned) return 0;
  const normalized =
    cleaned.includes(",") && cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")
      ? cleaned.replace(/\./g, "").replace(",", ".")
      : cleaned.replace(/,/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function strList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of value) {
    const text = String(entry ?? "").replace(/^[-•*\s]+/, "").trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out.slice(0, 12);
}

function isoDate(value: unknown): string {
  const s = String(value ?? "").trim();
  const de = s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})$/);
  if (de) {
    const [, d, m, y] = de;
    const year = y!.length === 2 ? `20${y}` : y!;
    return `${year}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? iso[0]! : "";
}

const NO_GUESS = `ABSOLUTES VERBOT VON ERFUNDENEN DATEN:
- Gib NIEMALS Beispiel-, Muster- oder Platzhalterdaten aus (z. B. "Raum 1", "Büro", "Position 1", "Musterstraße").
- Übernimm ausschließlich Text und Zahlen, die wörtlich im Dokument stehen.
- Ist etwas nicht eindeutig lesbar: Zahl = 0, Text = "" (leer). Lieber weniger Zeilen als geratene Zeilen.
- Ist im Dokument gar nichts Verwertbares zu erkennen, gib leere Listen zurück.`;

const FLOORPLAN_SYSTEM = `Du bist ein Aufmaß-Experte für ein deutsches Gebäudereinigungsunternehmen.
Lies den Grundriss bzw. das Raumbuch und erstelle eine Liste ALLER einzelnen Räume.
Vorgehen:
1. Suche zuerst Raumbücher, Flächentabellen und Legenden – diese Werte haben Vorrang.
2. Danach Raumstempel im Plan (Raumnummer, Raumname, Fläche in m²).
3. Übernimm Raumnamen exakt in der Schreibweise des Dokuments, inkl. Raumnummer falls vorhanden.
4. area_sqm nur aus einer im Dokument geschriebenen Zahl; nicht aus der Zeichnung schätzen oder messen.
5. floor nur aus Planbeschriftung (z. B. "EG", "1. OG"), sonst "".
6. expected_room_count = Anzahl der tatsächlich gelesenen Räume.
7. items bleibt eine leere Liste.
8. floor_covering = Bodenbelag / Oberfläche des Raums, nur wenn im Dokument oder auf dem Foto klar erkennbar (z. B. "Teppich", "Fliesen", "PVC/Linoleum", "Parkett", "Beton", "Sanitärkeramik"), sonst "".

FOTOS UND SKIZZEN (nur wenn keine Tabelle/kein Raumbuch vorhanden ist):
- Bei Fotos oder Handskizzen ohne geschriebene Zahlen darfst du die Fläche fachlich schätzen; schreibe die Schätzung dann in area_sqm und ergänze im Raumnamen NICHTS, sondern kennzeichne die Schätzung im Feld usage_type nicht, sondern in highlights mit dem Wort "geschätzt".
- Erkenne auf Fotos zusätzlich Oberflächen (Bodenbelag, Glasflächen, Sanitärobjekte) und offensichtliche Verschmutzungsgrade.

STICHPUNKTE (Pflicht):
- highlights: 3–8 kurze deutsche Stichpunkte mit den wichtigsten Eckdaten, z. B. "Erkannte Fläche: ca. 120 m² Büro", "Bodenbelag: überwiegend Teppich", "Etagen: EG und 1. OG", "Sanitärbereiche: 3 WC-Einheiten". Zahlen nur aus gelesenen bzw. – bei Fotos – klar begründbaren Werten.
- requirements: ausdrücklich genannte Kundenanforderungen (z. B. "Reinigung nach 18:00 Uhr", "Schlüsselübergabe", "Fensterreinigung 2× jährlich"). Nichts erfinden; sonst leere Liste.

STRIKTE ZEILEN-REGELN (wichtigster Teil):
- Eine Zeile = GENAU EIN Raum. Niemals Aufzählungen wie "Büro, WC, Flur" in ein Feld schreiben; solche Listen in einzelne Zeilen aufteilen.
- Jede Zeile muss ihren EIGENEN, im Dokument stehenden Wert haben. Kopiere niemals denselben Raumnamen oder denselben m²-Wert in mehrere Zeilen.
- Lies jede Tabellenzeile bzw. jeden Raumstempel einzeln von oben nach unten und übertrage sie 1:1 in der Reihenfolge des Dokuments.
- Steht für einen Raum keine eigene Fläche im Dokument, setze area_sqm = 0 – niemals den Wert eines anderen Raums übernehmen und niemals einen Durchschnitts- oder Einheitswert verteilen.
- Sind mehrere Räume im Dokument tatsächlich gleich benannt (z. B. mehrere "WC"), unterscheide sie über die im Dokument stehende Raumnummer/Etage.
- Wiederholte identische Zeilen sind ein Fehler: gib in diesem Fall lieber nur die eine Zeile aus, die im Dokument steht.
${NO_GUESS}
Antworte ausschließlich mit reinem JSON.`;


const TENDER_SYSTEM = `Du bist ein Ausschreibungs-Experte für ein deutsches Gebäudereinigungsunternehmen.
Lies die Ausschreibung / das Leistungsverzeichnis und extrahiere:
- jede einzelne LV-Position wörtlich (section = Titel des Leistungsbereichs, title = Positionstext, description = ergänzender Text)
- quantity und unit nur, wenn sie im Dokument stehen, sonst 0 bzw. ""
- Fristen (deadline als JJJJ-MM-TT) und geforderte Nachweise (evidence, z. B. Referenzen, Unbedenklichkeitsbescheinigung, Versicherungsnachweis)
- critical = true nur bei ausdrücklich fristgebundenen oder zwingend geforderten Punkten
- executive_summary: kurze deutsche Zusammenfassung (max. 6 Sätze) ausschließlich auf Basis des Dokuments.
- highlights: 3–8 kurze Stichpunkte mit den wichtigsten Eckdaten (Flächen in m², Objektart, Reinigungsintervalle, Vertragslaufzeit), nur aus dem Dokument.
- requirements: ausdrücklich geforderte Kundenanforderungen und Auflagen, wörtlich verkürzt.
rooms bleibt eine leere Liste.
${NO_GUESS}
Antworte ausschließlich mit reinem JSON.`;


const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    project_name: { type: "string" },
    address_line: { type: "string" },
    postal_code: { type: "string" },
    city: { type: "string" },
    customer_name: { type: "string" },
    expected_room_count: { type: "number" },
    executive_summary: { type: "string" },
    highlights: { type: "array", items: { type: "string" } },
    requirements: { type: "array", items: { type: "string" } },
    rooms: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          floor: { type: "string" },
          usage_type: { type: "string" },
          area_sqm: { type: "number" },
          floor_covering: { type: "string" },
        },
        required: ["name", "floor", "usage_type", "area_sqm", "floor_covering"],
      },
    },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          section: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          quantity: { type: "number" },
          unit: { type: "string" },
          deadline: { type: "string" },
          evidence: { type: "string" },
          critical: { type: "boolean" },
        },
        required: [
          "section",
          "title",
          "description",
          "quantity",
          "unit",
          "deadline",
          "evidence",
          "critical",
        ],
      },
    },
  },
  required: [
    "project_name",
    "address_line",
    "postal_code",
    "city",
    "customer_name",
    "expected_room_count",
    "executive_summary",
    "highlights",
    "requirements",
    "rooms",
    "items",
  ],
} as const;

/**
 * Bereinigt die von der KI gelieferten Raumzeilen:
 * - Aufzählungen ("Büro, WC, Flur") werden in einzelne Zeilen zerlegt (Fläche dann 0).
 * - Exakte Duplikate werden entfernt.
 * - Wird derselbe m²-Wert über alle Zeilen kopiert, gilt er als Einheitswert und wird auf 0 gesetzt.
 */
function sanitizeRooms(input: ScannedRoom[]): ScannedRoom[] {
  const split: ScannedRoom[] = [];
  for (const room of input) {
    const parts = room.name
      .split(/\s*[,;/]\s*|\s+\/\s+/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length > 1) {
      for (const part of parts) {
        split.push({ ...room, name: part, area_sqm: 0 });
      }
    } else {
      split.push({ ...room, name: parts[0] ?? room.name });
    }
  }

  const seen = new Set<string>();
  const unique = split.filter((r) => {
    const key = `${r.name.toLowerCase()}|${r.floor.toLowerCase()}|${r.area_sqm}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const areas = unique.map((r) => r.area_sqm).filter((a) => a > 0);
  const uniformArea =
    areas.length >= 3 && areas.length === unique.length && new Set(areas).size === 1;

  return uniformArea ? unique.map((r) => ({ ...r, area_sqm: 0 })) : unique;
}

async function toDataUrl(fileUrl: string, mimeType: string): Promise<string> {
  const res = await fetch(fileUrl);
  if (!res.ok) throw new Error("Datei konnte nicht geladen werden.");
  const buffer = new Uint8Array(await res.arrayBuffer());
  let binary = "";
  for (let i = 0; i < buffer.length; i += 8192) {
    binary += String.fromCharCode(...buffer.subarray(i, i + 8192));
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

/** Analysiert einen Grundriss oder eine Ausschreibung mit dem KI-Gateway. */
export async function analyzeProjectFile(
  fileUrl: string,
  mimeType: string,
  mode: "floorplan" | "tender",
): Promise<ScannedProject> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("KI-Dienst ist nicht konfiguriert.");

  const dataUrl = await toDataUrl(fileUrl, mimeType);
  const prompt =
    mode === "floorplan"
      ? "Erstelle das vollständige Raumbuch zu diesem Grundriss bzw. dieser Aufnahme, inklusive Bodenbelag je Raum, Stichpunkten (highlights) und erkannten Kundenanforderungen (requirements)."
      : "Analysiere diese Ausschreibung und erstelle das strukturierte Leistungsverzeichnis.";

  const content =
    mimeType === "application/pdf"
      ? [
          { type: "text", text: prompt },
          { type: "file", file: { filename: "projekt.pdf", file_data: dataUrl } },
        ]
      : [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: dataUrl } },
        ];

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3.1-pro-preview",
      temperature: 0,
      messages: [
        { role: "system", content: mode === "floorplan" ? FLOORPLAN_SYSTEM : TENDER_SYSTEM },
        { role: "user", content },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "projekt", strict: true, schema: SCHEMA },
      },
    }),
  });

  if (res.status === 429) throw new Error("KI-Limit erreicht. Bitte später erneut versuchen.");
  if (res.status === 402) throw new Error("KI-Guthaben aufgebraucht.");
  if (!res.ok) throw new Error(`Datei konnte nicht analysiert werden (${res.status}).`);

  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = json.choices?.[0]?.message?.content ?? "";
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return EMPTY;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return EMPTY;
  }

  const rawRooms = Array.isArray(parsed["rooms"])
    ? (parsed["rooms"] as Record<string, unknown>[]).map((r) => ({
        name: String(r["name"] ?? "").trim(),
        floor: String(r["floor"] ?? "").trim(),
        usage_type: String(r["usage_type"] ?? "").trim(),
        area_sqm: num(r["area_sqm"]),
        floor_covering: String(r["floor_covering"] ?? "").trim(),
      }))
    : [];

  const rooms = sanitizeRooms(rawRooms);


  const items = Array.isArray(parsed["items"])
    ? (parsed["items"] as Record<string, unknown>[]).map((i) => ({
        section: String(i["section"] ?? "").trim(),
        title: String(i["title"] ?? "").trim(),
        description: String(i["description"] ?? "").trim(),
        quantity: num(i["quantity"]),
        unit: String(i["unit"] ?? "").trim(),
        deadline: isoDate(i["deadline"]),
        evidence: String(i["evidence"] ?? "").trim(),
        critical: Boolean(i["critical"]),
      }))
    : [];

  const expected = Math.max(num(parsed["expected_room_count"]), rooms.length);

  return {
    project_name: String(parsed["project_name"] ?? "").trim(),
    address_line: String(parsed["address_line"] ?? "").trim(),
    postal_code: String(parsed["postal_code"] ?? "").trim(),
    city: String(parsed["city"] ?? "").trim(),
    customer_name: String(parsed["customer_name"] ?? "").trim(),
    expected_room_count: Math.round(expected),
    executive_summary: String(parsed["executive_summary"] ?? "").trim(),
    highlights: strList(parsed["highlights"]),
    requirements: strList(parsed["requirements"]),
    rooms: rooms.filter((r) => r.name || r.area_sqm > 0),
    items: items.filter((i) => i.title || i.section),
  };
}
