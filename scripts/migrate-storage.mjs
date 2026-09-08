import { createClient } from "@supabase/supabase-js";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const BUCKET = "firmen-dateien";
const OWNER_ID = "e31f5d86-4da3-4aed-a6a0-0931a4594e24";
const EXPECTED = {
  ausschreibung: 2,
  belege: 9,
  "e-rechnungen": 3,
  gobd: 6,
  kalkulation: 11,
  projekte: 10,
  signatur: 1,
};
const EXPECTED_TOTAL = Object.values(EXPECTED).reduce((sum, n) => sum + n, 0);

const root = process.argv[2];
const supabaseUrl = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (!root) {
  console.error("Usage: node scripts/migrate-storage.mjs <local-owner-folder>");
  process.exit(2);
}
if (!supabaseUrl || !secretKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SECRET_KEY in the local process environment.");
  process.exit(2);
}

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

function contentType(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".xml") return "application/xml";
  return "application/octet-stream";
}

const rootStat = await stat(root).catch(() => null);
if (!rootStat?.isDirectory()) {
  console.error(`Local folder not found: ${root}`);
  process.exit(2);
}

const files = await walk(root);
const folderCounts = Object.fromEntries(Object.keys(EXPECTED).map((name) => [name, 0]));
const prepared = files.map((fullPath) => {
  const relative = path.relative(root, fullPath).split(path.sep).join("/");
  const topFolder = relative.split("/")[0];
  if (!(topFolder in EXPECTED)) {
    throw new Error(`Unexpected top-level folder: ${topFolder}`);
  }
  folderCounts[topFolder] += 1;
  return {
    fullPath,
    relative,
    remotePath: `${OWNER_ID}/${relative}`,
  };
});

if (prepared.length !== EXPECTED_TOTAL) {
  throw new Error(`Safety check failed: expected ${EXPECTED_TOTAL} files, found ${prepared.length}.`);
}
for (const [folder, expected] of Object.entries(EXPECTED)) {
  if (folderCounts[folder] !== expected) {
    throw new Error(
      `Safety check failed for ${folder}: expected ${expected}, found ${folderCounts[folder]}.`,
    );
  }
}

console.log(`Validated ${prepared.length} local files. Starting guarded upload with upsert=false.`);

const supabase = createClient(supabaseUrl, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

let uploaded = 0;
for (const file of prepared.sort((a, b) => a.relative.localeCompare(b.relative))) {
  const body = await readFile(file.fullPath);
  const { error } = await supabase.storage.from(BUCKET).upload(file.remotePath, body, {
    contentType: contentType(file.fullPath),
    cacheControl: "3600",
    upsert: false,
  });
  if (error) {
    console.error(`UPLOAD FAILED after ${uploaded}/${EXPECTED_TOTAL}: ${file.relative}`);
    console.error(error);
    process.exit(1);
  }
  uploaded += 1;
  console.log(`[${uploaded}/${EXPECTED_TOTAL}] ${file.relative}`);
}

console.log(`UPLOAD COMPLETE: ${uploaded}/${EXPECTED_TOTAL}`);
console.log("Next step: verify storage.objects in Supabase before changing any production configuration.");
