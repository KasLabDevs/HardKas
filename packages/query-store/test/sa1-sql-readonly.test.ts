import { describe, it, beforeEach, afterEach, expect } from "vitest";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { HardkasStore } from "../src/db.js";
import { SqliteQueryBackend } from "../src/backend.js";
const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite");

// SA-1 (SECURITY-AUDIT-1, 2026-10-21): the query store's raw SQL is read-only unless the caller authorizes a write with
// BOTH { unsafeWrite: true, yes: true }. The guarantee comes from SQLite, not from the lexical classifier: every statement
// below was classified as a "read" by `classifySqlSafety` and changed the database (reproduced on the release-candidate combination).
const BYPASSES: Array<[string, string]> = [
  ["PRAGMA assignment (header)", "PRAGMA user_version = 4242"],
  ["PRAGMA assignment (journal mode)", "PRAGMA journal_mode = DELETE"],
  ["CTE + DELETE, tab separator", "WITH a AS (SELECT 1) DELETE\tFROM artifacts"],
  ["CTE + DELETE, newline separator", "WITH a AS (SELECT 1) DELETE\nFROM lineage_edges"],
  ["CTE + DELETE, comment separator", "WITH a AS (SELECT 1) DELETE/**/FROM metadata"],
  ["CTE + REPLACE INTO", "WITH a AS (SELECT 1) REPLACE INTO metadata(key, value) VALUES ('generation_id', 'forged')"],
  ["CTE + UPDATE, tab separator", "WITH a AS (SELECT 1) UPDATE\tartifacts SET kind = 'tampered'"]
];
// refused before any execution by the lexical pre-check (kept as the early, friendlier refusal)
const CONTROLS = [
  "DELETE FROM artifacts",
  "UPDATE artifacts SET kind = 'x'",
  "INSERT INTO metadata(key, value) VALUES ('x', 'y')",
  "DROP TABLE lineage_edges",
  "SELECT 1; DELETE FROM artifacts",
  "VACUUM",
  "ANALYZE",
  "WITH a AS (SELECT 1) DELETE FROM artifacts"
];

/** executeRawSql may refuse synchronously (the lexical pre-check) or reject: either way, a rejected promise here. */
function exec(store: HardkasStore, sql: string, options?: { unsafeWrite?: boolean; yes?: boolean }): Promise<any[]> {
  return Promise.resolve().then(() => new SqliteQueryBackend(store).executeRawSql(sql, options));
}

/** One row in every table that accepts a synthetic row, so a DELETE or UPDATE has something to change. */
function seed(db: any): void {
  db.exec("PRAGMA foreign_keys = OFF;");
  for (const table of ["artifacts", "lineage_edges", "metadata", "events"]) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string; type: string }>;
    if (cols.length === 0) continue;
    const names = cols.map((c) => c.name);
    const values = cols.map((c) => (/INT|REAL|NUM/i.test(c.type) ? 1 : `${table}-${c.name}-seed`));
    db.prepare(`INSERT OR IGNORE INTO ${table} (${names.join(", ")}) VALUES (${names.map(() => "?").join(", ")})`).run(...values);
  }
  db.prepare("INSERT OR REPLACE INTO metadata (key, value) VALUES ('generation_id', 'seed-generation')").run();
}

/** Everything a write could change: header values and a content hash of every table. Read only. */
function fingerprint(dbPath: string): Record<string, unknown> {
  const db = new DatabaseSync(dbPath);
  try {
    const out: Record<string, unknown> = {
      userVersion: Object.values(db.prepare("PRAGMA user_version").get() as object)[0],
      journalMode: Object.values(db.prepare("PRAGMA journal_mode").get() as object)[0]
    };
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as Array<{ name: string }>).map((r) => r.name);
    for (const t of tables) {
      const rows = db.prepare(`SELECT * FROM "${t}"`).all();
      out[t] = crypto.createHash("sha256").update(JSON.stringify(rows, (_k, v) => (typeof v === "bigint" ? v.toString() : v))).digest("hex");
    }
    return out;
  } finally {
    db.close();
  }
}

