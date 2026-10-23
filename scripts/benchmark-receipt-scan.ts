// Synthetic, deterministic local benchmark. Does not call AI, Storage or a database.
// Run: bun scripts/benchmark-receipt-scan.ts
import { perspectiveWarp } from "../src/lib/receipt-raster";
import { baselineWarp } from "./fixtures/receipt-raster-baseline";
import type { Quad } from "../src/lib/receipt-corners";

const median = (values: number[]) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
for (const [width, height] of [
  [1200, 1800],
  [1733, 2600],
]) {
  const data = new Uint8ClampedArray(width! * height! * 4);
  for (let i = 0; i < data.length; i++) data[i] = (i * 71 + (i >> 4) * 17) % 256;
  const source = { data, width: width!, height: height! };
  const quad: Quad = [
    { x: 40, y: 20 },
    { x: width! - 25, y: 40 },
    { x: width! - 40, y: height! - 20 },
    { x: 20, y: height! - 35 },
  ];
  const outHeight = Math.min(height!, 2200);
  const outWidth = Math.round((outHeight * width!) / height!);
  const before: number[] = [],
    after: number[] = [];
  let reference = new Uint8ClampedArray(),
    result = new Uint8ClampedArray();
  for (let i = 0; i < 7; i++) {
    // Alternate order to reduce warm-up and thermal bias; exclude first two warm-ups.
    for (const legacy of i % 2 ? [true, false] : [false, true]) {
      const start = performance.now();
      const output = (legacy ? baselineWarp : perspectiveWarp)(source, quad, outWidth, outHeight);
      const elapsed = performance.now() - start;
      if (legacy) reference = output;
      else result = output;
      if (i >= 2) (legacy ? before : after).push(elapsed);
    }
  }
  let maxPixelDelta = 0;
  for (let i = 0; i < result.length; i++)
    maxPixelDelta = Math.max(maxPixelDelta, Math.abs(result[i]! - reference[i]!));
  console.log(
    JSON.stringify({
      input: `${width}x${height}`,
      output: `${outWidth}x${outHeight}`,
      runs: 5,
      beforeMedianMs: +median(before).toFixed(2),
      afterMedianMs: +median(after).toFixed(2),
      speedup: +(median(before) / median(after)).toFixed(2),
      maxPixelDelta,
    }),
  );
  if (maxPixelDelta > 1) throw new Error("Image quality regression");
}
