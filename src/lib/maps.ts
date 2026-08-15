/** Adress- und Navigationshilfen für Einsatzorte. */

export function projectAddress(p: {
  address_line?: string | null;
  postal_code?: string | null;
  city?: string | null;
}) {
  return [p.address_line, [p.postal_code, p.city].filter(Boolean).join(" ")]
    .map((s) => (s ? String(s).trim() : ""))
    .filter(Boolean)
    .join(", ");
}

export function mapsUrl(address: string) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
}
