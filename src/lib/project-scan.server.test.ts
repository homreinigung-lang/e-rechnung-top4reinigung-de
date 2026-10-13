import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { analyzeProjectFile } from "./project-scan.server";
import { generateGeminiJson } from "./gemini-json.server";

vi.mock("./gemini-json.server", () => ({ generateGeminiJson: vi.fn() }));
const gemini = vi.mocked(generateGeminiJson);
const plan = {
  project_name: "Büro",
  rooms: [{ name: "Büro", area_sqm: 50, floor: "EG" }],
  highlights: ["Originalhinweis"],
  requirements: ["Boden reinigen"],
  items: [],
};

beforeEach(() => {
  gemini.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("plan")),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("unabhängige Grundrissprüfungen", () => {
  it("startet die Summenprüfung vor Abschluss der Raumerkennung und behält die Warnung", async () => {
    let finishRooms!: (value: Record<string, unknown>) => void;
    const rooms = new Promise<Record<string, unknown>>((resolve) => {
      finishRooms = resolve;
    });
    gemini.mockImplementationOnce(() => rooms).mockResolvedValueOnce({ total_area_sqm: 100 });
    const pending = analyzeProjectFile(
      "https://example.test/plan.pdf",
      "application/pdf",
      "floorplan",
    );
    await vi.waitFor(() => expect(gemini).toHaveBeenCalledTimes(2));
    const [first, second] = gemini.mock.calls.map(([options]) => options);
    expect(first?.dataUrl).toBe(second?.dataUrl);
    expect(first?.mimeType).toBe(second?.mimeType);
    expect(first?.model).toBe(second?.model);
    finishRooms(plan);
    const result = await pending;
    expect(result.rooms).toEqual([
      { name: "Büro", floor: "EG", usage_type: "", area_sqm: 50, floor_covering: "" },
    ]);
    expect(result.highlights).toEqual([
      "Originalhinweis",
      "Achtung: Summe der Räume (50 m²) weicht von genannter Gesamtfläche (100 m²) ab – bitte prüfen.",
    ]);
    expect(result.requirements).toEqual(plan.requirements);
  });

  it("behält Räume bei fehlgeschlagener Summenprüfung", async () => {
    gemini.mockResolvedValueOnce(plan).mockRejectedValueOnce(new Error("timeout"));
    const result = await analyzeProjectFile(
      "https://example.test/plan.pdf",
      "application/pdf",
      "floorplan",
    );
    expect(result.rooms).toHaveLength(1);
    expect(result.highlights).toEqual(["Originalhinweis"]);
  });

  it("führt bei Ausschreibungen keine zusätzliche Summenprüfung aus", async () => {
    gemini.mockResolvedValueOnce(plan);
    await analyzeProjectFile("https://example.test/lv.pdf", "application/pdf", "tender");
    expect(gemini).toHaveBeenCalledTimes(1);
  });

  it("liefert bei leerer Raumerkennung weiterhin das leere Ergebnis", async () => {
    gemini.mockResolvedValueOnce({}).mockResolvedValueOnce({ total_area_sqm: 100 });
    const result = await analyzeProjectFile(
      "https://example.test/plan.pdf",
      "application/pdf",
      "floorplan",
    );
    expect(result.rooms).toEqual([]);
    expect(result.highlights).toEqual([]);
  });

  it("gibt den Fehler der Hauptanalyse weiter", async () => {
    gemini
      .mockRejectedValueOnce(new Error("main failed"))
      .mockResolvedValueOnce({ total_area_sqm: 100 });
    await expect(
      analyzeProjectFile("https://example.test/plan.pdf", "application/pdf", "floorplan"),
    ).rejects.toThrow("main failed");
  });
});
