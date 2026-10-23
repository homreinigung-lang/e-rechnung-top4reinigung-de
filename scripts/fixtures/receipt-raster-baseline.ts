// Frozen implementation from main 1fd064d2, for regression measurement only.
import type { Quad } from "../../src/lib/receipt-corners";
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
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

export function baselineWarp(
  source: { data: Uint8ClampedArray; width: number; height: number },
  quad: Quad,
  outWidth: number,
  outHeight: number,
): Uint8ClampedArray {
  const output = new Uint8ClampedArray(outWidth * outHeight * 4);
  const src = source.data;
  const dst = output;
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
