import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import crypto from "node:crypto";
const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite");

// SA-1 (SECURITY-AUDIT-1, 2026-10-21): `hardkas query store sql` without --unsafe-write --yes must not change the
// projection, whatever the classifier thinks of the statement. Each statement below passed as a "read" and changed the
// database on the release-candidate combination (the existing query-store-security tests never covered them).
const cliPath = path.resolve(__dirname, "../dist/index.js");
const BYPASSES: Array<[string, string]> = [
  ["PRAGMA user_version assignment", "PRAGMA user_version = 4242"],
  ["PRAGMA journal_mode assignment", "PRAGMA journal_mode = DELETE"],
  ["CTE + DELETE with a tab", "WITH a AS (SELECT 1) DELETE\tFROM artifacts"],
  ["CTE + DELETE with a newline", "WITH a AS (SELECT 1) DELETE\nFROM lineage_edges"],
  ["CTE + DELETE with a comment", "WITH a AS (SELECT 1) DELETE/**/FROM metadata"],
  ["CTE + REPLACE INTO", "WITH a AS (SELECT 1) REPLACE INTO metadata(key, value) VALUES ('generation_id', 'forged')"],
  ["CTE + UPDATE with a tab", "WITH a AS (SELECT 1) UPDATE\tartifacts SET kind = 'tampered'"]
];

let testDir: string;
let dbPath: string;

function runCli(args: string[]): { stdout: string; stderr: string; status: number | null } {
  try {
    const stdout = execFileSync("node", [cliPath, ...args], {
      encoding: "utf8",
      stdio: "pipe",
      cwd: testDir,
      env: { ...process.env, HARDKAS_PROJECTION_BACKEND: "sqlite", HARDKAS_QUERY_STORE_PATH: dbPath }
    });
    return { stdout, stderr: "", status: 0 };
  } catch (error: any) {
    return { stdout: error.stdout || "", stderr: error.stderr || "", status: error.status };
  }
}

function fingerprint(): string {
  const db = new DatabaseSync(dbPath);
  try {
    const parts: unknown[] = [db.prepare("PRAGMA user_version").get(), db.prepare("PRAGMA journal_mode").get()];
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as Array<{ name: string }>).map((r) => r.name);
    parts.push(tables);
    for (const t of tables) parts.push(db.prepare(`SELECT * FROM "${t}"`).all());
    return crypto.createHash("sha256").update(JSON.stringify(parts, (_k, v) => (typeof v === "bigint" ? v.toString() : v))).digest("hex");
  } finally {
    db.close();
  }
}

describe("SA-1 · hardkas query store sql: read-only enforced by SQLite", () => {
  beforeEach(async () => {
    testDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "hardkas-sa1-cli-"));
    dbPath = path.join(testDir, "store.db");
    runCli(["query", "store", "rebuild"]);
    // something to delete or tamper with, written through the explicit write path
    const seeded = runCli(["query", "store", "sql", "INSERT OR REPLACE INTO metadata (key, value) VALUES ('generation_id', 'seed-generation')", "--unsafe-write", "--yes"]);
    if (seeded.status !== 0) throw new Error(`seed failed: ${seeded.stderr}`);
  });

  afterEach(async () => {
    await fs.promises.rm(testDir, { recursive: true, force: true });
  });

  for (const [label, sql] of BYPASSES) {
    it(`refuses and changes nothing: ${label}`, () => {
      const before = fingerprint();
      const res = runCli(["query", "store", "sql", sql]);
      expect(res.status).not.toBe(0);
      expect(res.stderr + res.stdout).toContain("QUERY_STORE_READ_ONLY_VIOLATION");
      expect(fingerprint()).toBe(before);
    });
  }

  it("refuses in --json mode with one JSON document naming the violation", () => {
    const before = fingerprint();
    const res = runCli(["query", "store", "sql", "PRAGMA user_version = 9", "--json"]);
    expect(res.status).not.toBe(0);
    const doc = JSON.parse(res.stdout.trim());
    expect(doc.ok).toBe(false);
    expect(JSON.stringify(doc)).toContain("QUERY_STORE_READ_ONLY_VIOLATION");
    expect(fingerprint()).toBe(before);
  });

  it("still answers reads, including read-only PRAGMAs", () => {
    const res = runCli(["query", "store", "sql", "SELECT value FROM metadata WHERE key = 'generation_id'", "--json"]);
    expect(res.status).toBe(0);
    expect(JSON.parse(res.stdout).result).toEqual([{ value: "seed-generation" }]);
    expect(runCli(["query", "store", "sql", "PRAGMA user_version", "--json"]).status).toBe(0);
  });
});
