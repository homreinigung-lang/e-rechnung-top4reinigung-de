import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { SimpleAiCalculation } from "./SimpleAiCalculation";

vi.mock("./useKalkulationState", () => ({ useKalkulationState: () => ({
  aiPrompt: "", setAiPrompt: vi.fn(), aiSuggest: { isPending: false, mutate: vi.fn() },
  aiReviewQuestions: [], kiItems: [],
}) }));
vi.mock("./ApplyCalculationDialog", () => ({ ApplyCalculationDialog: () => null }));
vi.mock("@/components/SpeechToTextButton", () => ({ SpeechToTextButton: () => null }));

it("opens directly on a single AI request without other calculator or training controls", () => {
  const html = renderToStaticMarkup(createElement(SimpleAiCalculation));
  expect(html).toContain("Auftrag analysieren");
  expect(html.match(/<textarea/g)).toHaveLength(1);
  for (const label of ["Schnellkalkulation", "Raumkalkulation", "KI-Training", "Kalkulationsgrundlagen", "Steuerart", "In Angebot übernehmen"])
    expect(html).not.toContain(label);
});
