import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { digest, objectFile, verifyStorage } from "./backup-manifest.mjs";

const [sourceName, outputRoot] = process.argv.slice(2);
const supabaseUrl = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!sourceName || !outputRoot || !supabaseUrl || !secretKey) {
  throw new Error(
    "Usage: set SUPABASE_URL and SUPABASE_SECRET_KEY; node scripts/download-storage.mjs <source-name> <new-output-dir>",
  );
}
const sourceOrigin = new URL(supabaseUrl).origin;
const client = createClient(sourceOrigin, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const { data: allBuckets, error: bucketError } = await client.storage.listBuckets();
if (bucketError) throw new Error("Cannot list storage buckets");
const buckets = (allBuckets ?? []).filter(
  (b) => !process.env.SUPABASE_BUCKET || b.id === process.env.SUPABASE_BUCKET,
);
if (process.env.SUPABASE_BUCKET && buckets.length !== 1)
  throw new Error("Requested bucket not found");

async function listAll(bucket, prefix = "") {
  const out = [];
  let offset = 0;
  while (true) {
    const { data, error } = await client.storage.from(bucket).list(prefix, {
      limit: 100,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw new Error("Cannot list storage objects");
    const rows = data ?? [];
    for (const item of rows) {
      const full = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id)
        out.push({ bucket, path: full, metadata: item.metadata, updated_at: item.updated_at });
      else out.push(...(await listAll(bucket, full)));
    }
    if (rows.length === 0) break;
    offset += rows.length;
  }
  return out;
}
// Require a fresh directory, so an incomplete previous run is never called complete.
await mkdir(outputRoot, { recursive: false, mode: 0o700 });
await mkdir(path.join(outputRoot, "objects"), { mode: 0o700 });
const objects = [];
for (const bucket of buckets) {
  const before = await listAll(bucket.id);
  for (const object of before) {
    const { data, error } = await client.storage.from(bucket.id).download(object.path);
    if (error || !data) throw new Error("Storage download failed");
    const bytes = Buffer.from(await data.arrayBuffer());
    const file = objectFile(bucket.id, object.path);
    await writeFile(path.join(outputRoot, file), bytes, { flag: "wx", mode: 0o600 });
    objects.push({
      bucket: bucket.id,
      path: object.path,
      file,
      size: bytes.length,
      sha256: digest(bytes),
      content_type: data.type || object.metadata?.mimetype || "application/octet-stream",
    });
  }
  const after = await listAll(bucket.id);
  if (JSON.stringify(before) !== JSON.stringify(after))
    throw new Error("Storage changed during backup; repeat during a quiet period");
}
const { data: finalBuckets, error: finalBucketError } = await client.storage.listBuckets();
const bucketConfig = (list) =>
  JSON.stringify(list.map((b) => [b.id, b.public]).sort((a, b) => a[0].localeCompare(b[0])));
if (finalBucketError || bucketConfig(allBuckets ?? []) !== bucketConfig(finalBuckets ?? [])) {
  throw new Error("Storage buckets changed during backup; repeat during a quiet period");
}
const manifest = {
  format: "gebcalc-storage-backup-v2",
  source: sourceName,
  source_origin: sourceOrigin,
  created_at: new Date().toISOString(),
  scope: process.env.SUPABASE_BUCKET ? "single-bucket" : "all-buckets",
  buckets: buckets.map((b) => ({ id: b.id, public: b.public })),
  object_count: objects.length,
  objects,
};
await writeFile(path.join(outputRoot, "storage-manifest.json"), JSON.stringify(manifest, null, 2), {
  flag: "wx",
  mode: 0o600,
});
await verifyStorage(outputRoot);
console.log(`STORAGE_BACKUP_VERIFIED: ${buckets.length} buckets, ${objects.length} objects`);
