import { describe, it, beforeEach, expect, assert } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite");
import { MigrationRunner, Migration } from "../src/migrations.js";

describe("Query Store Migration Engine", () => {
  let db: DatabaseSync;
  let runner: MigrationRunner;

  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    runner = new MigrationRunner(db);
  });

  it("should apply initial migrations to a fresh DB", () => {
    const migrations: Migration[] = [
      {
        version: 1,
        name: "test_init",
        checksum: "v1",
        up: (db) => {
          db.exec("CREATE TABLE test (id INTEGER PRIMARY KEY)");
        }
      }
    ];

    const result = runner.migrate(migrations);
    expect(result.applied).toBe(1);

    const history = runner.getAppliedMigrations();
    expect(history).toHaveLength(1);
    expect(history[0].version).toBe(1);
    expect(history[0].name).toBe("test_init");
  });

  it("should apply migrations in sequential order", () => {
    const sequence: number[] = [];
    const migrations: Migration[] = [
      { version: 2, name: "m2", checksum: "v2", up: () => sequence.push(2) },
      { version: 1, name: "m1", checksum: "v1", up: () => sequence.push(1) }
    ];

    runner.migrate(migrations);
    expect(sequence).toEqual([1, 2]);
  });

  it("should skip already applied migrations", () => {
    const migrations: Migration[] = [
      { version: 1, name: "m1", checksum: "v1", up: (db) => db.exec("CREATE TABLE t1 (id int)") }
    ];

    runner.migrate(migrations);
    const result = runner.migrate(migrations);
    expect(result.applied).toBe(0);
  });

  it("should fail and rollback on migration error", () => {
    const migrations: Migration[] = [
      { version: 1, name: "m1", checksum: "v1", up: (db) => db.exec("CREATE TABLE t1 (id int)") },
      { version: 2, name: "m2", checksum: "v2", up: (db) => {
          db.exec("CREATE TABLE t2 (id int)");
          throw new Error("BOOM");
      }}
    ];

    expect(() => runner.migrate(migrations)).toThrow(/BOOM/);

    // Verify version 1 is still there but version 2 is NOT
    const history = runner.getAppliedMigrations();
    expect(history).toHaveLength(1);
    expect(history[0].version).toBe(1);

    // Verify table t2 was rolled back
    const table2 = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='t2'").get();
    expect(table2).toBeUndefined();
  });

  it("should fail on checksum mismatch", () => {
    const m1: Migration = { version: 1, name: "m1", checksum: "v1", up: (db) => db.exec("CREATE TABLE t1 (id int)") };
    runner.migrate([m1]);

    const m1Changed: Migration = { ...m1, checksum: "v1-changed" };
    expect(() => runner.migrate([m1Changed])).toThrow(/checksum mismatch/i);
  });

  it("should bootstrap legacy database with history", () => {
    // 1. Manually create tables as if it was a legacy DB
    db.exec("CREATE TABLE artifacts (artifact_id TEXT PRIMARY KEY)");
    
    const migrations: Migration[] = [
      { version: 1, name: "m1", checksum: "v1", up: () => {} }
    ];

    const bootstrapped = runner.bootstrapLegacy(1, migrations);
    expect(bootstrapped).toBe(true);

    const history = runner.getAppliedMigrations();
    expect(history).toHaveLength(1);
    expect(history[0].version).toBe(1);
  });

  it("should fail to bootstrap unknown legacy database", () => {
    const migrations: Migration[] = [
      { version: 1, name: "m1", checksum: "v1", up: () => {} }
    ];

    const bootstrapped = runner.bootstrapLegacy(1, migrations);
    expect(bootstrapped).toBe(false); // No 'artifacts' table found
  });
});
