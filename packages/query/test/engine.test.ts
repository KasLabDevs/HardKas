import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { QueryEngine, QueryEngineOptions, QueryBackendLoader } from "../src/engine.js";
import { FilesystemQueryBackend } from "../src/backend-fs.js";
import { QueryBackendInitializationError } from "../src/errors.js";

// Dummy sqlite backend for test
const dummySqliteBackend = {
  kind: () => "sqlite" as const,
  store: { connect: () => {} }
} as any;

const failingLoader: QueryBackendLoader = {
  async loadSqlite() {
    throw new Error("SQLITE_BUSY");
  }
};

const workingLoader: QueryBackendLoader = {
  async loadSqlite() {
    return dummySqliteBackend;
  }
};

describe("QueryEngine Backend Selection", () => {

  it("should throw QueryBackendInitializationError when sqlite fails in sqlite mode", async () => {
    await expect(
      QueryEngine.create({
        artifactDir: "test-dir",
        backendMode: "sqlite",
        databasePath: "store.db",
        loader: failingLoader
      })
    ).rejects.toThrowError(QueryBackendInitializationError);
  });

  it("should preserve cause in QueryBackendInitializationError", async () => {
    try {
      await QueryEngine.create({
        artifactDir: "test-dir",
        backendMode: "sqlite",
        databasePath: "store.db",
        loader: failingLoader
      });
      expect.fail("Should have thrown");
    } catch (e: any) {
      expect(e).toBeInstanceOf(QueryBackendInitializationError);
      expect(e.cause).toBeDefined();
      expect(e.cause.message).toBe("SQLITE_BUSY");
    }
  });

  it("should fallback to filesystem and record evidence when sqlite fails in auto mode", async () => {
    const tmpDir = "test-dir-fallback";
    fs.mkdirSync(path.join(tmpDir, ".hardkas"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, ".hardkas", "store.db"), "dummy");
    
    const engine = await QueryEngine.create({
      artifactDir: tmpDir,
      backendMode: "auto",
      loader: failingLoader
    });

    expect(engine.backend).toBeInstanceOf(FilesystemQueryBackend);
    expect(engine.backendSelection.requested).toBe("auto");
    expect(engine.backendSelection.selected).toBe("filesystem");
    expect(engine.backendSelection.fallback).toBeDefined();
    expect(engine.backendSelection.fallback?.causeName).toBe("Error");
    
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should not attempt to load sqlite in filesystem mode", async () => {
    let loaderCalled = false;
    const trackingLoader: QueryBackendLoader = {
      async loadSqlite() {
        loaderCalled = true;
        return dummySqliteBackend;
      }
    };

    const engine = await QueryEngine.create({
      artifactDir: "test-dir",
      backendMode: "filesystem",
      loader: trackingLoader
    });

    expect(loaderCalled).toBe(false);
    expect(engine.backend).toBeInstanceOf(FilesystemQueryBackend);
    expect(engine.backendSelection.requested).toBe("filesystem");
    expect(engine.backendSelection.selected).toBe("filesystem");
    expect(engine.backendSelection.fallback).toBeUndefined();
  });

  it("should isolate parallel engine creations", async () => {
    let loaderCount = 0;
    const trackingLoader: QueryBackendLoader = {
      async loadSqlite() {
        loaderCount++;
        return dummySqliteBackend;
      }
    };

    const [engine1, engine2] = await Promise.all([
      QueryEngine.create({
        artifactDir: "test-dir1",
        backendMode: "sqlite",
        loader: trackingLoader
      }),
      QueryEngine.create({
        artifactDir: "test-dir2",
        backendMode: "sqlite",
        loader: trackingLoader
      })
    ]);

    expect(loaderCount).toBe(2);
    expect(engine1.backend).toBe(dummySqliteBackend);
    expect(engine2.backend).toBe(dummySqliteBackend);
  });
});
