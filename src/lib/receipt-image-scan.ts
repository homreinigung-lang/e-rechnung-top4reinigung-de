type Point = { x: number; y: number };

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

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function polygonArea(points: readonly Point[]) {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

function detectDocumentQuad(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): Point[] | null {
  const cornerSize = Math.max(4, Math.round(Math.min(width, height) * 0.06));
  const sampleCorners = [
    [0, 0],
    [width - cornerSize, 0],
    [0, height - cornerSize],
    [width - cornerSize, height - cornerSize],
  ] as const;

  let br = 0;
  let bg = 0;
  let bb = 0;
  let count = 0;

  for (const [sx, sy] of sampleCorners) {
    for (let y = sy; y < sy + cornerSize; y += 3) {
      for (let x = sx; x < sx + cornerSize; x += 3) {
        const i = (y * width + x) * 4;
        br += pixels[i] ?? 0;
        bg += pixels[i + 1] ?? 0;
        bb += pixels[i + 2] ?? 0;
        count++;
      }
    }
  }

  if (!count) return null;
  br /= count;
  bg /= count;
  bb /= count;
  const bgLum = 0.2126 * br + 0.7152 * bg + 0.0722 * bb;

  const step = Math.max(2, Math.round(Math.max(width, height) / 450));
  const candidates: Point[] = [];

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      const r = pixels[i] ?? 0;
      const g = pixels[i + 1] ?? 0;
      const b = pixels[i + 2] ?? 0;
      const colorDistance = Math.sqrt((r - br) ** 2 + (g - bg) ** 2 + (b - bb) ** 2);
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;

      if (colorDistance > 34 || Math.abs(lum - bgLum) > 42) {
        candidates.push({ x, y });
      }
    }
  }

  if (candidates.length < 40) return null;

  let tl = candidates[0]!;
  let tr = candidates[0]!;
  let brp = candidates[0]!;
  let bl = candidates[0]!;

  for (const p of candidates) {
    if (p.x + p.y < tl.x + tl.y) tl = p;
    if (p.x - p.y > tr.x - tr.y) tr = p;
    if (p.x + p.y > brp.x + brp.y) brp = p;
    if (p.y - p.x > bl.y - bl.x) bl = p;
  }

  const quad = [tl, tr, brp, bl];
  const area = polygonArea(quad);
  if (area < width * height * 0.22) return null;

  const minSide = Math.min(
    distance(tl, tr),
    distance(tr, brp),
    distance(brp, bl),
    distance(bl, tl),
  );
  if (minSide < Math.min(width, height) * 0.22) return null;

  return quad;
}

function squareToQuadHomography([tl, tr, br, bl]: readonly Point[]) {
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
  quad: readonly Point[],
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

/**
 * Bereitet ein Kamera-Foto wie einen Dokumentenscan auf:
 * - erkennt die vier Belegecken,
 * - entzerrt schräg fotografierte Belege per Perspektivtransformation,
 * - verbessert Kontrast und Lesbarkeit,
 * - fällt bei unsicherer Erkennung auf eine sichere Ganzbild-Aufbereitung zurück.
 *
 * Die Verarbeitung läuft lokal im Browser. Die Originaldatei wird nicht verändert.
 */
export async function scanReceiptImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  const bitmap = await decodeImage(file);

  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = bitmap.width;
  sourceCanvas.height = bitmap.height;
  const sourceCtx = sourceCanvas.getContext("2d", { willReadFrequently: true });
  if (!sourceCtx) {
    bitmap.close();
    return file;
  }
  sourceCtx.drawImage(bitmap, 0, 0);
  const sourceImage = sourceCtx.getImageData(0, 0, bitmap.width, bitmap.height);

  const maxAnalyze = 900;
  const analyzeScale = Math.min(1, maxAnalyze / Math.max(bitmap.width, bitmap.height));
  const aw = Math.max(1, Math.round(bitmap.width * analyzeScale));
  const ah = Math.max(1, Math.round(bitmap.height * analyzeScale));

  const analysis = document.createElement("canvas");
  analysis.width = aw;
  analysis.height = ah;
  const actx = analysis.getContext("2d", { willReadFrequently: true });
  if (!actx) {
    bitmap.close();
    return file;
  }
  actx.drawImage(bitmap, 0, 0, aw, ah);
  const analysisImage = actx.getImageData(0, 0, aw, ah);
  const detectedQuad = detectDocumentQuad(analysisImage.data, aw, ah);

  const fullQuad: Point[] = detectedQuad
    ? detectedQuad.map((p) => ({ x: p.x / analyzeScale, y: p.y / analyzeScale }))
    : [
        { x: 0, y: 0 },
        { x: bitmap.width - 1, y: 0 },
        { x: bitmap.width - 1, y: bitmap.height - 1 },
        { x: 0, y: bitmap.height - 1 },
      ];

  const [tl, tr, br, bl] = fullQuad;
  const targetWidth = Math.max(distance(tl!, tr!), distance(bl!, br!));
  const targetHeight = Math.max(distance(tl!, bl!), distance(tr!, br!));
  const maxOutput = 2200;
  const outputScale = Math.min(1, maxOutput / Math.max(targetWidth, targetHeight));
  const ow = Math.max(1, Math.round(targetWidth * outputScale));
  const oh = Math.max(1, Math.round(targetHeight * outputScale));

  const warped = perspectiveWarp(sourceImage, fullQuad, ow, oh);
  bitmap.close();

  const canvas = document.createElement("canvas");
  canvas.width = ow;
  canvas.height = oh;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.putImageData(warped, 0, 0);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) =>
        result ? resolve(result) : reject(new Error("Scan konnte nicht erstellt werden.")),
      "image/jpeg",
      0.92,
    );
  });

  return new File([blob], scannerFileName(file.name), {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}
