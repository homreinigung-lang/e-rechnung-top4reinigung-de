import { beforeEach, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useMutation } from "@tanstack/react-query";
import { useKalkulationSuggestions } from "./useKalkulationSuggestions";
import { generateCalculation } from "@/lib/item-ai.server";

vi.mock("@tanstack/react-query", () => ({ useMutation: vi.fn((options) => options) }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: vi.fn(() => vi.fn()) }));
vi.mock("@/lib/project-scan.functions", () => ({ analyzeProject: vi.fn() }));
vi.mock("@/lib/storage", () => ({ fileUrl: vi.fn() }));
vi.mock("sonner", () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }));

type Input = Parameters<typeof useKalkulationSuggestions>[0];
type Response = Awaited<ReturnType<typeof generateCalculation>>;
type RequestResult = { result: Response; sourcePrompt: string; sourceRate: number };
type Options = {
 mutationFn: (recurrence?: { value: number; unit: "week" }) => Promise<RequestResult>;
 onMutate: () => void;
 onSuccess: (response: RequestResult) => void;
};
const prompt = "Büroreinigung 150 m² einmal pro Woche";
const analyze = vi.fn();
const setKiItems = vi.fn();
const setKiPrompt = vi.fn();
function request(overrides: Partial<Input> = {}) {
 const input = new Proxy({
   aiPrompt: prompt, hourlyRate: "38", frequency: "1", frequencyUnit: "once",
   roomCalculation: { enabled: false, rooms: [] }, attachments: [], extras: [],
   analyze, setKiItems, setKiPrompt, ...overrides,
 }, { get: (target, key) => Reflect.has(target, key) ? Reflect.get(target, key) : typeof key === "string" && key.startsWith("set") ? vi.fn() : undefined }) as Input;
 function Probe() { useKalkulationSuggestions(input); return null; }
 const index = vi.mocked(useMutation).mock.calls.length;
 renderToStaticMarkup(createElement(Probe));
 return vi.mocked(useMutation).mock.calls[index]![0] as unknown as Options;
}
beforeEach(async () => {
 vi.clearAllMocks();
 analyze.mockResolvedValue(await generateCalculation(prompt));
});
it("uses new textual recurrence instead of forcing a previous one-time selection", async () => {
 await request().mutationFn();
 expect(analyze).toHaveBeenCalledWith({ data: { prompt, sellingHourlyRate: 38, recurrence: undefined } });
});
it("passes an explicit recurrence change to the calculation", async () => {
 await request().mutationFn({ value: 2, unit: "week" });
 expect(analyze.mock.calls[0]![0].data.recurrence).toEqual({ value: 2, unit: "week" });
});
it.each([
 { aiPrompt: "Büroreinigung 250 m² einmal pro Woche" },
 { hourlyRate: "45" },
])("discards an in-flight result after changing inputs: %s", async (change) => {
 const old = await request().mutationFn();
 const current = request(change);
 current.onSuccess(old);
 expect(setKiItems).not.toHaveBeenCalled();
 expect(setKiPrompt).not.toHaveBeenCalled();
});
it("accepts unchanged inputs and records the exact analyzed prompt", async () => {
 const options = request();
 options.onSuccess(await options.mutationFn());
 expect(setKiItems).toHaveBeenCalled();
 expect(setKiPrompt).toHaveBeenCalledWith(prompt);
});
