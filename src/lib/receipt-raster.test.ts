import { describe, expect, it } from "vitest";
import { perspectiveWarp } from "./receipt-raster";
import { baselineWarp } from "../../scripts/fixtures/receipt-raster-baseline";
import type { Quad } from "./receipt-corners";

describe("receipt perspective sampling", () => {
  it.each([
    [
      { x: 0, y: 0 },
      { x: 62, y: 0 },
      { x: 62, y: 95 },
      { x: 0, y: 95 },
    ],
    [
      { x: 6, y: 3 },
      { x: 60, y: 9 },
      { x: 55, y: 89 },
      { x: 2, y: 94 },
    ],
  ] as Quad[])("preserves text-sized edges and luminance within one level: %j", (...points) => {
    const data = new Uint8ClampedArray(63 * 96 * 4);
    for (let i = 0; i < data.length; i++) data[i] = (i * 71 + (i >> 4) * 17) % 256;
    const source = { data, width: 63, height: 96 };
    const quad = points as unknown as Quad;
    const expected = baselineWarp(source, quad, 51, 81);
    const actual = perspectiveWarp(source, quad, 51, 81);
    let maxError = 0;
    for (let i = 0; i < actual.length; i++)
      maxError = Math.max(maxError, Math.abs(actual[i]! - expected[i]!));
    expect(maxError).toBeLessThanOrEqual(1);
  });

  it("keeps white paper and black one-pixel strokes sharp", () => {
    const data = new Uint8ClampedArray(16 * 24 * 4).fill(255);
    for (let y = 0; y < 24; y++) for (let c = 0; c < 3; c++) data[(y * 16 + 8) * 4 + c] = 0;
    const output = perspectiveWarp(
      { data, width: 16, height: 24 },
      [
        { x: 0, y: 0 },
        { x: 15, y: 0 },
        { x: 15, y: 23 },
        { x: 0, y: 23 },
      ],
      16,
      24,
    );
    expect(output[(12 * 16 + 8) * 4]).toBe(0);
    expect(output[(12 * 16 + 7) * 4]).toBe(255);
    expect(output[(12 * 16 + 9) * 4]).toBe(255);
  });
});
