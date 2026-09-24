import { describe, expect, it } from "vitest";
import { effectiveProjectAddress, effectiveProjectAddressParts } from "@/lib/maps";

describe("effectiveProjectAddress", () => {
  const customer = {
    address_line: "Verwaltung 1",
    postal_code: "12345",
    city: "Musterstadt",
    service_address_line: "Objektweg 10",
    service_postal_code: "54321",
    service_city: "Einsatzstadt",
  };

  it("prefers an explicit project address so one customer can have several objects", () => {
    const project = {
      address_line: "Haus A 1",
      postal_code: "66111",
      city: "Saarbrücken",
    };
    expect(effectiveProjectAddress(project, customer)).toBe("Haus A 1, 66111 Saarbrücken");
  });

  it("uses the customer service address for legacy projects that still carry billing address", () => {
    const project = {
      address_line: "Verwaltung 1",
      postal_code: "12345",
      city: "Musterstadt",
    };
    expect(effectiveProjectAddressParts(project, customer)).toEqual({
      address_line: "Objektweg 10",
      postal_code: "54321",
      city: "Einsatzstadt",
    });
  });

  it("uses the customer service address only when the project has no own address", () => {
    expect(effectiveProjectAddress({}, customer)).toBe("Objektweg 10, 54321 Einsatzstadt");
  });
});
