export type ScannedFloorplan = {
  sqm: number;
  rooms: number;
  floors: number;
  note: string;
};

const EMPTY: ScannedFloorplan = { sqm: 0, rooms: 0, floors: 0, note: "" };

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

const SYSTEM = `Du bist ein präziser Auswerter von Grundrissen, Raumbüchern und Flächenlisten für ein deutsches Reinigungsunternehmen.

ARBEITSWEISE (streng in dieser Reihenfolge):
1. Suche zuerst nach EXPLIZITEN Angaben im Dokument: Tabellen, Raumbücher, Flächenlisten, Legenden,
   Raumstempel/Boxen mit Raumnummer + Bezeichnung + Fläche, Beschriftungen wie "12,45 m²", "qm", "NGF", "Wohnfläche".
   Lies jede Zeile/jeden Raumstempel einzeln aus und trage sie in "rooms_detail" ein (Bezeichnung + Fläche exakt wie angegeben).
2. Gesamtfläche: Wenn im Dokument eine Summenzeile ("Gesamt", "Summe", "Gesamtfläche", "NGF") steht, nimm diesen Wert.
   Sonst addiere die einzeln ausgelesenen Raumflächen.
3. Räume: Zähle nur tatsächlich benannte/nummerierte Räume. Flure, Treppenhäuser, WC/Sanitär zählen als Räume, wenn sie beschriftet sind.
4. Etagen: Nur zählen, wenn Geschossbezeichnungen erkennbar sind (EG, 1. OG, 2. OG, UG, DG, Grundriss pro Blatt).

NICHT RATEN:
- Schätze NIEMALS aus Proportionen, Zeichnungsgröße oder Erfahrungswerten.
- Nur wenn eindeutige Maßketten (z.B. "4,20 x 3,10") pro Raum vorhanden sind, darfst du daraus rechnen und "estimated": true setzen.
- Steht kein belastbarer Wert im Dokument, gib 0 zurück (sqm: 0, rooms: 0, floors: 0). Ein 0-Wert ist besser als eine falsche Zahl.
- Erfinde keine Raumnamen und keine Flächen.

Deutsche Zahlenformate beachten: Komma ist Dezimaltrennzeichen ("12,45" = 12.45), Punkt ist Tausendertrennzeichen.
Runde nur die Gesamtfläche auf ganze Quadratmeter, Einzelflächen mit Nachkommastelle belassen.

"note": kurze deutsche Zusammenfassung – Quelle der Werte (z.B. "aus Raumbuch-Tabelle ausgelesen" / "aus Raumstempeln" / "keine Flächenangaben im Plan gefunden"),
Raumtypen, Bodenbeläge, Sanitärräume, Besonderheiten. Nenne ausdrücklich, wenn Werte fehlen oder unsicher sind.
"confidence": "hoch" wenn direkt abgelesen, "mittel" wenn berechnet aus Maßketten, "niedrig" wenn unklar.

Antworte ausschließlich mit reinem JSON ohne Erklärung.`;

/** Analysiert Grundrisse (PDF/Bild) mit dem KI-Gateway und liefert m², Räume, Etagen. */
export async function extractFloorplan(
  dataUrl: string,
  mimeType: string,
): Promise<ScannedFloorplan> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("KI-Dienst ist nicht konfiguriert.");

  const task =
    "Lies dieses Dokument systematisch aus: Zoome gedanklich auf jede Tabelle, jedes Raumbuch, jeden Raumstempel " +
    "und jede Beschriftung (Raumnummer, Raumname, m²-Angabe). Liste jeden gefundenen Raum einzeln in rooms_detail auf " +
    "und leite Gesamtfläche, Raumanzahl und Etagen ausschließlich aus diesen abgelesenen Angaben ab. " +
    "Wenn im Dokument keine Flächenangaben stehen, gib 0 zurück statt zu schätzen.";

  const content =
    mimeType === "application/pdf"
      ? [
          { type: "text", text: task },
          { type: "file", file: { filename: "grundriss.pdf", file_data: dataUrl } },
        ]
      : [
          { type: "text", text: task },
          { type: "image_url", image_url: { url: dataUrl } },
        ];

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      temperature: 0,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "grundriss",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              source: { type: "string", enum: ["tabelle", "raumstempel", "massketten", "keine_angabe"] },
              rooms_detail: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    label: { type: "string" },
                    sqm: { type: "number" },
                  },
                  required: ["label", "sqm"],
                },
              },
              sqm: { type: "number" },
              rooms: { type: "number" },
              floors: { type: "number" },
              estimated: { type: "boolean" },
              confidence: { type: "string", enum: ["hoch", "mittel", "niedrig"] },
              note: { type: "string" },
            },
            required: ["source", "rooms_detail", "sqm", "rooms", "floors", "estimated", "confidence", "note"],
          },
        },
      },
    }),
  });

  if (res.status === 429) throw new Error("KI-Limit erreicht. Bitte später erneut versuchen.");
  if (res.status === 402) throw new Error("KI-Guthaben aufgebraucht.");
  if (!res.ok) throw new Error(`Grundriss konnte nicht analysiert werden (${res.status}).`);

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

  const detail = Array.isArray(parsed["rooms_detail"])
    ? (parsed["rooms_detail"] as { label?: unknown; sqm?: unknown }[])
    : [];
  const detailSum = detail.reduce((sum, r) => sum + Math.max(0, num(r?.sqm)), 0);

  let sqm = Math.max(0, Math.round(num(parsed["sqm"])));
  // Bevorzuge die Summe der einzeln ausgelesenen Räume, wenn sie deutlich abweicht.
  if (detailSum > 0 && (sqm === 0 || Math.abs(detailSum - sqm) / Math.max(detailSum, sqm) > 0.15)) {
    sqm = Math.round(detailSum);
  }

  let rooms = Math.max(0, Math.round(num(parsed["rooms"])));
  const namedRooms = detail.filter((r) => String(r?.label ?? "").trim().length > 0).length;
  if (namedRooms > rooms) rooms = namedRooms;

  const floors = Math.max(0, Math.round(num(parsed["floors"])));

  const source = String(parsed["source"] ?? "");
  const confidence = String(parsed["confidence"] ?? "");
  const estimated = parsed["estimated"] === true;

  const parts: string[] = [];
  const baseNote = String(parsed["note"] ?? "").trim();
  if (baseNote) parts.push(baseNote);
  if (detail.length > 0) {
    const list = detail
      .slice(0, 25)
      .map((r) => `${String(r?.label ?? "Raum").trim()}${num(r?.sqm) > 0 ? `: ${num(r?.sqm)} m²` : ""}`)
      .join(", ");
    parts.push(`Erkannte Räume: ${list}${detail.length > 25 ? " …" : ""}`);
  }
  if (source === "keine_angabe" || (sqm === 0 && rooms === 0)) {
    parts.push("Im Dokument wurden keine eindeutigen Flächenangaben gefunden – bitte manuell eintragen.");
  } else if (estimated || confidence === "niedrig") {
    parts.push("Achtung: Werte wurden aus Maßketten berechnet bzw. sind unsicher – bitte prüfen.");
  } else if (confidence) {
    parts.push(`Genauigkeit: ${confidence} (Quelle: ${source || "unbekannt"}).`);
  }

  return {
    sqm,
    rooms,
    floors,
    note: parts.join(" · "),
  };
}
