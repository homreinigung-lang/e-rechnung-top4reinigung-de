import { detectReceiptCorners, validReceiptQuad, type Quad } from "./receipt-corners";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function scannerFileName(name: string) {
  const base = name.replace(/\.[^.]+$/, "") || "beleg";
  return `${base}-scan.jpg`;
}

async function decodeImage(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return await createImageBitmap(file);
  }
}

function distance(a: Quad[number], b: Quad[number]) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function squareToQuadHomography([tl, tr, br, bl]: Quad) {
  const dx1 = tr.x - br.x;
  const dx2 = bl.x - br.x;
  const dx3 = tl.x - tr.x + br.x - bl.x;
  const dy1 = tr.y - br.y;
  const dy2 = bl.y - br.y;
  const dy3 = tl.y - tr.y + br.y - bl.y;
  const den = dx1 * dy2 - dx2 * dy1;

  if (Math.abs(den) < 1e-6) {
    return {
      a: tr.x - tl.x,
      b: bl.x - tl.x,
      c: tl.x,
      d: tr.y - tl.y,
      e: bl.y - tl.y,
      f: tl.y,
      g: 0,
      h: 0,
    };
  }

  const g = (dx3 * dy2 - dx2 * dy3) / den;
  const h = (dx1 * dy3 - dx3 * dy1) / den;

  return {
    a: tr.x - tl.x + g * tr.x,
    b: bl.x - tl.x + h * bl.x,
    c: tl.x,
    d: tr.y - tl.y + g * tr.y,
    e: bl.y - tl.y + h * bl.y,
    f: tl.y,
    g,
    h,
  };
}

function applyScanLook(value: number) {
  const contrasted = (value - 128) * 1.28 + 128;
  return clamp(Math.round(contrasted * 1.06), 0, 255);
}

function perspectiveWarp(
  source: ImageData,
  quad: Quad,
  outWidth: number,
  outHeight: number,
): ImageData {
  const output = new ImageData(outWidth, outHeight);
  const src = source.data;
  const dst = output.data;
  const sw = source.width;
  const sh = source.height;
  const h = squareToQuadHomography(quad);

  for (let y = 0; y < outHeight; y++) {
    const v = outHeight <= 1 ? 0 : y / (outHeight - 1);
    for (let x = 0; x < outWidth; x++) {
      const u = outWidth <= 1 ? 0 : x / (outWidth - 1);
      const den = h.g * u + h.h * v + 1;
      const sx = clamp((h.a * u + h.b * v + h.c) / den, 0, sw - 1);
      const sy = clamp((h.d * u + h.e * v + h.f) / den, 0, sh - 1);

      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = Math.min(sw - 1, x0 + 1);
      const y1 = Math.min(sh - 1, y0 + 1);
      const tx = sx - x0;
      const ty = sy - y0;

      const i00 = (y0 * sw + x0) * 4;
      const i10 = (y0 * sw + x1) * 4;
      const i01 = (y1 * sw + x0) * 4;
      const i11 = (y1 * sw + x1) * 4;

      const sample = (channel: number) => {
        const top = (src[i00 + channel] ?? 0) * (1 - tx) + (src[i10 + channel] ?? 0) * tx;
        const bottom = (src[i01 + channel] ?? 0) * (1 - tx) + (src[i11 + channel] ?? 0) * tx;
        return top * (1 - ty) + bottom * ty;
      };

      const r = sample(0);
      const g = sample(1);
      const b = sample(2);
      const gray = applyScanLook(0.2126 * r + 0.7152 * g + 0.0722 * b);
      const di = (y * outWidth + x) * 4;
      dst[di] = gray;
      dst[di + 1] = gray;
      dst[di + 2] = gray;
      dst[di + 3] = 255;
    }
  }

  return output;
}

export type ReceiptScanDraft = {
  name: string;
  source: ImageData;
  preview: string;
  corners: Quad;
  detected: boolean;
};

/** Local preparation only. The caller must show corners before uploading. */
export async function prepareReceiptScan(file: File): Promise<ReceiptScanDraft> {
  const bitmap = await decodeImage(file);
  try {
    // Bound memory before getImageData (phone photos can exceed 40 megapixels).
    const scale = Math.min(1, 2600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Bild konnte nicht verarbeitet werden.");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const analysis = document.createElement("canvas");
    const ratio = Math.min(1, 600 / Math.max(canvas.width, canvas.height));
    analysis.width = Math.max(1, Math.round(canvas.width * ratio));
    analysis.height = Math.max(1, Math.round(canvas.height * ratio));
    const actx = analysis.getContext("2d", { willReadFrequently: true });
    if (!actx) throw new Error("Belegkanten konnten nicht geprüft werden.");
    actx.drawImage(canvas, 0, 0, analysis.width, analysis.height);
    const image = actx.getImageData(0, 0, analysis.width, analysis.height);
    const corners = detectReceiptCorners(image.data, image.width, image.height);
    return {
      name: file.name,
      source: ctx.getImageData(0, 0, canvas.width, canvas.height),
      preview: canvas.toDataURL("image/jpeg", 0.9),
      detected: corners !== null,
      corners: corners ?? [
        { x: 0.05, y: 0.05 },
        { x: 0.95, y: 0.05 },
        { x: 0.95, y: 0.95 },
        { x: 0.05, y: 0.95 },
      ],
    };
  } finally {
    bitmap.close();
  }
}

export async function finishReceiptScan(draft: ReceiptScanDraft, corners: Quad): Promise<File> {
  if (!validReceiptQuad(corners))
    throw new Error("Bitte die vier Ecken entlang der Papierkanten setzen.");
  const sourceImage = draft.source;
  const fullQuad = corners.map((p) => ({
    x: p.x * (sourceImage.width - 1),
    y: p.y * (sourceImage.height - 1),
  })) as unknown as Quad;
  const [tl, tr, br, bl] = fullQuad;
  const targetWidth = Math.max(distance(tl, tr), distance(bl, br));
  const targetHeight = Math.max(distance(tl, bl), distance(tr, br));
  const scale = Math.min(1, 2200 / Math.max(targetWidth, targetHeight));
  const ow = Math.max(1, Math.round(targetWidth * scale));
  const oh = Math.max(1, Math.round(targetHeight * scale));
  const warped = perspectiveWarp(sourceImage, fullQuad, ow, oh);
  const canvas = document.createElement("canvas");
  canvas.width = ow;
  canvas.height = oh;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Scan konnte nicht erstellt werden.");
  ctx.putImageData(warped, 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (result) =>
        result ? resolve(result) : reject(new Error("Scan konnte nicht erstellt werden.")),
      "image/jpeg",
      0.92,
    ),
  );
  return new File([blob], scannerFileName(draft.name), {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}
