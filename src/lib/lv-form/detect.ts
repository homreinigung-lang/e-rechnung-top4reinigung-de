import { LV_FIELDS } from "./fields";
import { parseGermanNumber } from "./number";
import type {
  Confidence,
  LvAcroField,
  LvConstraint,
  LvDetection,
  LvFieldKey,
  LvMarker,
  LvPageInfo,
} from "./types";

/**
 * Erkennung von Formularfeldern in LV-PDFs.
 * Läuft ausschließlich im Browser (pdfjs + pdf-lib werden dynamisch geladen).
 */

type TextPiece = { text: string; x: number; y: number; width: number; height: number };
type TextLine = { text: string; pieces: TextPiece[]; y: number; height: number };

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/ß/g, "ss");
}

/** Ordnet einer Textzeile bzw. einem Feldnamen eine Kennzahl zu. */
export function classifyLabel(label: string): { key: LvFieldKey | null; confidence: Confidence } {
  const text = normalize(label);
  let best: { key: LvFieldKey; score: number } | null = null;
  for (const field of LV_FIELDS) {
    for (const group of field.keywords) {
      if (group.every((word) => text.includes(normalize(word)))) {
        const score = group.join("").length;
        if (!best || score > best.score) best = { key: field.key, score };
      }
    }
  }
  if (!best) return { key: null, confidence: "low" };
  return { key: best.key, confidence: best.score >= 12 ? "high" : "medium" };
}

function groupLines(pieces: TextPiece[]): TextLine[] {
  const sorted = [...pieces].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: TextLine[] = [];
  for (const piece of sorted) {
    const tolerance = Math.max(2, piece.height * 0.6);
    const line = lines.find((l) => Math.abs(l.y - piece.y) <= tolerance);
    if (line) {
      line.pieces.push(piece);
      line.height = Math.max(line.height, piece.height);
    } else {
      lines.push({ text: "", pieces: [piece], y: piece.y, height: piece.height });
    }
  }
  for (const line of lines) {
    line.pieces.sort((a, b) => a.x - b.x);
    line.text = line.pieces
      .map((p) => p.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }
  return lines;
}

/** Vorgaben aus dem Fließtext (Mindeststunden, Kontingente, MwSt-Satz). */
function extractConstraints(lines: TextLine[], pageIndex: number): LvConstraint[] {
  const found: LvConstraint[] = [];
  for (const line of lines) {
    const text = normalize(line.text);
    const num = (re: RegExp) => {
      const m = line.text.match(re);
      return m ? parseGermanNumber(m[1]!) : null;
    };
    if (text.includes("mindest")) {
      const perMonth = num(/([\d.]+,?\d*)\s*(?:std|stunden)[^\n]{0,20}?monat/i);
      if (perMonth !== null) {
        found.push({
          kind: "min_hours_month",
          value: perMonth,
          pageIndex,
          sourceLine: line.text,
        });
        continue;
      }
      const perYear = num(/([\d.]+,?\d*)\s*(?:std|stunden)[^\n]{0,20}?(?:jahr|jahrlich)/i);
      if (perYear !== null) {
        found.push({ kind: "min_hours_year", value: perYear, pageIndex, sourceLine: line.text });
        continue;
      }
    }
    if (text.includes("fiktiv") || text.includes("kontingent")) {
      const quota = num(/([\d.]+,?\d*)\s*(?:std|stunden)/i);
      if (quota !== null) {
        found.push({ kind: "fixed_quota_year", value: quota, pageIndex, sourceLine: line.text });
      }
    }
    const vat = line.text.match(/(\d{1,2}(?:,\d+)?)\s*%/);
    if (vat && (text.includes("mwst") || text.includes("mehrwertsteuer") || text.includes("ust"))) {
      const value = parseGermanNumber(vat[1]!);
      if (value !== null) {
        found.push({ kind: "vat_rate", value, pageIndex, sourceLine: line.text });
      }
    }
  }
  return found;
}

/** Findet Unterstrich-Platzhalter und ordnet sie dem Label links davon zu. */
function findFlatMarkers(lines: TextLine[], pageIndex: number): LvMarker[] {
  const markers: LvMarker[] = [];
  for (const line of lines) {
    if (!/_{3,}/.test(line.text)) continue;
    const placeholders = line.pieces.filter((p) => /_{3,}/.test(p.text));
    if (placeholders.length === 0) continue;
    const label = line.pieces
      .filter((p) => !/_{3,}/.test(p.text))
      .map((p) => p.text)
      .join(" ")
      .trim();
    const { key, confidence } = classifyLabel(label || line.text);
    placeholders.forEach((placeholder, i) => {
      markers.push({
        id: `p${pageIndex}-${Math.round(placeholder.x)}-${Math.round(placeholder.y)}-${i}`,
        key: i === 0 ? key : null,
        pageIndex,
        x: placeholder.x + 2,
        y: placeholder.y + Math.max(1, placeholder.height * 0.2),
        width: placeholder.width,
        fontSize: Math.max(8, Math.min(12, placeholder.height || 10)),
        confidence: i === 0 ? confidence : "low",
        sourceLine: line.text,
        manual: false,
      });
    });
  }
  return markers;
}

async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs;
}

async function readAcroFields(bytes: Uint8Array): Promise<LvAcroField[]> {
  try {
    const { PDFDocument } = await import("pdf-lib");
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const form = doc.getForm();
    return form.getFields().map((f) => {
      const name = f.getName();
      return { name, suggestedKey: classifyLabel(name).key };
    });
  } catch {
    return [];
  }
}

/** Analysiert ein hochgeladenes LV-PDF und liefert Vorschläge – ohne jede Ausgabe. */
export async function detectLvForm(file: File): Promise<LvDetection> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const acroFields = await readAcroFields(bytes);
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;

  const pages: LvPageInfo[] = [];
  const markers: LvMarker[] = [];
  const constraints: LvConstraint[] = [];
  let textPieces = 0;

  for (let i = 0; i < doc.numPages; i++) {
    const page = await doc.getPage(i + 1);
    const viewport = page.getViewport({ scale: 1 });
    const scale = Math.min(2, 1100 / viewport.width);
    const rendered = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(rendered.width);
    canvas.height = Math.floor(rendered.height);
    const context = canvas.getContext("2d");
    if (context) {
      await page.render({ canvas, canvasContext: context, viewport: rendered }).promise;
    }

    const content = await page.getTextContent();
    const pieces: TextPiece[] = [];
    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      const transform = item.transform as number[];
      pieces.push({
        text: item.str,
        x: transform[4] ?? 0,
        y: transform[5] ?? 0,
        width: item.width ?? 0,
        height: item.height || Math.abs(transform[3] ?? 10),
      });
    }
    textPieces += pieces.length;
    const lines = groupLines(pieces);
    markers.push(...findFlatMarkers(lines, i));
    constraints.push(...extractConstraints(lines, i));

    pages.push({
      index: i,
      width: viewport.width,
      height: viewport.height,
      imageDataUrl: canvas.toDataURL("image/png"),
      imageWidth: canvas.width,
      imageHeight: canvas.height,
    });
  }

  return {
    type: acroFields.length > 0 ? "acroform" : "flat",
    pages,
    markers,
    constraints,
    acroFields,
    scanned: textPieces === 0,
  };
}
