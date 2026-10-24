import { describe, it, beforeEach, afterEach, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { HardkasStore } from "../src/db.js";
import { SqliteQueryBackend, classifySqlSafety } from "../src/backend.js";

// QUERY-STORE-PRAGMA-WRITE-1: a PRAGMA that sets a value is a write, refused by the pre-check before SQLite runs it.
// SQLite's own refusal on the read-only connection depends on the platform: `PRAGMA journal_mode = DELETE` fails with
// "disk I/O error" on Windows and with "database is locked" on Linux (the CI's ubuntu runner), and only the first was
// recognised as the read-only violation, so the SA-1 tests failed there.
const PRAGMA_WRITES = [
  "PRAGMA journal_mode = DELETE",
  "PRAGMA user_version = 4242",
  "pragma main.journal_mode=delete",
  "PRAGMA journal_mode(DELETE)",
  "PRAGMA user_version(7)",
  "/* comment */ PRAGMA application_id = 1;"
];
const PRAGMA_READS = [
  "PRAGMA journal_mode",
  "PRAGMA user_version",
  "PRAGMA table_info(artifacts)",
  "PRAGMA main.table_info(artifacts)",
  "PRAGMA index_list(artifacts)",
  "PRAGMA integrity_check(1)"
];

/** executeRawSql may refuse synchronously (the pre-check) or reject: either way, a rejected promise here. */
function exec(store: HardkasStore, sql: string, options?: { unsafeWrite?: boolean; yes?: boolean }): Promise<any[]> {
  return Promise.resolve().then(() => new SqliteQueryBackend(store).executeRawSql(sql, options));
}

/** What these PRAGMAs could change, read from the store's own connection. */
function header(store: HardkasStore): { userVersion: unknown; journalMode: unknown; applicationId: unknown } {
  const db = store.getDatabase();
  const one = (sql: string) => Object.values(db.prepare(sql).get() as object)[0];
  return { userVersion: one("PRAGMA user_version"), journalMode: one("PRAGMA journal_mode"), applicationId: one("PRAGMA application_id") };
}

describe("QUERY-STORE-PRAGMA-WRITE-1 · a PRAGMA that sets a value is refused before SQLite runs it", () => {
  let tmpDir: string;
  let store: HardkasStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-pragma-write-"));
    store = new HardkasStore({ dbPath: path.join(tmpDir, "store.db") });
    store.connect({ autoMigrate: true });
  });

  afterEach(() => {
    store?.disconnect();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("P-1 the pre-check classifies every PRAGMA assignment as a write, in both syntaxes and with a schema", () => {
    for (const sql of PRAGMA_WRITES) {
      expect({ sql, kind: classifySqlSafety(sql).kind }).toEqual({ sql, kind: "write" });
    }
  });

  it("P-2 control: PRAGMAs that only read stay reads, including those that take an argument", () => {
    for (const sql of PRAGMA_READS) {
      expect({ sql, kind: classifySqlSafety(sql).kind }).toEqual({ sql, kind: "read" });
    }
  });

  it("P-3 file-backed store: the refusal is the pre-check's, whatever error SQLite would give on this platform", async () => {
    const before = header(store);
    for (const sql of ["PRAGMA journal_mode = DELETE", "PRAGMA journal_mode(DELETE)", "PRAGMA user_version = 4242"]) {
      await expect(exec(store, sql)).rejects.toThrow(/^QUERY_STORE_READ_ONLY_VIOLATION: Query store is a derived projection/);
    }
    expect(header(store)).toEqual(before);
  });

  it("P-4 one flag alone names the missing one, as for every other write", async () => {
    const before = header(store);
    await expect(exec(store, "PRAGMA journal_mode = DELETE", { unsafeWrite: true })).rejects.toThrow(/^QUERY_STORE_WRITE_REQUIRES_YES/);
    await expect(exec(store, "PRAGMA journal_mode = DELETE", { yes: true })).rejects.toThrow(/^QUERY_STORE_WRITE_REQUIRES_UNSAFE_WRITE/);
    expect(header(store)).toEqual(before);
  });

  it("P-5 control: both flags still authorize the write", async () => {
    await exec(store, "PRAGMA user_version = 4242", { unsafeWrite: true, yes: true });
    expect(header(store).userVersion).toBe(4242);
  });

  it("P-6 control: reading PRAGMAs still answer on a file-backed store", async () => {
    expect((await exec(store, "PRAGMA table_info(artifacts)")).length).toBeGreaterThan(0);
    expect(await exec(store, "PRAGMA journal_mode")).toEqual([{ journal_mode: "wal" }]);
  });
});
