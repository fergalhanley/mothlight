import { Database } from "bun:sqlite";
import { resolve, join } from "node:path";
import { mkdir, cp, access } from "node:fs/promises";

// Run with both studio servers stopped to obtain a consistent snapshot of metadata + media.
const source = resolve(process.env.MOTHLIGHT_V1_DATA_DIR || process.env.MOTHLIGHT_DATA_DIR || ".mothlight");
const destination = resolve(process.env.MOTHLIGHT_V2_DATA_DIR || ".mothlight-v2");
if (source === destination) throw new Error("v1 and v2 data directories cannot match.");
await access(join(source, "studio.sqlite"));
try {
  await access(destination);
  throw new Error("v2 data directory already exists. Refusing to overwrite it.");
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}
await mkdir(destination, { recursive: true });
const db = new Database(join(source, "studio.sqlite"), { readonly: true });
try {
  // VACUUM INTO takes a coherent SQLite snapshot, including committed WAL pages.
  db.query("VACUUM INTO ?").run(join(destination, "studio.sqlite"));
} finally { db.close(); }
try {
  await cp(join(source, "media"), join(destination, "media"), { recursive: true });
} catch (error) {
  throw new Error("Database copied but media copy failed; remove the incomplete v2 directory and retry. " + (error as Error).message);
}
const copy = new Database(join(destination, "studio.sqlite"));
try {
  // Never automatically repeat potentially billable generation jobs in a cloned database.
  copy.query("UPDATE jobs SET status='cancelled', error='Cloned into v2; not resubmitted' WHERE status IN ('queued','running')").run();
} finally { copy.close(); }
console.log("v1 snapshot cloned into " + destination + " (main database untouched).");
