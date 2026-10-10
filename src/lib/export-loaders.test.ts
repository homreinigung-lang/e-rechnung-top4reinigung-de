import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";
import { mergePdfs } from "./pdf";
import { buildXlsx } from "./xlsx";

describe("on-demand export libraries", () => {
  it("merges PDFs with every page in the original order", async () => {
    const first = await PDFDocument.create();
    first.addPage([100, 200]);
    const second = await PDFDocument.create();
    second.addPage([300, 400]);
    second.addPage([500, 600]);
    const merged = await PDFDocument.load(await mergePdfs([await first.save(), await second.save()]));
    expect(merged.getPages().map((page) => [page.getWidth(), page.getHeight()])).toEqual([
      [100, 200], [300, 400], [500, 600],
    ]);
  });

  it("produces a valid Excel archive with escaped text and numeric cells", async () => {
    const blob = await buildXlsx([{ name: "Einsatzplan", rows: [{ Mitarbeiter: "A & B", Stunden: 7.5 }] }]);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(zip.file("[Content_Types].xml")).not.toBeNull();
    const sheet = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
    expect(sheet).toContain("A &amp; B");
    expect(sheet).toContain("<v>7.5</v>");
  });
});
