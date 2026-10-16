import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
export const dataDir = resolve(process.env.MOTHLIGHT_V2_DATA_DIR || ".mothlight-v2");
mkdirSync(join(dataDir, "media"), { recursive: true });
export function openDatabase(path = join(dataDir, "studio.sqlite")) {
  const db = new Database(path, { create: true, strict: true });
  db.exec(
    "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;",
  );
  db.exec(schema);
  return db;
}
const schema = await Bun.file(new URL("./schema.sql", import.meta.url)).text();
export const db = openDatabase();
export type Row = Record<string, any>;
export const one = (sql: string, ...args: any[]): Row | null =>
  db.query(sql).get(...args) as Row | null;
export const all = (sql: string, ...args: any[]): Row[] =>
  db.query(sql).all(...args) as Row[];
export const run = (sql: string, ...args: any[]) => db.query(sql).run(...args);
export const id = () => crypto.randomUUID();
