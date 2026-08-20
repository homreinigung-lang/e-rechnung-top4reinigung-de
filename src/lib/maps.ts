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

export type ServiceLocationSource = {
  address_line?: string | null;
  postal_code?: string | null;
  city?: string | null;
  service_address_line?: string | null;
  service_postal_code?: string | null;
  service_city?: string | null;
  service_note?: string | null;
};

/** Eigener Einsatzort des Kunden (falls gepflegt), sonst leer. */
export function serviceAddress(c: ServiceLocationSource | null | undefined) {
  if (!c) return "";
  if (!c.service_address_line && !c.service_city && !c.service_postal_code) return "";
  return projectAddress({
    address_line: c.service_address_line,
    postal_code: c.service_postal_code,
    city: c.service_city,
  });
}

/** Einsatzort mit Fallback auf die Rechnungsadresse. */
export function serviceAddressOrBilling(c: ServiceLocationSource | null | undefined) {
  if (!c) return "";
  return serviceAddress(c) || projectAddress(c);
}
