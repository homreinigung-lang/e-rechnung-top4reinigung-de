import { describe, expect, it } from "vitest";
import { emptyForm, latestOdometerTrip, tripOdometerWarning, newTripForm, selectTripVehicle } from "@/components/vehicle-log/shared";

const trips = [
  { vehicle_id: "a", trip_date: "2026-10-11", trip_time: "10:00", created_at: "2026-10-11T10:00:00Z", end_km: 12500.5 },
  { vehicle_id: "b", trip_date: "2026-10-13", trip_time: "12:00", created_at: "2026-10-13T12:00:00Z", end_km: 45000 },
  { vehicle_id: "a", trip_date: "2026-10-12", trip_time: "09:00", created_at: "2026-10-13T13:00:00Z", end_km: 12520.5 },
];

describe("Start-km-Vorschlag für neue Fahrten", () => {
  it("übernimmt Fahrzeug und Endstand der chronologisch letzten Fahrt", () => {
    expect(newTripForm(trips)).toMatchObject({ vehicle_id: "b", start_km: "45000", end_km: "" });
  });
  it("verwendet beim Fahrzeugwechsel nur dessen letzten Endstand", () => {
    expect(selectTripVehicle(emptyForm(), "a", trips).start_km).toBe("12520.5");
    expect(selectTripVehicle(emptyForm(), "b", trips).start_km).toBe("45000");
  });
  it("lässt das Feld ohne frühere Fahrt leer", () => {
    expect(newTripForm([]).start_km).toBe("");
    expect(selectTripVehicle(emptyForm(), "new", trips).start_km).toBe("");
    expect(selectTripVehicle(emptyForm(), "none", trips).start_km).toBe("");
  });
  it("bewahrt gespeicherte Kilometerstände beim Bearbeiten", () => {
    expect(selectTripVehicle({ ...emptyForm(), id: "existing", start_km: "11000", end_km: "11020" }, "a", trips))
      .toMatchObject({ start_km: "11000", end_km: "11020" });
  });
  it("löst gleiche Fahrtzeiten anhand der Erfassungszeit auf und erhält Null", () => {
    const sameTime = [
      { ...trips[0]!, created_at: "2026-10-11T10:00:00Z" },
      { ...trips[0]!, created_at: "2026-10-11T11:00:00Z", end_km: 0 },
    ];
    expect(latestOdometerTrip(sameTime, "a")?.end_km).toBe(0);
    expect(newTripForm(sameTime).start_km).toBe("0");
  });
});


describe("Warnung bei niedrigerem Kilometerstand", () => {
  it("vergleicht mit dem letzten Endstand desselben Fahrzeugs", () => {
    const warning = tripOdometerWarning({ ...emptyForm(), vehicle_id: "a", start_km: "12500" }, trips);
    expect(warning).toContain("Start-km");
    expect(warning).toContain("12.520,5 km");
    expect(warning).toContain("12.10.2026");
  });
  it("warnt auch bei einem niedrigeren Endstand", () => {
    expect(tripOdometerWarning({ ...emptyForm(), vehicle_id: "a", end_km: "12500" }, trips))
      .toContain("End-km");
  });
  it("warnt bei gleichen oder höheren Werten nicht und ignoriert andere Fahrzeuge", () => {
    expect(tripOdometerWarning({ ...emptyForm(), vehicle_id: "a", start_km: "12520.5", end_km: "12530" }, trips)).toBeNull();
    expect(tripOdometerWarning({ ...emptyForm(), vehicle_id: "a", start_km: "12520,5" }, trips)).toBeNull();
  });
  it("interpretiert leere oder ungültige Felder nicht als Null", () => {
    expect(tripOdometerWarning({ ...emptyForm(), vehicle_id: "a" }, trips)).toBeNull();
    expect(tripOdometerWarning({ ...emptyForm(), vehicle_id: "a", start_km: "abc" }, trips)).toBeNull();
  });
  it("benötigt eine zugeordnete Vorfahrt und warnt nicht bei historischen Bearbeitungen", () => {
    expect(tripOdometerWarning({ ...emptyForm(), vehicle_id: "new", start_km: "1" }, trips)).toBeNull();
    expect(tripOdometerWarning({ ...emptyForm(), start_km: "1" }, trips)).toBeNull();
    expect(tripOdometerWarning({ ...emptyForm(), id: "old", vehicle_id: "a", start_km: "1" }, trips)).toBeNull();
  });
});
