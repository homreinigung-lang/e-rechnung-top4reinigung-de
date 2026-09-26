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

/**
 * Bereitet ein Kamera-Foto wie einen Dokumentenscan auf:
 * - erkennt grob den Beleg gegenüber dem Hintergrund und beschneidet ihn,
 * - richtet Hoch-/Querformat anhand des erkannten Belegs aus,
 * - erhöht Kontrast und reduziert Farbstiche für bessere Lesbarkeit.
 *
 * Die Erkennung ist bewusst vollständig lokal im Browser und verändert nie
 * die Originaldatei. Wenn keine sichere Dokumentgrenze erkannt wird, wird
 * nur die Scan-Aufbereitung auf das vollständige Bild angewendet.
 */
export async function scanReceiptImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  const bitmap = await decodeImage(file);
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
  const pixels = actx.getImageData(0, 0, aw, ah).data;

  const cornerSize = Math.max(4, Math.round(Math.min(aw, ah) * 0.06));
  const corners = [
    [0, 0],
    [aw - cornerSize, 0],
    [0, ah - cornerSize],
    [aw - cornerSize, ah - cornerSize],
  ] as const;

  let br = 0;
  let bg = 0;
  let bb = 0;
  let bc = 0;
  for (const [sx, sy] of corners) {
    for (let y = sy; y < sy + cornerSize; y += 3) {
      for (let x = sx; x < sx + cornerSize; x += 3) {
        const i = (y * aw + x) * 4;
        br += pixels[i] ?? 0;
        bg += pixels[i + 1] ?? 0;
        bb += pixels[i + 2] ?? 0;
        bc++;
      }
    }
  }
  br /= bc;
  bg /= bc;
  bb /= bc;

  let minX = aw;
  let minY = ah;
  let maxX = -1;
  let maxY = -1;
  const step = Math.max(2, Math.round(Math.max(aw, ah) / 450));
  const threshold = 34;

  for (let y = 0; y < ah; y += step) {
    for (let x = 0; x < aw; x += step) {
      const i = (y * aw + x) * 4;
      const r = pixels[i] ?? 0;
      const g = pixels[i + 1] ?? 0;
      const b = pixels[i + 2] ?? 0;
      const distance = Math.sqrt((r - br) ** 2 + (g - bg) ** 2 + (b - bb) ** 2);
      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const bgLuminance = 0.2126 * br + 0.7152 * bg + 0.0722 * bb;
      if (distance > threshold || Math.abs(luminance - bgLuminance) > 42) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  const detected =
    maxX > minX &&
    maxY > minY &&
    (maxX - minX) * (maxY - minY) > aw * ah * 0.22;

  let sx = 0;
  let sy = 0;
  let sw = bitmap.width;
  let sh = bitmap.height;

  if (detected) {
    const margin = Math.round(Math.min(aw, ah) * 0.025);
    const x1 = clamp(minX - margin, 0, aw);
    const y1 = clamp(minY - margin, 0, ah);
    const x2 = clamp(maxX + margin, 0, aw);
    const y2 = clamp(maxY + margin, 0, ah);
    sx = Math.round(x1 / analyzeScale);
    sy = Math.round(y1 / analyzeScale);
    sw = Math.max(1, Math.round((x2 - x1) / analyzeScale));
    sh = Math.max(1, Math.round((y2 - y1) / analyzeScale));
  }

  const maxOutput = 2400;
  const outputScale = Math.min(1, maxOutput / Math.max(sw, sh));
  const ow = Math.max(1, Math.round(sw * outputScale));
  const oh = Math.max(1, Math.round(sh * outputScale));

  const canvas = document.createElement("canvas");
  canvas.width = ow;
  canvas.height = oh;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }

  ctx.filter = "grayscale(100%) contrast(128%) brightness(106%)";
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, ow, oh);
  ctx.filter = "none";
  bitmap.close();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error("Scan konnte nicht erstellt werden."))),
      "image/jpeg",
      0.92,
    );
  });

  return new File([blob], scannerFileName(file.name), {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}
