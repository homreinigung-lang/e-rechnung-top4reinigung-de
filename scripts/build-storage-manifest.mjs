import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.argv[2];
const output = process.argv[3] ?? "storage-manifest.json";
const source = process.argv[4] ?? "unknown";
const bucket = process.argv[5] ?? "firmen-dateien";

if (!root) {
  console.error(
    "Usage: node scripts/build-storage-manifest.mjs <storage-root> [output.json] [source-name] [bucket]",
  );
  process.exit(2);
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else if (entry.isFile()) files.push(full);
  }
  return files;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

const rootStat = await stat(root).catch(() => null);
if (!rootStat?.isDirectory()) {
  console.error(`Storage root not found: ${root}`);
  process.exit(2);
}

const files = (await walk(root)).sort((a, b) => a.localeCompare(b));
const objects = [];

for (const fullPath of files) {
  const bytes = await readFile(fullPath);
  const relativePath = path.relative(root, fullPath).split(path.sep).join("/");
  const info = await stat(fullPath);
  objects.push({
    source,
    bucket,
    path: relativePath,
    size: info.size,
    sha256: sha256(bytes),
  });
}

const manifest = {
  format: "gebcalc-storage-manifest-v1",
  source,
  bucket,
  root: path.resolve(root),
  objectCount: objects.length,
  totalBytes: objects.reduce((sum, object) => sum + object.size, 0),
  objects,
};

await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(
  `Storage manifest written: ${output} (${manifest.objectCount} objects, ${manifest.totalBytes} bytes)`,
);
