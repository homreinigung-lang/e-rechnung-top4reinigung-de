import { beforeEach, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { blankDeliveryNote } from "./delivery-note";
import {
  fetchDeliveryNote,
  saveDeliveryNote,
  uploadDeliveryScan,
  saveProjectDeliveryNote,
  fetchProjectDeliveryNotes,
  attachProjectDeliveryNote,
} from "./delivery-note-store";
const m = vi.hoisted(() => ({ from: vi.fn(), upload: vi.fn(), rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: m.from, rpc: m.rpc, storage: { from: () => ({ upload: m.upload }) } },
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

it("creates a monthly note in an object without creating or editing any invoice", async () => {
  const q = {
    insert: vi.fn(),
    select: vi.fn(),
    maybeSingle: vi.fn(async () => ({ data: { version: 1 }, error: null })),
  };
  q.insert.mockReturnValue(q);
  q.select.mockReturnValue(q);
  m.from.mockReturnValue(q);
  await saveProjectDeliveryNote(
    "note-id",
    "object-id",
    blankDeliveryNote("note-id", "2026-10-01", "20012640", "Objekt"),
    null,
    null,
  );
  expect(m.from).toHaveBeenCalledTimes(1);
  expect(m.from).toHaveBeenCalledWith("project_delivery_notes");
  expect(q.insert.mock.calls[0]![0]).toMatchObject({
    id: "note-id",
    project_id: "object-id",
    user_id: "owner",
  });
  expect(q.insert.mock.calls[0]![0]).not.toHaveProperty("document_id");
});

it("lists object originals together with their assigned invoice, without moving or deleting originals", async () => {
  const note = blankDeliveryNote("note-id", "2026-10-01", "", "Objekt");
  m.from.mockImplementation((table: string) => {
    const data =
      table === "project_delivery_notes"
        ? [{ id: "note-id", project_id: "object-id", data: note, scan_path: null, version: 2 }]
        : table === "document_delivery_notes"
          ? [{ source_note_id: "note-id", document_id: "invoice-id" }]
          : [{ id: "invoice-id", number: "RE-2026-1" }];
    const q = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
      in: vi.fn(),
      then: (resolve: (value: unknown) => void) =>
        Promise.resolve({ data, error: null }).then(resolve),
    };
    q.select.mockReturnValue(q);
    q.eq.mockReturnValue(q);
    q.order.mockReturnValue(q);
    q.in.mockReturnValue(q);
    return q;
  });
  const notes = await fetchProjectDeliveryNotes("object-id");
  expect(notes[0]).toMatchObject({
    id: "note-id",
    project_id: "object-id",
    document_id: "invoice-id",
    invoice_number: "RE-2026-1",
  });
  expect(m.rpc).not.toHaveBeenCalled();
});

it("binds a finished object note to an invoice using its saved version", async () => {
  const note = blankDeliveryNote("note-id", "2026-10-01", "", "Objekt");
  note.rows[0]!.date = "2026-10-01";
  note.rows[0]!.soap = "1,5";
  m.rpc.mockResolvedValue({ error: null });
  await attachProjectDeliveryNote(
    {
      id: "note-id",
      project_id: "object-id",
      document_id: "",
      data: note,
      scan_path: "signed.pdf",
      version: 3,
    },
    "invoice-id",
  );
  expect(m.rpc).toHaveBeenCalledWith("attach_project_delivery_note", {
    _note_id: "note-id",
    _document_id: "invoice-id",
    _version: 3,
  });
});

it("requires a finished note before invoice attachment", async () => {
  const note = blankDeliveryNote("note-id", "2026-10-01", "", "Objekt");
  await expect(
    attachProjectDeliveryNote(
      {
        id: "note-id",
        project_id: "object-id",
        document_id: "",
        data: note,
        scan_path: null,
        version: 1,
      },
      "invoice-id",
    ),
  ).rejects.toThrow("Menge");
  expect(m.rpc).not.toHaveBeenCalled();
});
