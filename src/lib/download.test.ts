import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { saveFile } from "./download";

vi.mock("sonner", () => ({
  toast: { loading: vi.fn(), success: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

describe("iOS file downloads", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("navigator", { userAgent: "iPhone", platform: "iPhone" });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test-download");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("opens the PDF without prematurely revoking its URL or reporting failure", async () => {
    const tab = { opener: {}, location: { replace: vi.fn() } };
    vi.stubGlobal("window", { open: vi.fn(() => tab) });
    expect(await saveFile(new Blob(["pdf"]), "Rechnung.pdf")).toBe(true);
    expect(tab.opener).toBeNull();
    expect(tab.location.replace).toHaveBeenCalledWith("blob:test-download");
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60_000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test-download");
  });

  it("reports a blocked popup and releases the unused URL", async () => {
    vi.stubGlobal("window", { open: vi.fn(() => null) });
    expect(await saveFile(new Blob(["pdf"]), "Rechnung.pdf")).toBe(false);
    expect(toast.error).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test-download");
  });

  it("uses native sharing when supported", async () => {
    vi.stubGlobal("navigator", {
      userAgent: "iPhone", platform: "iPhone",
      canShare: vi.fn(() => true), share: vi.fn().mockResolvedValue(undefined),
    });
    const open = vi.fn();
    vi.stubGlobal("window", { open });
    expect(await saveFile(new Blob(["pdf"]), "Rechnung.pdf")).toBe(true);
    expect(navigator.share).toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });
});
