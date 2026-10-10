import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { digest, objectFile, verifyStorage } from "./backup-manifest.mjs";

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), "gebcalc-backup-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "objects"));
  const objects = ["private", "public"].map((bucket) => {
    const bytes = Buffer.from(`Test file ${bucket}`);
    return {
      bucket,
      path: "folder/file.pdf",
      file: objectFile(bucket, "folder/file.pdf"),
      size: bytes.length,
      sha256: digest(bytes),
    };
  });
  for (const object of objects)
    await writeFile(path.join(root, object.file), `Test file ${object.bucket}`);
  const manifest = {
    format: "gebcalc-storage-backup-v2",
    scope: "all-buckets",
    buckets: [{ id: "private" }, { id: "public" }],
    object_count: objects.length,
    objects,
  };
  const save = () => writeFile(path.join(root, "storage-manifest.json"), JSON.stringify(manifest));
  await save();
  return { root, manifest, save };
}

test("verifies every file across different buckets with the same object path", async (t) => {
  const f = await fixture(t);
  assert.equal((await verifyStorage(f.root)).objects.length, 2);
});
test("detects changed file bytes", async (t) => {
  const f = await fixture(t);
  await writeFile(path.join(f.root, f.manifest.objects[0].file), "damaged");
  await assert.rejects(verifyStorage(f.root), /checksum mismatch/);
});
test("rejects an incomplete manifest", async (t) => {
  const f = await fixture(t);
  f.manifest.object_count++;
  await f.save();
  await assert.rejects(verifyStorage(f.root), /incomplete/);
});
test("rejects duplicate entries and paths outside the backup", async (t) => {
  const f = await fixture(t);
  f.manifest.objects[1] = f.manifest.objects[0];
  await f.save();
  await assert.rejects(verifyStorage(f.root), /Duplicate/);
  f.manifest.objects[0].file = "../outside";
  await f.save();
  await assert.rejects(verifyStorage(f.root), /local object path/);
});
