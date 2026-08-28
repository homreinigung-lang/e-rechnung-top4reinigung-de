import { LV_FIELD_MAP } from "./fields";
import { formatCents, formatGermanNumber } from "./number";
import type { LvDerived, LvFieldKey, LvInputs, LvMarker } from "./types";

/** Anzeigewert einer Kennzahl (ohne Einheit) in deutscher Schreibweise. */
export function fieldValueText(
  key: LvFieldKey,
  inputs: LvInputs,
  derived: LvDerived,
): string {
  switch (key) {
    case "unterhalt_pauschale_monat":
      return formatCents(inputs.unterhalt_pauschale_monat);
    case "grund_pauschale_jahr":
      return formatCents(inputs.grund_pauschale_jahr);
    case "sonder_stundensatz":
      return formatCents(inputs.sonder_stundensatz);
    case "unterhalt_stunden_monat":
      return formatGermanNumber(inputs.unterhalt_stunden_monat);
    case "grund_stunden_jahr":
      return formatGermanNumber(inputs.grund_stunden_jahr);
    case "sonder_kontingent":
      return formatGermanNumber(inputs.sonder_kontingent);
    case "mwst_satz":
      return formatGermanNumber(inputs.mwst_satz);
    case "unterhalt_wertung":
      return formatCents(derived.unterhalt_wertung);
    case "grund_wertung":
      return formatCents(derived.grund_wertung);
    case "sonder_wertung":
      return formatCents(derived.sonder_wertung);
    case "jahr_netto":
      return formatCents(derived.jahr_netto);
    case "mwst_betrag":
      return formatCents(derived.mwst_betrag);
    case "jahr_brutto":
      return formatCents(derived.jahr_brutto);
    default:
      return "";
  }
}

/** Füllt ein echtes AcroForm-PDF aus (Zuordnung Feldname -> Kennzahl). */
export async function fillAcroForm(
  file: File,
  mapping: Record<string, LvFieldKey | null>,
  inputs: LvInputs,
  derived: LvDerived,
): Promise<Uint8Array> {
  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.load(new Uint8Array(await file.arrayBuffer()), {
    ignoreEncryption: true,
  });
  const form = doc.getForm();
  for (const [name, key] of Object.entries(mapping)) {
    if (!key) continue;
    try {
      form.getTextField(name).setText(fieldValueText(key, inputs, derived));
    } catch {
      // Feldtyp nicht beschreibbar – wird übersprungen
    }
  }
  form.flatten();
  return doc.save();
}

/** Druckt die bestätigten Werte an den geprüften Positionen in ein flaches PDF. */
export async function fillFlatPdf(
  file: File,
  markers: LvMarker[],
  inputs: LvInputs,
  derived: LvDerived,
): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.load(new Uint8Array(await file.arrayBuffer()), {
    ignoreEncryption: true,
  });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();

  for (const marker of markers) {
    if (!marker.key) continue;
    const page = pages[marker.pageIndex];
    if (!page) continue;
    const meta = LV_FIELD_MAP.get(marker.key);
    const text = fieldValueText(marker.key, inputs, derived);
    if (!text) continue;
    const size = marker.fontSize || 10;
    page.drawText(text, {
      x: marker.x,
      y: marker.y,
      size,
      font,
      color: rgb(0, 0, 0),
    });
    void meta;
  }

  return doc.save();
}
