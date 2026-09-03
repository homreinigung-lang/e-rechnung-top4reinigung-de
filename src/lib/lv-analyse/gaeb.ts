/**
 * Minimaler GAEB-Leser (GAEB XML 3.x sowie flache D8x/X8x-Austauschdateien).
 * Ziel ist eine lesbare Textform, die anschließend wie ein LV analysiert wird.
 */

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function tag(xml: string, name: string): string {
  const m = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i").exec(xml);
  return m ? decodeXml((m[1] ?? "").replace(/<[^>]+>/g, " ")) : "";
}

export type GaebResult = {
  text: string;
  rows: string[][];
  itemCount: number;
  /** Hinweise, wenn die Datei nur eingeschränkt gelesen werden konnte. */
  warnings: string[];
};

/** Satzart am Zeilenanfang einer flachen GAEB-90-Datei (z. B. „21“, „25“). */
const GAEB90_RECORD = /^(\d{2})[\s\S]/;
/** Zahl im deutschen oder englischen Format. */
const NUMERIC = /^-?[\d.]*\d(?:[.,]\d+)?$/;

/** Wandelt einen GAEB-Dateiinhalt in Textzeilen und Tabellenzeilen um. */
export function parseGaeb(content: string): GaebResult {
  const rows: string[][] = [["Position", "Beschreibung", "Menge", "Einheit", "Einheitspreis"]];
  const lines: string[] = ["--- Seite 1 ---"];
  const warnings: string[] = [];

  if (/<GAEB[\s>]/i.test(content) || /<Award[\s>]/i.test(content) || /<BoQ[\s>]/i.test(content)) {
    const blocks = content.match(/<Item[\s>][\s\S]*?<\/Item>/gi) ?? [];
    for (const block of blocks) {
      const number = tag(block, "RNoPart") || tag(block, "RNoFull") || tag(block, "ID");
      const description =
        tag(block, "OutlTxt") ||
        tag(block, "DetailTxt") ||
        tag(block, "Description") ||
        tag(block, "TextComplete");
      const qty = tag(block, "Qty");
      const unit = tag(block, "QU");
      const price = tag(block, "UP") || tag(block, "UPComp");
      if (!description && !number) continue;
      rows.push([number, description, qty, unit, price]);
      lines.push([number, description, qty, unit, price].filter(Boolean).join(" | "));
    }
    if (rows.length === 1)
      warnings.push("GAEB-XML gelesen, es waren jedoch keine <Item>-Positionen enthalten.");
    return { text: lines.join("\n"), rows, itemCount: rows.length - 1, warnings };
  }

  // Flache GAEB-90-Datei: Datensätze beginnen mit einem Satzartkennzeichen.
  // Nur Zeilen mit Satzart UND plausibler Menge werden als Position gewertet –
  // sonst entstünden Pseudopositionen, die einen Erfolg nur vortäuschen.
  let recordLines = 0;
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;
    const cleaned = line.replace(/\s{2,}/g, " | ").trim();
    lines.push(cleaned);
    if (!GAEB90_RECORD.test(line)) continue;
    recordLines += 1;
    const parts = cleaned
      .split(" | ")
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length < 4) continue;
    const qty = parts.at(-2) ?? "";
    const unit = parts.at(-1) ?? "";
    // Menge muss eine Zahl und die Einheit eine kurze Bezeichnung sein.
    if (!NUMERIC.test(qty) || unit.length > 12) continue;
    rows.push([parts[0] ?? "", parts.slice(1, -2).join(" "), qty, unit, ""]);
  }
  const itemCount = Math.max(0, rows.length - 1);
  if (itemCount === 0) {
    warnings.push(
      recordLines > 0
        ? "Die flache GAEB-Datei enthält keine eindeutig lesbaren Positionen (Menge/Einheit nicht erkennbar)."
        : "Die Datei enthält keine erkennbaren GAEB-Datensätze.",
    );
  }
  return { text: lines.join("\n"), rows, itemCount, warnings };
}

