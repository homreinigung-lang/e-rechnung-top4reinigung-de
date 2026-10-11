import { describe, expect, it } from "vitest";
import { detectReceiptCorners, validReceiptQuad, type Quad } from "./receipt-corners";

const width = 240,
  height = 320;
function scene(background: number, paper: number, quad: Quad | null, distractor = false) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const inside = quad?.every((a, i) => {
        const b = quad[(i + 1) % 4]!;
        return (b.x - a.x) * (y / height - a.y) - (b.y - a.y) * (x / width - a.x) >= 0;
      });
      let v = inside ? paper : background;
      // Printed text inside the sheet must not be mistaken for its boundary.
      if (inside && x > 105 && x < 135 && y > 90 && y < 220 && y % 18 < 3) v = 30;
      if (distractor && x > width - 20 && y < 16) v = 255;
      const i = (y * width + x) * 4;
      pixels[i] = v;
      pixels[i + 1] = v;
      pixels[i + 2] = v;
      pixels[i + 3] = 255;
    }
  return pixels;
}
const paper: Quad = [
  { x: 0.2, y: 0.15 },
  { x: 0.8, y: 0.2 },
  { x: 0.75, y: 0.85 },
  { x: 0.25, y: 0.8 },
];
describe("paper corner detection", () => {
  it.each([
    [35, 235],
    [185, 242],
    [30, 160],
  ])("finds paper on background %i", (bg, fg) => {
    const result = detectReceiptCorners(scene(bg, fg, paper), width, height);
    expect(result).not.toBeNull();
    result!.forEach((point, i) => {
      expect(Math.abs(point.x - paper[i]!.x)).toBeLessThan(0.025);
      expect(Math.abs(point.y - paper[i]!.y)).toBeLessThan(0.025);
    });
  });
  it("ignores a separate bright object outside the page", () => {
    const result = detectReceiptCorners(scene(30, 240, paper, true), width, height)!;
    expect(result[1].x).toBeLessThan(0.83);
    expect(result[1].y).toBeGreaterThan(0.17);
  });
  it("supports a long narrow receipt", () => {
    const receipt: Quad = [
      { x: 0.4, y: 0.1 },
      { x: 0.6, y: 0.1 },
      { x: 0.6, y: 0.9 },
      { x: 0.4, y: 0.9 },
    ];
    expect(detectReceiptCorners(scene(20, 240, receipt), width, height)).not.toBeNull();
  });
  it.each([20, 230, 255])("requests manual corners for a flat image %i", (v) => {
    expect(detectReceiptCorners(scene(v, v, null), width, height)).toBeNull();
  });
  it("rejects intersecting, collapsed, out-of-bounds and non-finite crops", () => {
    expect(validReceiptQuad(paper)).toBe(true);
    expect(validReceiptQuad([paper[0], paper[2], paper[1], paper[3]])).toBe(false);
    expect(validReceiptQuad([paper[0], paper[0], paper[2], paper[3]])).toBe(false);
    expect(validReceiptQuad([{ x: -0.1, y: 0.1 }, ...paper.slice(1)] as unknown as Quad)).toBe(
      false,
    );
    expect(validReceiptQuad([{ x: NaN, y: 0.1 }, ...paper.slice(1)] as unknown as Quad)).toBe(
      false,
    );
  });
});
