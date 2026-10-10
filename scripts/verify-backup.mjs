import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileDigest, verifyStorage } from "./backup-manifest.mjs";

const root = process.argv[2];
if (!root) throw new Error("Usage: node scripts/verify-backup.mjs <source-backup-directory>");
const dbRoot = path.join(root, "db");
const dumps = (await readdir(dbRoot)).filter((name) => name.endsWith(".dump"));
if (dumps.length !== 1) throw new Error("Expected exactly one database dump");
const dump = path.join(dbRoot, dumps[0]);
const checksum = (await readFile(`${dump}.sha256`, "utf8")).split(/\s+/)[0];
if ((await fileDigest(dump)) !== checksum) throw new Error("Database checksum mismatch");
const result = spawnSync("pg_restore", ["--list", dump], { encoding: "utf8" });
if (result.status !== 0)
  throw new Error("pg_restore cannot read the database dump; install matching PostgreSQL tools");
const storage = await verifyStorage(path.join(root, "storage"));
if (storage.scope !== "all-buckets")
  throw new Error("Only one bucket was backed up; this is not a full storage backup");
console.log(
  `BACKUP_INTEGRITY_OK: database archive readable, ${storage.object_count} file checksums verified`,
);
console.log("A successful restore in an isolated test project is still required.");
