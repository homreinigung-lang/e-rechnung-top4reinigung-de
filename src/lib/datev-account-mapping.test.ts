import { describe, expect, it } from "vitest";
import { automaticExpenseAccount, buildAutomaticExpenseMappings } from "./datev-account-mapping";

describe("automatic DATEV expense mappings", () => {
  it("maps the standard categories for SKR03", () => {
    expect(automaticExpenseAccount("Löhne", "SKR03")).toBe("4110");
    expect(automaticExpenseAccount("Reinigungsmittel", "SKR03")).toBe("4250");
    expect(automaticExpenseAccount("Versicherung", "SKR03")).toBe("4360");
    expect(automaticExpenseAccount("Sonstiges", "SKR03")).toBe("4900");
  });

  it("maps the standard categories for SKR04", () => {
    expect(automaticExpenseAccount("Löhne", "SKR04")).toBe("6010");
    expect(automaticExpenseAccount("Reinigungsmittel", "SKR04")).toBe("6330");
    expect(automaticExpenseAccount("Versicherung", "SKR04")).toBe("6400");
    expect(automaticExpenseAccount("Sonstiges", "SKR04")).toBe("6300");
  });

  it("builds mappings without requiring visible manual account fields", () => {
    expect(buildAutomaticExpenseMappings(["Löhne", "Sonstiges"], "SKR03")).toEqual({
      "Löhne": "4110",
      "Sonstiges": "4900",
    });
  });
});
