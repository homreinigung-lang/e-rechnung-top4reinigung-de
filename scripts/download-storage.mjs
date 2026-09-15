import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const sourceName = process.argv[2];
const outputRoot = process.argv[3];
const supabaseUrl = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const bucket = process.env.SUPABASE_BUCKET || "firmen-dateien";

if (!sourceName || !outputRoot) {
  console.error("Usage: SUPABASE_URL=... SUPABASE_SECRET_KEY=... node scripts/download-storage.mjs <source-name> <output-dir>");
  process.exit(2);
}
if (!supabaseUrl || !secretKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SECRET_KEY in the local process environment.");
  process.exit(2);
}

const client = createClient(supabaseUrl, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

async function listAll(prefix = "") {
  const out = [];
  let offset = 0;
  const limit = 1000;
  while (true) {
    const { data, error } = await client.storage.from(bucket).list(prefix, {
      limit,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw error;
    const rows = data ?? [];
    for (const item of rows) {
      const full = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id) out.push({ path: full, metadata: item.metadata ?? null, updated_at: item.updated_at ?? null });
      else out.push(...(await listAll(full)));
    }
    if (rows.length < limit) break;
    offset += rows.length;
  }
  return out;
}

const objects = await listAll();
const manifest = [];

for (const [index, object] of objects.entries()) {
  const { data, error } = await client.storage.from(bucket).download(object.path);
  if (error) throw new Error(`Download failed for ${object.path}: ${error.message}`);
  const bytes = Buffer.from(await data.arrayBuffer());
  const dest = path.join(outputRoot, object.path.split("/").join(path.sep));
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, bytes, { flag: "wx" });
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  manifest.push({
    source: sourceName,
    bucket,
    path: object.path,
    size: bytes.length,
    sha256,
    content_type: object.metadata?.mimetype ?? null,
    source_updated_at: object.updated_at,
  });
  console.log(`[${index + 1}/${objects.length}] ${object.path}`);
}

await mkdir(outputRoot, { recursive: true });
await writeFile(
  path.join(outputRoot, "storage-manifest.json"),
  JSON.stringify({ source: sourceName, bucket, object_count: manifest.length, objects: manifest }, null, 2) + "\n",
  { flag: "wx" },
);

console.log(`STORAGE_BACKUP_OK: ${manifest.length} objects`);
console.log(`MANIFEST_OK: ${path.join(outputRoot, "storage-manifest.json")}`);
