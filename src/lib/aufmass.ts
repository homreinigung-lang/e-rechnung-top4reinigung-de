/** Dimension-derived areas are rounded once and never mixed with glass areas. */
export function measuredArea(length?: number | null, width?: number | null): number | null {
  if (
    length == null ||
    width == null ||
    !Number.isFinite(length) ||
    !Number.isFinite(width) ||
    length <= 0 ||
    width <= 0
  )
    return null;
  return Math.round(length * width * 100) / 100;
}
