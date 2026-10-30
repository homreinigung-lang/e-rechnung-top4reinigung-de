import { beforeEach, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { blankDeliveryNote } from "./delivery-note";
import { fetchDeliveryNote, saveDeliveryNote, uploadDeliveryScan } from "./delivery-note-store";
const m = vi.hoisted(() => ({ from: vi.fn(), upload: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: m.from, storage: { from: () => ({ upload: m.upload }) } },
}));
vi.mock("@/lib/auth-user", () => ({ requireUserId: async () => "owner" }));
vi.mock("@/lib/storage", () => ({ FILES_BUCKET: "private-files", fetchStoredBlob: vi.fn() }));
beforeEach(() => {
  vi.resetAllMocks();
  m.upload.mockResolvedValue({ error: null });
});

it("does not disrupt existing invoices when the additive migration has not yet been deployed", async () => {
  const q = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(async () => ({
      data: null,
      error: { code: "PGRST205", message: "table missing" },
    })),
  };
  q.select.mockReturnValue(q);
  q.eq.mockReturnValue(q);
  m.from.mockReturnValue(q);
  await expect(fetchDeliveryNote("invoice", true)).resolves.toBeNull();
  await expect(fetchDeliveryNote("invoice")).rejects.toThrow("table missing");
});
it("detects stale edits instead of silently overwriting another device's saved signature", async () => {
  const q = {
    update: vi.fn(),
    eq: vi.fn(),
    select: vi.fn(),
    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
  };
  q.update.mockReturnValue(q);
  q.eq.mockReturnValue(q);
  q.select.mockReturnValue(q);
  m.from.mockReturnValue(q);
  await expect(
    saveDeliveryNote("invoice", blankDeliveryNote("abc", "2026-10-01", "", "Objekt"), null, 4),
  ).rejects.toThrow("zwischenzeitlich");
  expect(q.eq).toHaveBeenCalledWith("version", 4);
});
it("preserves all uploaded PDF pages and uses private storage without overwriting", async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage();
  pdf.addPage();
  const bytes = await pdf.save();
  const path = await uploadDeliveryScan(
    "invoice",
    new File([bytes.slice().buffer], "scan.pdf", { type: "application/pdf" }),
  );
  expect(path).toMatch(/^owner\/delivery-notes\/invoice\/.*\.pdf$/);
  const [, uploaded, options] = m.upload.mock.calls[0]!;
  expect((await PDFDocument.load(uploaded)).getPageCount()).toBe(2);
  expect(options).toEqual({ contentType: "application/pdf", upsert: false });
});
it("converts a phone PNG photo to a printable PDF", async () => {
  const photo = Uint8Array.from(
    atob(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZxkAAAAASUVORK5CYII=",
    ),
    (c) => c.charCodeAt(0),
  );
  await uploadDeliveryScan("invoice", new File([photo], "scan.png", { type: "image/png" }));
  const bytes = m.upload.mock.calls[0]![1];
  expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
});
it("rejects unsupported or corrupt uploads before writing storage", async () => {
  await expect(
    uploadDeliveryScan("invoice", new File(["corrupt"], "scan.pdf", { type: "application/pdf" })),
  ).rejects.toThrow("PDF, JPG oder PNG");
  expect(m.upload).not.toHaveBeenCalled();
});
