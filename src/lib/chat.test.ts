import { describe, expect, it } from "vitest";
import { chatFilePath, validateChatFile } from "./chat";
describe("chat attachments", () => {
  it("accepts supported images and documents within the size limit", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp", "application/pdf", "text/plain"])
      expect(() => validateChatFile({ name: "file", type, size: 10 * 1024 * 1024 })).not.toThrow();
  });
  it("rejects active content, empty files, oversized files and unsafe display names", () => {
    for (const file of [
      { name: "a.svg", type: "image/svg+xml", size: 1 },
      { name: "a.html", type: "text/html", size: 1 },
      { name: "a.pdf", type: "application/pdf", size: 0 },
      { name: "a.pdf", type: "application/pdf", size: 10 * 1024 * 1024 + 1 },
      { name: "a".repeat(181), type: "text/plain", size: 1 },
    ])
      expect(() => validateChatFile(file)).toThrow();
  });
  it("uses conversation/message/uploader scopes without trusting filenames", () => {
    expect(chatFilePath("thread", "message", "user", "application/pdf")).toMatch(
      /^thread\/message\/user\/[a-f0-9-]+\.pdf$/,
    );
    expect(() => chatFilePath("thread", "message", "user", "text/html")).toThrow();
  });
});
