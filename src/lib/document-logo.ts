import type { PdfDocData } from "@/lib/invoice-pdf";

/** Lädt ein optionales Firmenlogo für die PDF-Erzeugung. */
export async function loadDocumentLogo(logoSrc: string): Promise<PdfDocData["logo"]> {
  if (!logoSrc) return null;
  try {
    const response = await fetch(logoSrc);
    if (!response.ok) return null;
    const blob = await response.blob();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const isJpg = /jpe?g/i.test(blob.type) || bytes[0] === 0xff;
    return { bytes, type: isJpg ? "jpg" : "png" };
  } catch {
    return null;
  }
}
