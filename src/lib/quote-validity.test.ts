import { expect, it } from "vitest";
import { quoteValidUntil } from "./quote-validity";
it("sets quote validity to 30 calendar days", () => {
  expect(quoteValidUntil("2026-11-01")).toBe("2026-12-01");
  expect(quoteValidUntil("2026-01-31")).toBe("2026-03-02");
  expect(quoteValidUntil("")).toBe("");
  expect(quoteValidUntil("2026-02-30")).toBe("");
});
