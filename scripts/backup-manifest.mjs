import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

export function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
export async function fileDigest(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}
export function objectFile(bucket, name) {
  return `objects/${digest(Buffer.from(JSON.stringify([bucket, name])))}`;
}

export async function verifyStorage(root) {
  const base = await realpath(root);
  const manifest = JSON.parse(await readFile(path.join(base, "storage-manifest.json"), "utf8"));
  if (
    manifest.format !== "gebcalc-storage-backup-v2" ||
    !Array.isArray(manifest.objects) ||
    manifest.object_count !== manifest.objects.length ||
    !Array.isArray(manifest.buckets)
  ) {
    throw new Error("Invalid or incomplete storage manifest");
  }
  const seen = new Set();
  for (const object of manifest.objects) {
    if (
      typeof object.bucket !== "string" ||
      typeof object.path !== "string" ||
      !object.path ||
      !manifest.buckets.some((bucket) => bucket.id === object.bucket)
    )
      throw new Error("Invalid storage object");
    const key = JSON.stringify([object.bucket, object.path]);
    if (seen.has(key)) throw new Error("Duplicate storage object");
    seen.add(key);
    if (object.file !== objectFile(object.bucket, object.path))
      throw new Error("Invalid local object path");
    const file = await realpath(path.join(base, object.file));
    if (!file.startsWith(base + path.sep)) throw new Error("Object escapes backup directory");
    const info = await stat(file);
    if (info.size !== object.size || (await fileDigest(file)) !== object.sha256)
      throw new Error("Storage checksum mismatch");
  }
  return manifest;
}
