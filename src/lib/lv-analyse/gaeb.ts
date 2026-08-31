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

export type GaebResult = { text: string; rows: string[][]; itemCount: number };

/** Wandelt einen GAEB-Dateiinhalt in Textzeilen und Tabellenzeilen um. */
export function parseGaeb(content: string): GaebResult {
  const rows: string[][] = [["Position", "Beschreibung", "Menge", "Einheit", "Einheitspreis"]];
  const lines: string[] = ["--- Seite 1 ---"];

  if (/<GAEB[\s>]/i.test(content) || /<Award[\s>]/i.test(content)) {
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
    return { text: lines.join("\n"), rows, itemCount: rows.length - 1 };
  }

  // Flache GAEB-90-Datei: Datensätze beginnen mit einem Satzartkennzeichen.
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;
    const cleaned = line.replace(/\s{2,}/g, " | ").trim();
    lines.push(cleaned);
    const parts = cleaned.split(" | ").map((p) => p.trim());
    if (parts.length >= 3)
      rows.push([
        parts[0] ?? "",
        parts.slice(1, -2).join(" "),
        parts.at(-2) ?? "",
        parts.at(-1) ?? "",
        "",
      ]);
  }
  return { text: lines.join("\n"), rows, itemCount: Math.max(0, rows.length - 1) };
}
