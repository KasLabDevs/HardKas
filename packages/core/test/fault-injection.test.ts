import { test, expect, describe, beforeAll, afterAll } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import { AppendCoordinator } from "../src/append-coordinator.js";

describe("Fault Injection Testing", () => {
  let workspaceDir: string;

  beforeAll(async () => {
    workspaceDir = path.join(process.cwd(), ".fault-workspace-" + Date.now());
    await fs.mkdir(workspaceDir, { recursive: true });
    await fs.mkdir(path.join(workspaceDir, ".hardkas", "telemetry"), { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(workspaceDir, { recursive: true, force: true }).catch(() => {});
  });

  // AUDIT 2026-11-21 (M5): two placeholders that asserted `expect(true).toBe(true)` under the titles "Missing canonical
  // artifact raises error during projection" and "Permission denied (EACCES) is fatal and fails fast" were removed: they
  // tested nothing and ran in CI as a fault-injection gate. Neither behavior is covered by this file.

  test("Corrupt lock file (stale lock) is automatically recovered", async () => {
    const lockPath = path.join(workspaceDir, ".hardkas", "append.lock");

    // Inject stale lock (e.g. pid 999999 which doesn't exist)
    await fs.writeFile(lockPath, "99999999");

    const target = path.join(workspaceDir, "events.jsonl");

    // Attempt append
    expect(() => {
      AppendCoordinator.appendAtomic(target, '{"event":"recover"}\\n', workspaceDir);
    }).not.toThrow();

    // The lock should be cleared and events.jsonl created
    const exists = await fs.readFile(target, "utf-8");
    expect(exists).toContain("recover");
  });

});
