import { expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { fontMetrics } from "./pdfa-assets/metrics";

it.each(["regular", "bold"] as const)(
  "preserves the existing Helvetica %s advance widths",
  async (style) => {
    const pdf = await PDFDocument.create();
    const existing = await pdf.embedFont(
      style === "bold" ? StandardFonts.HelveticaBold : StandardFonts.Helvetica,
    );
    for (let code = 32; code < 127; code++) {
      expect(fontMetrics[style].widths[code - 32]).toBe(
        existing.widthOfTextAtSize(String.fromCharCode(code), 1000),
      );
    }
  },
);
