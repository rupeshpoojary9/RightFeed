import "server-only";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const DB_PATH = process.env.MYTUBE_DB ?? path.join(process.cwd(), "data", "mytube.db");

const SCHEMA = fs.readFileSync(path.join(process.cwd(), "lib", "schema.sql"), "utf8");

type GlobalWithDb = typeof globalThis & { __mytubeDb?: DatabaseSync };

export function db(): DatabaseSync {
  const g = globalThis as GlobalWithDb;
  if (!g.__mytubeDb) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    const conn = new DatabaseSync(DB_PATH);
    conn.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    conn.exec(SCHEMA);
    g.__mytubeDb = conn;
  }
  return g.__mytubeDb;
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
