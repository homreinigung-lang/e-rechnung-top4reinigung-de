import { describe, expect, it } from "vitest";
import {
  customerServiceLocations,
  serviceLocationPayload,
  serviceLocationLabel,
} from "@/lib/customer-service-locations";
import { effectiveProjectAddress, serviceAddressOrBilling } from "@/lib/maps";

const first = {
  id: "primary",
  address_line: "Haus A 1",
  postal_code: "66333",
  city: "Völklingen",
  note: "Tor A",
};
const second = {
  id: "second",
  address_line: "Haus B 2",
  postal_code: "66740",
  city: "Saarlouis",
  note: "Etage 2",
};
const billing = { address_line: "Verwaltung 10", postal_code: "66111", city: "Saarbrücken" };

describe("customer work sites", () => {
  it("keeps all site addresses and hints after saving and reopening a customer", () => {
    const saved = serviceLocationPayload([first, second]);
    expect(customerServiceLocations(saved)).toEqual([first, second]);
    expect(serviceLocationLabel(customerServiceLocations(saved)[1]!)).toBe(
      "Haus B 2, 66740 Saarlouis · Etage 2",
    );
  });

  it("reads existing single-site customers without a backfill", () => {
    expect(
      customerServiceLocations({
        ...billing,
        service_address_line: first.address_line,
        service_postal_code: first.postal_code,
        service_city: first.city,
        service_note: first.note,
      }),
    ).toEqual([first]);
    expect(customerServiceLocations(billing)).toEqual([]);
  });

  it("promotes the next site after removing the standard site and preserves the billing address", () => {
    const customer = { ...billing, ...serviceLocationPayload([second]) };
    expect(customer.address_line).toBe(billing.address_line);
    expect(serviceAddressOrBilling(customer)).toBe("Haus B 2, 66740 Saarlouis");
    expect(customerServiceLocations(customer)).toEqual([{ ...second, id: "primary" }]);
    expect(customer.additional_service_locations).toEqual([]);
  });

  it("clears every site when the last one is removed and restores the billing fallback", () => {
    const customer = { ...billing, ...serviceLocationPayload([]) };
    expect(customerServiceLocations(customer)).toEqual([]);
    expect(serviceAddressOrBilling(customer)).toBe("Verwaltung 10, 66111 Saarbrücken");
  });

  it("keeps the selected project site instead of substituting the customer's standard site", () => {
    const customer = { ...billing, ...serviceLocationPayload([first, second]) };
    expect(effectiveProjectAddress(second, customer)).toBe("Haus B 2, 66740 Saarlouis");
  });

  it("rejects unfinished rows before saving, and trims valid addresses", () => {
    expect(() =>
      serviceLocationPayload([first, { ...second, address_line: " ", city: "" }]),
    ).toThrow("Einsatzort 2");
    expect(
      serviceLocationPayload([{ ...first, address_line: " Haus A 1 " }]).service_address_line,
    ).toBe("Haus A 1");
  });

  it("handles malformed persisted JSON without crashing or duplicating site keys", () => {
    expect(
      customerServiceLocations({
        additional_service_locations: [null, [], { id: 4 }, second, second],
      }),
    ).toEqual([second]);
    expect(customerServiceLocations({ additional_service_locations: "invalid" })).toEqual([]);
  });
});
