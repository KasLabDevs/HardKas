import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { Hardkas } from "../src/index.js";
import { HardkasStore } from "@hardkas/query-store";
const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite");

// SA-1 (SECURITY-AUDIT-1, 2026-10-21): the SDK's raw SQL (`hardkas.query.store.query`) must be as read-only as the CLI's
// `hardkas query store sql`: one authority, enforced by SQLite, writes only with { unsafeWrite: true, yes: true }. Its own
// token list let these statements change the projection (reproduced on the release-candidate combination).
const MUST_REFUSE: Array<[string, string]> = [
  ["PRAGMA assignment", "PRAGMA user_version = 77"],
  ["ANALYZE (creates sqlite_stat1)", "ANALYZE"],
  ["VACUUM", "VACUUM"],
  ["CTE + DELETE with a tab", "WITH a AS (SELECT 1) DELETE\tFROM metadata"],
  ["plain DELETE", "DELETE FROM metadata"]
];

function fingerprint(dbPath: string): string {
  const db = new DatabaseSync(dbPath);
  try {
    const parts: unknown[] = [db.prepare("PRAGMA user_version").get()];
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as Array<{ name: string }>).map((r) => r.name);
    parts.push(tables);
    for (const t of tables) parts.push(db.prepare(`SELECT * FROM "${t}"`).all());
    return crypto.createHash("sha256").update(JSON.stringify(parts, (_k, v) => (typeof v === "bigint" ? v.toString() : v))).digest("hex");
  } finally {
    db.close();
  }
}

describe("SA-1 · SDK hardkas.query.store.query is read-only at the SQLite level", () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-sa1-sdk-"));
    dbPath = path.join(tmpDir, ".hardkas", "store.db");
    const store = new HardkasStore({ dbPath });
    store.connect({ autoMigrate: true });
    store.getDatabase().prepare("INSERT OR REPLACE INTO metadata (key, value) VALUES ('generation_id', 'seed-generation')").run();
    store.disconnect();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  for (const [label, sql] of MUST_REFUSE) {
    it(`refuses and leaves the projection unchanged: ${label}`, async () => {
      const sdk = await Hardkas.open({ cwd: tmpDir });
      try {
        const before = fingerprint(dbPath);
        await expect(sdk.query.store.query(sql)).rejects.toThrow();
        expect(fingerprint(dbPath)).toBe(before);
      } finally {
        await sdk.close();
      }
    });
  }

  it("never creates a file through ATTACH", async () => {
    const sdk = await Hardkas.open({ cwd: tmpDir });
    const target = path.join(tmpDir, "attached-by-sdk.db");
    try {
      await expect(sdk.query.store.query(`ATTACH DATABASE '${target.replace(/\\/g, "/")}' AS x`)).rejects.toThrow();
      expect(fs.existsSync(target)).toBe(false);
    } finally {
      await sdk.close();
    }
  });

  it("answers reads", async () => {
    const sdk = await Hardkas.open({ cwd: tmpDir });
    try {
      expect(await sdk.query.store.query("SELECT value FROM metadata WHERE key = 'generation_id'")).toEqual([{ value: "seed-generation" }]);
    } finally {
      await sdk.close();
    }
  });

  it("keeps the explicit write path: { unsafeWrite: true, yes: true }", async () => {
    const sdk = await Hardkas.open({ cwd: tmpDir });
    try {
      await sdk.query.store.query("INSERT INTO metadata (key, value) VALUES ('sa1-sdk', 'ok')", { unsafeWrite: true, yes: true });
      expect(await sdk.query.store.query("SELECT value FROM metadata WHERE key = 'sa1-sdk'")).toEqual([{ value: "ok" }]);
    } finally {
      await sdk.close();
    }
  });
});
