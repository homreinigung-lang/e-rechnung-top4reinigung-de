import { describe, expect, it } from "vitest";
import { assertFahrtenbuchVehicleData } from "./fahrtenbuch-accountant-pdf";

describe("Fahrtenbuch PDF vehicle data", () => {
  it("accepts complete vehicle identification", () => {
    expect(() => assertFahrtenbuchVehicleData([
      { Fahrzeug: "Transporter", Kennzeichen: "SB-H 123" },
      { Fahrzeug: "Kleinwagen", Kennzeichen: "SB-H 456" },
    ])).not.toThrow();
  });

  it.each([
    [{ Fahrzeug: "", Kennzeichen: "SB-H 123" }],
    [{ Fahrzeug: "Transporter", Kennzeichen: " " }],
    [{ Fahrzeug: "Transporter" }],
    [{ Fahrzeug: "Transporter", Kennzeichen: "SB-H 123" }, { Fahrzeug: "", Kennzeichen: "SB-H 456" }],
  ])("rejects missing vehicle details in any trip", (rows) => {
    expect(() => assertFahrtenbuchVehicleData(rows)).toThrow(/Fahrzeugdaten fehlen/);
  });

  it("allows an empty report without inventing vehicle data", () => {
    expect(() => assertFahrtenbuchVehicleData([])).not.toThrow();
  });
});
