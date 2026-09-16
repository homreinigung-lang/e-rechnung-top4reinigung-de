import { describe, expect, it } from "vitest";
import { assertFahrtenbuchVehicleData, buildAccountantFahrtenbuchPdf } from "./fahrtenbuch-accountant-pdf";

describe("Fahrtenbuch PDF vehicle data", () => {
  it("accepts complete vehicle identification", () => {
    expect(() => assertFahrtenbuchVehicleData([
      { Fahrzeug: "Transporter", Kennzeichen: "SB-H 123" },
      { Fahrzeug: "Kleinwagen", Kennzeichen: "SB-H 456" },
    ])).not.toThrow();
  });

  const incompleteTrips: Record<string, string>[][] = [
    [{ Fahrzeug: "", Kennzeichen: "SB-H 123" }],
    [{ Fahrzeug: "Transporter", Kennzeichen: " " }],
    [{ Fahrzeug: "Transporter" }],
    [{ Fahrzeug: "Transporter", Kennzeichen: "SB-H 123" }, { Fahrzeug: "", Kennzeichen: "SB-H 456" }],
  ];

  it.each(incompleteTrips.map((rows) => [rows] as const))(
    "rejects missing vehicle details in any trip",
    (rows) => {
      expect(() => assertFahrtenbuchVehicleData(rows)).toThrow(/Fahrzeugdaten fehlen/);
    },
  );

  it("allows an empty report without inventing vehicle data", () => {
    expect(() => assertFahrtenbuchVehicleData([])).not.toThrow();
  });
});

describe("Fahrtenbuch company identity", () => {
  const rows = [{ Fahrzeug: "Transporter", Kennzeichen: "SB-H 123" }];
  it("refuses company branding without a name", () => {
    expect(() => buildAccountantFahrtenbuchPdf(rows, "2026-09-01", "2026-09-30", {
      companyName: "  ", logoDataUrl: "data:image/jpeg;base64,AA==",
    })).toThrow(/Firmenname oder Firmenlogo/);
  });
  it("refuses company branding without an embedded image", () => {
    expect(() => buildAccountantFahrtenbuchPdf(rows, "2026-09-01", "2026-09-30", {
      companyName: "Hom Reinigung Service", logoDataUrl: "https://example.invalid/logo.png",
    })).toThrow(/Firmenname oder Firmenlogo/);
  });
  it("validates vehicle identification before producing any branded PDF", () => {
    expect(() => buildAccountantFahrtenbuchPdf([{ Fahrzeug: "", Kennzeichen: "SB-H 123" }], "2026-09-01", "2026-09-30", {
      companyName: "Hom Reinigung Service", logoDataUrl: "data:image/jpeg;base64,AA==",
    })).toThrow(/Fahrzeugdaten fehlen/);
  });
});
