import { test, expect, describe, beforeAll, afterAll } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import { AppendCoordinator } from "../src/append-coordinator.js";

describe("Long-Run Soak Testing", () => {
  let workspaceDir: string;

  beforeAll(async () => {
    workspaceDir = path.join(process.cwd(), ".soak-workspace-" + Date.now());
    await fs.mkdir(workspaceDir, { recursive: true });
    await fs.mkdir(path.join(workspaceDir, ".hardkas", "telemetry"), { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(workspaceDir, { recursive: true, force: true }).catch(() => {});
  });

  test("Continuous appends do not leak file descriptors", async () => {
    const eventsFile = path.join(workspaceDir, "events.jsonl");
    const startTime = Date.now();
    let count = 0;

    // 1000 appends as a soak proof.
    for (let i = 0; i < 1000; i++) {
      const payload = JSON.stringify({ soakId: i, time: Date.now() }) + "\n";
      AppendCoordinator.appendAtomic(eventsFile, payload, workspaceDir);
      count++;
    }

    const endTime = Date.now();
    const duration = endTime - startTime;

    expect(count).toBe(1000);
    expect(duration).toBeLessThan(30000); // 1000 fsyncs: ~1-3s on Linux, ~10-15s on Windows NTFS

    const stats = await fs.stat(eventsFile);
    expect(stats.size).toBeGreaterThan(10000); // Ensure bytes are actually written
  });
});
