import { PDFDict, PDFDocument, PDFHexString, PDFName, PDFString } from "pdf-lib";
import regularUrl from "./pdfa-assets/LiberationSans-Regular.ttf?inline&url";
import boldUrl from "./pdfa-assets/LiberationSans-Bold.ttf?inline&url";
import profileUrl from "./pdfa-assets/sRGB.icc?inline&url";
import { fontMetrics } from "./pdfa-assets/metrics";

function assetBytes(dataUrl: string): Uint8Array {
  const encoded = dataUrl.split(",")[1];
  if (!dataUrl.startsWith("data:") || !encoded) throw new Error("PDF/A: Archivressource fehlt.");
  return Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
}

/** Embed metrically compatible fonts without rewriting page content or layout. */
export function preparePdfA3(pdf: PDFDocument): void {
  const descriptors = new Map<string, ReturnType<typeof pdf.context.register>>();
  for (const [, object] of pdf.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFDict) || object.get(PDFName.of("Type")) !== PDFName.of("Font"))
      continue;
    if (object.has(PDFName.of("FontDescriptor"))) continue;
    const base = object.get(PDFName.of("BaseFont"));
    if (base !== PDFName.of("Helvetica") && base !== PDFName.of("Helvetica-Bold")) {
      throw new Error("PDF/A: Nicht unterstützte, nicht eingebettete Schrift.");
    }
    const bold = base === PDFName.of("Helvetica-Bold");
    const metrics = bold ? fontMetrics.bold : fontMetrics.regular;
    let descriptor = descriptors.get(metrics.name);
    if (!descriptor) {
      const bytes = assetBytes(bold ? boldUrl : regularUrl);
      const file = pdf.context.register(pdf.context.flateStream(bytes, { Length1: bytes.length }));
      descriptor = pdf.context.register(
        pdf.context.obj({
          Type: "FontDescriptor",
          FontName: metrics.name,
          Flags: 32,
          FontBBox: [...metrics.bbox],
          ItalicAngle: 0,
          Ascent: metrics.ascent,
          Descent: metrics.descent,
          CapHeight: metrics.capHeight,
          StemV: bold ? 120 : 80,
          FontFile2: file,
        }),
      );
      descriptors.set(metrics.name, descriptor);
    }
    object.set(PDFName.of("Subtype"), PDFName.of("TrueType"));
    object.set(PDFName.of("BaseFont"), PDFName.of(metrics.name));
    object.set(PDFName.of("FontDescriptor"), descriptor);
    object.set(PDFName.of("FirstChar"), pdf.context.obj(32));
    object.set(PDFName.of("LastChar"), pdf.context.obj(255));
    object.set(PDFName.of("Widths"), pdf.context.obj([...metrics.widths]));
  }
  const profile = pdf.context.register(pdf.context.flateStream(assetBytes(profileUrl), { N: 3 }));
  const intent = pdf.context.register(
    pdf.context.obj({
      Type: "OutputIntent",
      S: "GTS_PDFA1",
      OutputConditionIdentifier: PDFString.of("sRGB"),
      Info: PDFString.of("sRGB IEC61966-2.1"),
      DestOutputProfile: profile,
    }),
  );
  pdf.catalog.set(PDFName.of("OutputIntents"), pdf.context.obj([intent]));
  if (!pdf.context.trailerInfo.ID) {
    const id = PDFHexString.of(crypto.randomUUID().replace(/-/g, ""));
    pdf.context.trailerInfo.ID = pdf.context.obj([id, id]);
  }
}
