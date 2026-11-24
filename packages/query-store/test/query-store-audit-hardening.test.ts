import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { HardkasStore } from "../src/db.js";
import { SqliteQueryBackend } from "../src/backend.js";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite");

describe("Priority 7 · query-store db & backend hardening", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("SqliteQueryBackend.findArtifacts checkpoints WAL via db.exec rather than calling missing db.pragma", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hk-qs-wal-"));
    const dbPath = path.join(tmp, "store.db");
    const store = new HardkasStore({ dbPath });
    try {
      store.connect({ autoMigrate: true });
      const db = store.getDatabase();
      const execSpy = vi.spyOn(db, "exec");
      const backend = new SqliteQueryBackend(store);
      await backend.findArtifacts();
      expect(execSpy).toHaveBeenCalledWith(expect.stringMatching(/wal_checkpoint/i));
    } finally {
      store.disconnect();
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("HardkasStore.connect sets HardkasError code to PROJECTION_BUSY (args in right order)", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hk-qs-err-"));
    try {
      // Passing a directory path causes DatabaseSync to fail opening as a SQLite file
      const store = new HardkasStore({ dbPath: tmp });
      let caught: any;
      try {
        store.connect();
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeDefined();
      expect(caught.code).toBe("PROJECTION_BUSY");
      expect(caught.message).toMatch(/Failed to open query projection/);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("HardkasStore.connect({ readOnly: true }) opens existing non-WAL database without switching journal_mode", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hk-qs-ro-"));
    const dbPath = path.join(tmp, "ro.db");
    const setup = new DatabaseSync(dbPath);
    setup.exec("PRAGMA journal_mode = DELETE; CREATE TABLE artifacts (id TEXT PRIMARY KEY);");
    setup.close();

    const roStore = new HardkasStore({ dbPath });
    try {
      roStore.connect({ readOnly: true });
      const mode = (roStore.getDatabase().prepare("PRAGMA journal_mode").get() as any)?.journal_mode;
      expect(String(mode).toLowerCase()).toBe("delete");
    } finally {
      roStore.disconnect();
      try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
    }
  });
});
