import { describe, expect, it, vi } from "vitest";
import { removeRetainedPhotos } from "./photo-retention";

const scope = { ownerId: "owner", entryId: "entry" };
const a = "owner/arbeitsnachweis/entry/a.jpg";
const b = "owner/arbeitsnachweis/entry/b.jpg";

describe("expired work photo retention", () => {
  it("clears references only after storage deletion succeeds", async () => {
    const order: string[] = [];
    const remove = vi.fn(async () => {
      order.push("storage");
      return { error: null };
    });
    const clear = vi.fn(async () => {
      order.push("database");
      return { error: null, updatedRows: 1 };
    });

    await expect(removeRetainedPhotos([a, b], scope, remove, clear)).resolves.toBe(2);
    expect(order).toEqual(["storage", "database"]);
    expect(remove).toHaveBeenCalledWith([a, b]);
  });

  it("keeps references when storage deletion returns an error", async () => {
    const clear = vi.fn(async () => ({ error: null, updatedRows: 1 }));
    await expect(
      removeRetainedPhotos(
        [a],
        scope,
        async () => ({ error: { message: "Storage unavailable" } }),
        clear,
      ),
    ).rejects.toThrow("Storage unavailable");
    expect(clear).not.toHaveBeenCalled();
  });

  it("reports database failures for retry instead of reporting success", async () => {
    await expect(
      removeRetainedPhotos(
        [a],
        scope,
        async () => ({ error: null }),
        async () => ({ error: { message: "DB unavailable" }, updatedRows: 0 }),
      ),
    ).rejects.toThrow("DB unavailable");
  });

  it("rejects silent no-op database updates", async () => {
    await expect(
      removeRetainedPhotos(
        [a],
        scope,
        async () => ({ error: null }),
        async () => ({ error: null, updatedRows: 0 }),
      ),
    ).rejects.toThrow("exactly one");
  });

  it("skips empty photo lists", async () => {
    const remove = vi.fn(async () => ({ error: null }));
    const clear = vi.fn(async () => ({ error: null, updatedRows: 1 }));
    await expect(removeRetainedPhotos([], scope, remove, clear)).resolves.toBe(0);
    expect(remove).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
  });
});

it.each([
  "other/arbeitsnachweis/entry/a.jpg",
  "owner/gobd/archive.pdf",
  "owner/arbeitsnachweis/other/a.jpg",
  "owner/arbeitsnachweis/entry/../archive.pdf",
  "owner/arbeitsnachweis/entry/%2e%2e",
  "owner/arbeitsnachweis/entry/a\\b.jpg",
])("rejects unsafe existing reference %s before deletion", async (path) => {
  const remove = vi.fn();
  const clear = vi.fn();
  await expect(removeRetainedPhotos([a, path], scope, remove, clear)).rejects.toThrow("Foto-Pfad");
  expect(remove).not.toHaveBeenCalled();
  expect(clear).not.toHaveBeenCalled();
});
