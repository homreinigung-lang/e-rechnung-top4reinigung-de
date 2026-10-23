import { perspectiveWarp } from "./receipt-raster";
import { detectReceiptCorners, validReceiptQuad, type Quad } from "./receipt-corners";

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

export type ReceiptScanDraft = {
  name: string;
  source: ImageData;
  preview: string;
  corners: Quad;
  detected: boolean;
};

async function warpOffThread(source: ImageData, corners: Quad, width: number, height: number) {
  if (typeof Worker !== "undefined") {
    let worker: Worker | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      worker = new Worker(new URL("./receipt-raster.worker.ts", import.meta.url), {
        type: "module",
      });
      return await new Promise<Uint8ClampedArray<ArrayBuffer>>((resolve, reject) => {
        timer = setTimeout(() => reject(new Error("Scan worker timed out")), 15_000);
        worker!.onmessage = (event: MessageEvent<Uint8ClampedArray<ArrayBuffer>>) => {
          clearTimeout(timer);
          resolve(event.data);
        };
        worker!.onerror = () => {
          clearTimeout(timer);
          reject(new Error("Scan worker unavailable"));
        };
        worker!.onmessageerror = () => {
          clearTimeout(timer);
          reject(new Error("Scan worker response unavailable"));
        };
        // Keep the original pixels available for manual corner correction.
        const pixels = source.data.slice();
        worker!.postMessage(
          {
            pixels,
            width: source.width,
            height: source.height,
            corners,
            outWidth: width,
            outHeight: height,
          },
          [pixels.buffer],
        );
      });
    } catch {
      // Browsers that block module workers retain the identical local algorithm.
    } finally {
      clearTimeout(timer);
      worker?.terminate();
    }
  }
  // Allow the busy indicator to paint before the compatibility path starts.
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  return perspectiveWarp(source, corners, width, height);
}

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
    return await prepareReceiptCanvas(canvas, file.name);
  } finally {
    bitmap.close();
  }
}

/** Accept the camera pixels directly: no intermediate JPEG encode/decode. */
export async function prepareReceiptCanvas(
  canvas: HTMLCanvasElement,
  name: string,
): Promise<ReceiptScanDraft> {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Bild konnte nicht verarbeitet werden.");
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
    name,
    source: ctx.getImageData(0, 0, canvas.width, canvas.height),
    preview: URL.createObjectURL(await canvasBlob(canvas, 0.9)),
    detected: corners !== null,
    corners: corners ?? [
      { x: 0.05, y: 0.05 },
      { x: 0.95, y: 0.05 },
      { x: 0.95, y: 0.95 },
      { x: 0.05, y: 0.95 },
    ],
  };
}

function canvasBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Scan konnte nicht erstellt werden."))),
      "image/jpeg",
      quality,
    ),
  );
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
  const warped = await warpOffThread(sourceImage, fullQuad, ow, oh);
  const canvas = document.createElement("canvas");
  canvas.width = ow;
  canvas.height = oh;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Scan konnte nicht erstellt werden.");
  ctx.putImageData(new ImageData(warped, ow, oh), 0, 0);
  const blob = await canvasBlob(canvas, 0.92);
  return new File([blob], scannerFileName(draft.name), {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}
