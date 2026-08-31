import { describe, expect, it } from "vitest";
import { formatCents, formatGermanNumber, parseGermanCents, parseGermanNumber } from "./number";
import { cleanItems, itemsFromRows, itemsFromText, mergeItemLists } from "./import";

describe("deutsche Zahlen", () => {
  it("liest Tausenderpunkte und Dezimalkomma", () => {
    expect(parseGermanNumber("1.234,50")).toBe(1234.5);
    expect(parseGermanNumber("220,5")).toBe(220.5);
    expect(parseGermanNumber("1.250")).toBe(1250);
    expect(parseGermanNumber("")).toBeNull();
  });

  it("rechnet in Cent ohne Rundungsfehler", () => {
    expect(parseGermanCents("2.945,25")).toBe(294525);
    expect(parseGermanCents("0,07")).toBe(7);
    expect(formatCents(294525)).toBe("2.945,25");
    expect(formatGermanNumber(220.5)).toBe("220,50");
  });
});

describe("LV-Import", () => {
  it("erkennt verschachtelte OZ, deutsche Mengen und Einheiten", () => {
    const text = [
      "--- Seite 1 ---",
      "01.01.001 Unterhaltsreinigung Büroflächen 1.250,00 m²",
      "1.2.3 Glasreinigung innen und außen 18 Std.",
      "01.2 Verbrauchsmaterial 1 pauschal",
    ].join("\n");
    const items = itemsFromText(text);
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({ item_number: "01.01.001", quantity: 1250, unit: "m²" });
    expect(items[1]).toMatchObject({ item_number: "1.2.3", quantity: 18, unit: "Std" });
  });

  it("erhält mehrzeilige Beschreibungen bis zur Menge", () => {
    const items = itemsFromText(
      "01.01 Reinigung der Büroflächen\ninklusive Mobiliar und Papierkörbe\n2.400,50 m²\n01.02 Treppenhausreinigung 12 Monat",
    );
    expect(items).toHaveLength(2);
    expect(items[0]?.description).toContain("inklusive Mobiliar");
    expect(items[0]?.quantity).toBe(2400.5);
  });

  it("erkennt deutsche Tabellenspalten und entfernt Dubletten", () => {
    const rows = [
      ["OZ", "Kurzbeschreibung", "Menge", "Einheit", "Einheitspreis"],
      ["01.01", "Bodenreinigung", "1.250,00", "m²", "2,50"],
      ["01.01", "Bodenreinigung", "1.250,00", "m²", "2,50"],
    ];
    const items = cleanItems(itemsFromRows(rows));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ quantity: 1250, unit_price: 2.5 });
  });
});

describe("Zusammenführung mehrerer Erkennungswege", () => {
  it("behält die längste Liste und ergänzt fehlende Positionen ohne Dubletten", () => {
    const a = [{ item_number: "1", description: "Unterhaltsreinigung", quantity: 1, unit: "m²", unit_price: 2 }];
    const b = [
      { item_number: "1", description: "Unterhaltsreinigung", quantity: 1, unit: "m²", unit_price: 2 },
      { item_number: "2", description: "Glasreinigung", quantity: 3, unit: "Std.", unit_price: 38 },
    ];
    const merged = mergeItemLists([a, b, []]);
    expect(merged).toHaveLength(2);
    expect(merged[1]?.item_number).toBe("2");
  });
});
