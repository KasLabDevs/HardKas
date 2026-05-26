import { test, expect, describe, beforeAll, afterAll } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import { AppendCoordinator } from "../src/append-coordinator.js";

describe("Benchmark Suite", () => {
  let workspaceDir: string;

  beforeAll(async () => {
    workspaceDir = path.join(process.cwd(), ".benchmark-workspace-" + Date.now());
    await fs.mkdir(workspaceDir, { recursive: true });
    await fs.mkdir(path.join(workspaceDir, ".hardkas", "telemetry"), { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(workspaceDir, { recursive: true, force: true }).catch(() => {});
  });

  test("AppendCoordinator overhead and fsync cost", async () => {
     const eventsFile = path.join(workspaceDir, "events-bench.jsonl");
     
     const start = process.hrtime.bigint();
     
     const ITERATIONS = 500;
     for (let i = 0; i < ITERATIONS; i++) {
        const payload = JSON.stringify({ benchId: i, time: Date.now() }) + "\\n";
        AppendCoordinator.appendAtomic(eventsFile, payload, workspaceDir);
     }
     
     const end = process.hrtime.bigint();
     const elapsedMs = Number(end - start) / 1_000_000;
     const avgLatency = elapsedMs / ITERATIONS;
     
     // Output benchmark metrics for CI to capture
     console.log(JSON.stringify({
         benchmark: "append_latency",
         iterations: ITERATIONS,
         totalTimeMs: elapsedMs,
         avgLatencyMs: avgLatency
     }));
     
     // Ensure append latency is reasonable (< 5ms per fsync on average on fast disk)
     // In CI it might be slower, so we assert something generous
     expect(avgLatency).toBeLessThan(50);
  });
});
