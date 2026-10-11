import { describe, expect, it } from "vitest";
import {
  employeeProjectAddressParts,
  projectAddress,
  effectiveProjectAddress,
  effectiveProjectAddressParts,
  normalizeAddressKey,
} from "@/lib/maps";

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

describe("normalizeAddressKey", () => {
  it("treats the same German address with or without country as identical", () => {
    expect(normalizeAddressKey("Rossenstr 11, 66111 Saarbrücken, Deutschland")).toBe(
      normalizeAddressKey("Rossenstr 11, 66111 Saarbrücken"),
    );
  });

  it("normalizes common Straße variants", () => {
    expect(normalizeAddressKey("Musterstraße 5, 66111 Saarbrücken")).toBe(
      normalizeAddressKey("Musterstr. 5, 66111 Saarbrücken"),
    );
  });
});

describe("employee work locations", () => {
  const customer = {
    address_line: "Verwaltungstraße 1",
    postal_code: "66111",
    city: "Saarbrücken",
    service_address_line: "Objektweg 10",
    service_postal_code: "66333",
    service_city: "Völklingen",
  };
  it("uses the service site when a legacy project contains the billing address", () => {
    expect(
      projectAddress(
        employeeProjectAddressParts(
          { address_line: "Verwaltungstr. 1", postal_code: "66111", city: "Saarbrücken" },
          customer,
        ),
      ),
    ).toBe("Objektweg 10, 66333 Völklingen");
  });
  it("preserves the separate project site for customers with multiple buildings", () => {
    expect(
      projectAddress(
        employeeProjectAddressParts(
          { address_line: "Haus B 2", postal_code: "66740", city: "Saarlouis" },
          customer,
        ),
      ),
    ).toBe("Haus B 2, 66740 Saarlouis");
  });
  it("does not substitute billing details when the service site is missing", () => {
    const billing = { address_line: "Verwaltung 1", postal_code: "66111", city: "Saarbrücken" };
    expect(projectAddress(employeeProjectAddressParts(billing, billing))).toBe("");
    expect(projectAddress(employeeProjectAddressParts({}, billing))).toBe("");
  });
  it("allows an explicitly recorded work site at the same address as the office", () => {
    const same = {
      ...customer,
      service_address_line: customer.address_line,
      service_postal_code: customer.postal_code,
      service_city: customer.city,
    };
    expect(projectAddress(employeeProjectAddressParts(customer, same))).toBe(
      "Verwaltungstraße 1, 66111 Saarbrücken",
    );
  });
});
