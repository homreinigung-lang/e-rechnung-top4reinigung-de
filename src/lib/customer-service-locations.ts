import { projectAddress, type ServiceLocationSource } from "@/lib/maps";

export type CustomerServiceLocation = {
  id: string;
  address_line: string;
  postal_code: string;
  city: string;
  note: string;
};

export type CustomerWithServiceLocations = ServiceLocationSource & {
  additional_service_locations?: unknown;
};

export function emptyServiceLocation(): CustomerServiceLocation {
  return { id: crypto.randomUUID(), address_line: "", postal_code: "", city: "", note: "" };
}

/** Keep the existing service_* fields as the first site for older app versions. */
export function customerServiceLocations(
  customer: CustomerWithServiceLocations | null | undefined,
): CustomerServiceLocation[] {
  if (!customer) return [];
  const primary: CustomerServiceLocation = {
    id: "primary",
    address_line: customer.service_address_line ?? "",
    postal_code: customer.service_postal_code ?? "",
    city: customer.service_city ?? "",
    note: customer.service_note ?? "",
  };
  const locations = [primary.address_line, primary.postal_code, primary.city, primary.note].some(
    (value) => value.trim(),
  )
    ? [primary]
    : [];
  if (Array.isArray(customer.additional_service_locations)) {
    for (const value of customer.additional_service_locations) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const row = value as Record<string, unknown>;
      if (
        typeof row["id"] !== "string" ||
        !row["id"] ||
        locations.some((site) => site.id === row["id"])
      )
        continue;
      const text = (key: string) => (typeof row[key] === "string" ? row[key] : "");
      locations.push({
        id: row["id"],
        address_line: text("address_line"),
        postal_code: text("postal_code"),
        city: text("city"),
        note: text("note"),
      });
    }
  }
  return locations;
}

/** Validate before the atomic customer write; never discard an unfinished site silently. */
export function serviceLocationPayload(locations: CustomerServiceLocation[]) {
  const cleaned = locations.map((site, index) => {
    const result = {
      id: site.id,
      address_line: site.address_line.trim(),
      postal_code: site.postal_code.trim(),
      city: site.city.trim(),
      note: site.note.trim(),
    };
    if (!result.address_line && !result.city) {
      throw new Error(
        `Bitte für Einsatzort ${index + 1} mindestens Straße oder Ort angeben oder den Einsatzort entfernen.`,
      );
    }
    return result;
  });
  const primary = cleaned[0];
  return {
    service_address_line: primary?.address_line ?? "",
    service_postal_code: primary?.postal_code ?? "",
    service_city: primary?.city ?? "",
    service_note: primary?.note ?? "",
    additional_service_locations: cleaned.slice(1),
  };
}

export function serviceLocationLabel(site: CustomerServiceLocation) {
  return [projectAddress(site), site.note].filter(Boolean).join(" · ");
}
