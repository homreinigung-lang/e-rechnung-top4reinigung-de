import { describe, expect, it, vi } from "vitest";
import { removeRetainedPhotos } from "./photo-retention";

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

    await expect(removeRetainedPhotos(["a.jpg", "b.jpg"], remove, clear)).resolves.toBe(2);
    expect(order).toEqual(["storage", "database"]);
    expect(remove).toHaveBeenCalledWith(["a.jpg", "b.jpg"]);
  });

  it("keeps references when storage deletion returns an error", async () => {
    const clear = vi.fn(async () => ({ error: null, updatedRows: 1 }));
    await expect(
      removeRetainedPhotos(
        ["a.jpg"],
        async () => ({ error: { message: "Storage unavailable" } }),
        clear,
      ),
    ).rejects.toThrow("Storage unavailable");
    expect(clear).not.toHaveBeenCalled();
  });

  it("reports database failures for retry instead of reporting success", async () => {
    await expect(
      removeRetainedPhotos(
        ["a.jpg"],
        async () => ({ error: null }),
        async () => ({ error: { message: "DB unavailable" }, updatedRows: 0 }),
      ),
    ).rejects.toThrow("DB unavailable");
  });

  it("rejects silent no-op database updates", async () => {
    await expect(
      removeRetainedPhotos(
        ["a.jpg"],
        async () => ({ error: null }),
        async () => ({ error: null, updatedRows: 0 }),
      ),
    ).rejects.toThrow("exactly one");
  });

  it("skips empty photo lists", async () => {
    const remove = vi.fn(async () => ({ error: null }));
    const clear = vi.fn(async () => ({ error: null, updatedRows: 1 }));
    await expect(removeRetainedPhotos([], remove, clear)).resolves.toBe(0);
    expect(remove).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
  });
});
