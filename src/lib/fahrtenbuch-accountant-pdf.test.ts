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


describe("Fahrtenbuch internal driver privacy", () => {
  it("does not include driver details in the accountant PDF even if provided", async () => {
    const pdf = buildAccountantFahrtenbuchPdf([{
      Fahrzeug: "Transporter", Kennzeichen: "SB-H 123", Datum: "10.10.2026",
      Fahrer: "PRIVATE_DRIVER_SENTINEL", employee_id: "PRIVATE_EMPLOYEE_SENTINEL",
    }], "2026-10-01", "2026-10-31");
    const content = await pdf.text();
    expect(content).not.toContain("PRIVATE_DRIVER_SENTINEL");
    expect(content).not.toContain("PRIVATE_EMPLOYEE_SENTINEL");
    expect(content).toContain("Transporter");
  });
});
