import { expect, it } from "vitest";
import { floorplanScanInput, type Attachment } from "./shared";

const attachment = (isImage: boolean): Attachment => ({
  path: "kalkulation/test",
  name: isImage ? "plan.png" : "plan.pdf",
  url: "",
  isImage,
  sqm: "",
  rooms: "",
  floors: "",
  note: "",
});

it.each([
  [false, "application/pdf"],
  [true, "image/jpeg"],
])("analyses Kalkulation uploads as floorplans", (isImage, mimeType) => {
  expect(floorplanScanInput(attachment(isImage), "https://example.test/file")).toEqual({
    fileUrl: "https://example.test/file",
    mimeType,
    mode: "floorplan",
  });
});

