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
    address_line: c.service_address_line ?? "",
    postal_code: c.service_postal_code ?? "",
    city: c.service_city ?? "",
  });
}

/** Einsatzort mit Fallback auf die Rechnungsadresse. */
export function serviceAddressOrBilling(c: ServiceLocationSource | null | undefined) {
  if (!c) return "";
  return (
    serviceAddress(c) ||
    projectAddress({
      address_line: c.address_line ?? "",
      postal_code: c.postal_code ?? "",
      city: c.city ?? "",
    })
  );
}


export type ProjectLocationSource = {
  address_line?: string | null;
  postal_code?: string | null;
  city?: string | null;
};

/**
 * Effektiver Arbeitsort eines Projekts.
 *
 * Regeln:
 * - Eine explizit gepflegte Projektadresse hat Vorrang. So kann z. B. eine
 *   Hausverwaltung mehrere Häuser mit unterschiedlichen Einsatzorten haben.
 * - Alte Projekte, deren Adresse noch exakt der Rechnungsadresse des Kunden
 *   entspricht, dürfen auf den separat gepflegten Kundeneinsatzort fallen.
 * - Fehlt jede Projektadresse, dient der Kundeneinsatzort als Fallback.
 */
export function effectiveProjectAddressParts(
  project: ProjectLocationSource | null | undefined,
  customer: ServiceLocationSource | null | undefined,
): ProjectLocationSource {
  const p = {
    address_line: project?.address_line ?? "",
    postal_code: project?.postal_code ?? "",
    city: project?.city ?? "",
  };
  const hasProjectAddress = Boolean(p.address_line || p.postal_code || p.city);
  if (!customer) return p;

  const billing = {
    address_line: customer.address_line ?? "",
    postal_code: customer.postal_code ?? "",
    city: customer.city ?? "",
  };
  const service = {
    address_line: customer.service_address_line ?? "",
    postal_code: customer.service_postal_code ?? "",
    city: customer.service_city ?? "",
  };
  const hasService = Boolean(service.address_line || service.postal_code || service.city);
  const matchesOldBilling =
    hasProjectAddress &&
    p.address_line === billing.address_line &&
    p.postal_code === billing.postal_code &&
    p.city === billing.city;

  if ((!hasProjectAddress || matchesOldBilling) && hasService) return service;
  return p;
}

export function effectiveProjectAddress(
  project: ProjectLocationSource | null | undefined,
  customer: ServiceLocationSource | null | undefined,
) {
  return projectAddress(effectiveProjectAddressParts(project, customer));
}