describe("SA-1 · query store raw SQL is read-only at the SQLite level (file-backed store)", () => {
  let tmpDir: string;
  let dbPath: string;
  let store: HardkasStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-sa1-"));
    dbPath = path.join(tmpDir, "store.db");
    store = new HardkasStore({ dbPath });
    store.connect({ autoMigrate: true });
    seed(store.getDatabase());
  });

  afterEach(() => {
    store?.disconnect();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  for (const [label, sql] of BYPASSES) {
    it(`refuses and leaves the database unchanged: ${label}`, async () => {
      const before = fingerprint(dbPath);
      await expect(exec(store, sql)).rejects.toThrow(/QUERY_STORE_READ_ONLY_VIOLATION/);
      expect(fingerprint(dbPath)).toEqual(before);
    });
  }

  for (const sql of BYPASSES.map(([, s]) => s)) {
    it(`one flag alone never authorizes a write: ${JSON.stringify(sql).slice(0, 60)}`, async () => {
      const before = fingerprint(dbPath);
      await expect(exec(store, sql, { unsafeWrite: true })).rejects.toThrow(/QUERY_STORE_/);
      await expect(exec(store, sql, { yes: true })).rejects.toThrow(/QUERY_STORE_/);
      expect(fingerprint(dbPath)).toEqual(before);
    });
  }

  for (const sql of CONTROLS) {
    it(`keeps refusing (lexical pre-check): ${JSON.stringify(sql).slice(0, 60)}`, async () => {
      const before = fingerprint(dbPath);
      await expect(exec(store, sql)).rejects.toThrow(/QUERY_STORE_READ_ONLY_VIOLATION/);
      expect(fingerprint(dbPath)).toEqual(before);
    });
  }

  it("never creates a file through ATTACH", async () => {
    const target = path.join(tmpDir, "attached.db");
    await expect(exec(store, `ATTACH DATABASE '${target.replace(/\\/g, "/")}' AS x`)).rejects.toThrow();
    expect(fs.existsSync(target)).toBe(false);
  });

  it("still answers reads: SELECT, WITH ... SELECT, EXPLAIN and read-only PRAGMAs", async () => {
    expect(await exec(store, "SELECT value FROM metadata WHERE key = 'generation_id'")).toEqual([{ value: "seed-generation" }]);
    expect((await exec(store, "WITH c AS (SELECT 1 AS ok) SELECT * FROM c"))[0]).toEqual({ ok: 1 });
    expect((await exec(store, "EXPLAIN SELECT * FROM artifacts")).length).toBeGreaterThan(0);
    expect((await exec(store, "PRAGMA table_info(artifacts)")).length).toBeGreaterThan(0);
    expect(await exec(store, "PRAGMA user_version")).toHaveLength(1);
  });

  it("keeps the explicit, controlled write path: both flags authorize a write", async () => {
    await exec(store, "INSERT INTO metadata (key, value) VALUES ('sa1-authorized', 'yes')", { unsafeWrite: true, yes: true });
    expect(await exec(store, "SELECT value FROM metadata WHERE key = 'sa1-authorized'")).toEqual([{ value: "yes" }]);
    await exec(store, "CREATE TABLE sa1_tmp (id TEXT); DROP TABLE sa1_tmp;", { unsafeWrite: true, yes: true });
  });

  it("a read leaves no -wal/-shm behind once the store is closed", async () => {
    await exec(store, "SELECT COUNT(*) AS n FROM artifacts");
    store.disconnect();
    expect(fs.existsSync(`${dbPath}-wal`)).toBe(false);
    expect(fs.existsSync(`${dbPath}-shm`)).toBe(false);
  });
});

describe("SA-1 · query store raw SQL is read-only at the SQLite level (in-memory store)", () => {
  let store: HardkasStore;

  beforeEach(() => {
    store = new HardkasStore({ memory: true });
    store.connect({ autoMigrate: true });
    seed(store.getDatabase());
  });

  afterEach(() => store?.disconnect());

  function memoryFingerprint(): string {
    const db = store.getDatabase();
    const parts: unknown[] = [db.prepare("PRAGMA user_version").get()];
    for (const t of ["artifacts", "lineage_edges", "metadata"]) parts.push(db.prepare(`SELECT * FROM ${t}`).all());
    return JSON.stringify(parts, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
  }

  for (const [label, sql] of BYPASSES.filter(([l]) => !l.includes("journal mode"))) {
    it(`refuses and leaves the in-memory database unchanged: ${label}`, async () => {
      const before = memoryFingerprint();
      await expect(exec(store, sql)).rejects.toThrow(/QUERY_STORE_READ_ONLY_VIOLATION/);
      expect(memoryFingerprint()).toEqual(before);
    });
  }

  it("restores writability for the authorized path afterwards", async () => {
    await expect(exec(store, "PRAGMA user_version = 7")).rejects.toThrow();
    await exec(store, "INSERT INTO metadata (key, value) VALUES ('sa1-mem', 'ok')", { unsafeWrite: true, yes: true });
    expect(await exec(store, "SELECT value FROM metadata WHERE key = 'sa1-mem'")).toEqual([{ value: "ok" }]);
  });
});
