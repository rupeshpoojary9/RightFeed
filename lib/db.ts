import "server-only";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const DB_PATH = process.env.RIGHTFEED_DB ?? path.join(process.cwd(), "data", "rightfeed.db");

const SCHEMA = fs.readFileSync(path.join(process.cwd(), "lib", "schema.sql"), "utf8");

type GlobalWithDb = typeof globalThis & { __rightfeedDb?: DatabaseSync };

export function db(): DatabaseSync {
  const g = globalThis as GlobalWithDb;
  if (!g.__rightfeedDb) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    const conn = new DatabaseSync(DB_PATH);
    conn.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    conn.exec(SCHEMA);
    const columns = conn.prepare("PRAGMA table_info(path_items)").all() as { name: string }[];
    if (!columns.some((c) => c.name === "section_id")) conn.exec("ALTER TABLE path_items ADD COLUMN section_id INTEGER");
    g.__rightfeedDb = conn;
  }
  return g.__rightfeedDb;
}

type Param = string | number | null | bigint;

// node:sqlite returns null-prototype rows; copy them into plain objects so they
// can be passed to client components and serialized normally.
const plain = <T>(row: unknown): T => ({ ...(row as object) }) as T;

export function all<T>(sql: string, ...params: Param[]): T[] {
  return db().prepare(sql).all(...params).map((r) => plain<T>(r));
}

export function get<T>(sql: string, ...params: Param[]): T | undefined {
  const row = db().prepare(sql).get(...params);
  return row === undefined ? undefined : plain<T>(row);
}

export function run(sql: string, ...params: Param[]) {
  return db().prepare(sql).run(...params);
}

export function tx<T>(fn: () => T): T {
  const conn = db();
  conn.exec("BEGIN");
  try {
    const out = fn();
    conn.exec("COMMIT");
    return out;
  } catch (e) {
    conn.exec("ROLLBACK");
    throw e;
  }
}
