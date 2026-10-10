import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { digest, verifyStorage } from "./backup-manifest.mjs";

const root = process.argv[2];
if (!root)
  throw new Error(
    "Usage: node scripts/restore-storage.mjs <storage-backup-directory> [--apply-test]",
  );
const manifest = await verifyStorage(root);
if (manifest.scope !== "all-buckets") throw new Error("Full storage backup required");
if (!process.argv.includes("--apply-test")) {
  console.log(`RESTORE_DRY_RUN_OK: ${manifest.object_count} verified files; nothing uploaded.`);
  process.exit(0);
}
const target = process.env.TEST_SUPABASE_URL;
const secret = process.env.TEST_SUPABASE_SECRET_KEY;
const expected = process.env.TEST_PROJECT_REF;
if (!target || !secret || !expected || !/^[a-z0-9]{20}$/.test(expected))
  throw new Error("Test project URL, key and exact project ref required");
const origin = new URL(target).origin;
if (
  origin !== `https://${expected}.supabase.co` ||
  origin === manifest.source_origin ||
  expected === "squkjqvofugkanzuqtqn"
)
  throw new Error("Refusing production/source project or mismatched target");
const client = createClient(origin, secret, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: buckets, error } = await client.storage.listBuckets();
if (error) throw new Error("Cannot inspect test buckets");
for (const bucket of manifest.buckets) {
  if (!buckets?.some((b) => b.id === bucket.id && b.public === bucket.public)) {
    throw new Error("Prepare matching bucket configuration in the isolated test project first");
  }
}
for (const object of manifest.objects) {
  const bytes = await readFile(path.join(root, object.file));
  const bucket = client.storage.from(object.bucket);
  const { error: uploadError } = await bucket.upload(object.path, bytes, {
    contentType: object.content_type,
    upsert: false,
  });
  // Never overwrite an existing object; only accept it if the bytes already match.
  const { data: downloaded, error: downloadError } = await bucket.download(object.path);
  if (
    downloadError ||
    !downloaded ||
    digest(Buffer.from(await downloaded.arrayBuffer())) !== object.sha256
  ) {
    throw new Error(
      uploadError
        ? "Upload failed or existing test file differs"
        : "Restored file verification failed",
    );
  }
}
console.log(`TEST_STORAGE_RESTORE_VERIFIED: ${manifest.object_count} files`);
console.log("Database restore and application-level checks must be recorded separately.");
