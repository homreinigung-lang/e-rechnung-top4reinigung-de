import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { FloorplanAttachments } from "./FloorplanAttachments";
import type { KalkulationStateContext } from "./useKalkulationState";

const mocks = vi.hoisted(() => ({
  onUploaded: undefined as ((path: string, file: File) => void | Promise<void>) | undefined,
  fileUrl: vi.fn(async () => "https://example.test/plan.pdf"),
}));

vi.mock("@/components/FileUploadButton", () => ({
  FileUploadButton: (props: { onUploaded: typeof mocks.onUploaded }) => {
    mocks.onUploaded = props.onUploaded;
    return null;
  },
}));
vi.mock("@/lib/storage", () => ({ fileUrl: mocks.fileUrl, openStoredFile: vi.fn() }));
vi.mock("./RoomCalculationEditor", () => ({ RoomCalculationEditor: () => null }));

function makeState(overrides: Partial<KalkulationStateContext> = {}) {
  return {
    analysisTotals: { sqm: 0, rooms: 0, floors: 0 },
    attachments: [],
    scanFile: { isPending: false, mutate: vi.fn() },
    scanningPath: null,
    setArea: vi.fn(),
    setAttachments: vi.fn(),
    setFloors: vi.fn(),
    setMode: vi.fn(),
    setNote: vi.fn(),
    setStairs: vi.fn(),
    setRoomCalculation: vi.fn(),
    updateAttachment: vi.fn(),
    ...overrides,
  } as unknown as KalkulationStateContext;
}

beforeEach(() => {
  mocks.onUploaded = undefined;
  mocks.fileUrl.mockClear();
});

it("starts the analysis automatically after uploading a file", async () => {
  const state = makeState();
  renderToStaticMarkup(createElement(FloorplanAttachments, { state }));

  expect(mocks.onUploaded).toBeTypeOf("function");
  await mocks.onUploaded?.(
    "kalkulation/plan.pdf",
    new File(["pdf"], "plan.pdf", { type: "application/pdf" }),
  );

  expect(state.setAttachments).toHaveBeenCalledOnce();
  expect(state.scanFile.mutate).toHaveBeenCalledWith(
    expect.objectContaining({ path: "kalkulation/plan.pdf", name: "plan.pdf", isImage: false }),
  );
});

it("keeps the analysis result visible in the uploaded file card", () => {
  const state = makeState({
    attachments: [
      {
        path: "kalkulation/plan.pdf",
        name: "plan.pdf",
        url: "https://example.test/plan.pdf",
        isImage: false,
        sqm: "120",
        rooms: "4",
        floors: "1",
        note: "",
        analysisStatus: "completed",
        analysisRooms: 4,
        analysisItems: 2,
        analysisSummary: "Vier Büroräume erkannt.",
      },
    ],
  });

  const html = renderToStaticMarkup(createElement(FloorplanAttachments, { state }));

  expect(html).toContain("Analyseergebnis");
  expect(html).toContain("4 Räume");
  expect(html).toContain("2 Vorschlagspositionen");
  expect(html).toContain("Vier Büroräume erkannt.");
});

