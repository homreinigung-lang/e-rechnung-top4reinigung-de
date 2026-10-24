import { expect, it, vi } from "vitest";
import { processReceipt, includeSavedExpense } from "./receipt-processing";

it("uploads PDFs while recognition is still pending and uploads exactly once", async () => {
  let complete!: (scan: null) => void;
  const analyze = vi.fn(() => new Promise<null>(resolve => { complete = resolve; }));
  const upload = vi.fn(async () => "stored.pdf");
  const prepare = vi.fn();
  const pending = processReceipt(new File(["pdf"], "a.pdf", { type: "application/pdf" }), { analyze, upload, prepare });
  expect(upload).toHaveBeenCalledTimes(1);
  complete(null);
  expect(await pending).toBe("stored.pdf");
  expect(prepare).not.toHaveBeenCalled();
});
it("waits for recognized metadata before preparing and uploading an image", async () => {
  const image = new File(["image"], "a.jpg", { type: "image/jpeg" });
  const pdf = new File(["pdf"], "a.pdf");
  const prepare = vi.fn(async (_file, scan) => { expect(scan).toEqual({ date: "2026-10-24" }); return pdf; });
  const upload = vi.fn(async () => "stored.pdf");
  await processReceipt(image, { analyze: async () => ({ date: "2026-10-24" }), prepare, upload });
  expect(upload).toHaveBeenCalledExactlyOnceWith(pdf);
});
it("propagates upload failure even when OCR succeeds", async () => {
  await expect(processReceipt(new File([], "a.pdf", { type: "application/pdf" }), {
    analyze: async () => null, prepare: vi.fn(), upload: async () => { throw new Error("upload failed"); },
  })).rejects.toThrow("upload failed");
});
it("inserts the confirmed row in date order without duplicating it", () => {
  const saved = { id: "a", expense_date: "2026-10-24", amount: 10 };
  expect(includeSavedExpense([{ ...saved, amount: 0 }, { id: "b", expense_date: "2026-10-25", amount: 5 }], saved)).toEqual([{ id: "b", expense_date: "2026-10-25", amount: 5 }, saved]);
  expect(includeSavedExpense(undefined, saved)).toEqual([saved]);
});
