export type Point = { x: number; y: number };
/** Clockwise: top left, top right, bottom right, bottom left. */
export type Quad = readonly [Point, Point, Point, Point];

export function validReceiptQuad(quad: Quad): boolean {
  if (
    quad.some(
      (p) =>
        !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1,
    )
  )
    return false;
  for (let i = 0; i < 4; i++) {
    const a = quad[i]!;
    const b = quad[(i + 1) % 4]!;
    const c = quad[(i + 2) % 4]!;
    if ((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) <= 0.001) return false;
    if (Math.hypot(a.x - b.x, a.y - b.y) < 0.035) return false;
  }
  return true;
}

/** Find one connected sheet, not the extremes of every contrasting object. */
export function detectReceiptCorners(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): Quad | null {
  if (width < 8 || height < 8 || pixels.length !== width * height * 4) return null;
  const gray = new Uint8Array(width * height);
  const histogram = new Uint32Array(256);
  let total = 0;
  for (let i = 0; i < gray.length; i++) {
    const lum = Math.round(
      0.2126 * pixels[i * 4]! + 0.7152 * pixels[i * 4 + 1]! + 0.0722 * pixels[i * 4 + 2]!,
    );
    gray[i] = lum;
    histogram[lum] = histogram[lum]! + 1;
    total += lum;
  }
  // Otsu separates a light page from its background, including light desks.
  let sum = 0,
    count = 0,
    variance = -1,
    threshold = 180;
  for (let t = 0; t < 255; t++) {
    count += histogram[t]!;
    sum += t * histogram[t]!;
    if (!count || count === gray.length) continue;
    const difference = sum / count - (total - sum) / (gray.length - count);
    const value = count * (gray.length - count) * difference * difference;
    if (value > variance) {
      variance = value;
      threshold = t;
    }
  }
  let best: Quad | null = null,
    bestScore = 0;
  for (const cutoff of new Set([Math.max(80, threshold + 1), 160, 200, 225])) {
    const seen = new Uint8Array(gray.length);
    const queue = new Int32Array(gray.length);
    for (let seed = 0; seed < gray.length; seed++) {
      if (seen[seed] || gray[seed]! < cutoff) continue;
      let head = 0,
        tail = 1;
      queue[0] = seed;
      seen[seed] = 1;
      let tl = { x: width, y: height },
        tr = { x: 0, y: height },
        br = { x: 0, y: 0 },
        bl = { x: width, y: 0 };
      let border = 0;
      while (head < tail) {
        const index = queue[head++]!;
        const x = index % width,
          y = Math.floor(index / width);
        if (x === 0 || y === 0 || x === width - 1 || y === height - 1) border++;
        if (x + y < tl.x + tl.y) tl = { x, y };
        if (x - y > tr.x - tr.y) tr = { x, y };
        if (x + y > br.x + br.y) br = { x, y };
        if (y - x > bl.y - bl.x) bl = { x, y };
        for (const next of [
          x > 0 ? index - 1 : -1,
          x < width - 1 ? index + 1 : -1,
          y > 0 ? index - width : -1,
          y < height - 1 ? index + width : -1,
        ]) {
          if (next >= 0 && !seen[next] && gray[next]! >= cutoff) {
            seen[next] = 1;
            queue[tail++] = next;
          }
        }
      }
      if (tail < gray.length * 0.06 || border > Math.min(width, height) * 0.1) continue;
      const quad: Quad = [tl, tr, br, bl].map((p) => ({
        x: p.x / (width - 1),
        y: p.y / (height - 1),
      })) as unknown as Quad;
      if (!validReceiptQuad(quad)) continue;
      let area = 0;
      for (let i = 0; i < 4; i++) {
        const a = quad[i]!,
          b = quad[(i + 1) % 4]!;
        area += a.x * b.y - b.x * a.y;
      }
      area /= 2;
      const fill = tail / (area * width * height);
      if (area < 0.08 || area > 0.96 || fill < 0.65 || fill > 1.12) continue;
      const score = area * Math.min(fill, 1);
      if (score > bestScore) {
        best = quad;
        bestScore = score;
      }
    }
  }
  return best;
}
