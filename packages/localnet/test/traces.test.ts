import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { 
  saveSimulatedTrace, 
  loadSimulatedTrace, 
  listSimulatedTraces,
  StoredSimulatedTxTrace
} from "../src/traces";
import { ARTIFACT_SCHEMAS } from "@hardkas/artifacts";

describe("traces store", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hardkas-traces-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const mockTrace = {
    schema: ARTIFACT_SCHEMAS.TX_TRACE,
    hardkasVersion: "0.2.2-alpha",
    version: "1.0.0-alpha",
    txId: "simtx_trace_123",
    mode: "simulated",
    networkId: "simnet",
    createdAt: new Date().toISOString(),
    events: [
      { type: "phase.started", phase: "test", timestamp: Date.now() },
      { type: "phase.completed", phase: "test", timestamp: Date.now() }
    ]
  } as any;

  it("should save and load a trace", async () => {
    const path = await saveSimulatedTrace(mockTrace, { cwd: tempDir });
    expect(path).toContain("simtx_trace_123.trace.json");

    const loaded = await loadSimulatedTrace(mockTrace.txId, { cwd: tempDir });
    expect(loaded).toEqual(mockTrace);
  });

  it("should list traces sorted by date", async () => {
    const t1: any = {
      schema: ARTIFACT_SCHEMAS.TX_TRACE,
      hardkasVersion: "0.2.2-alpha",
      version: "1.0.0-alpha",
      txId: "t1",
      mode: "simulated",
      networkId: "simnet",
      createdAt: "2026-01-01T10:00:00Z",
      events: []
    };
    const t2: any = {
      schema: ARTIFACT_SCHEMAS.TX_TRACE,
      hardkasVersion: "0.2.2-alpha",
      version: "1.0.0-alpha",
      txId: "t2",
      mode: "simulated",
      networkId: "simnet",
      createdAt: "2026-01-01T11:00:00Z",
      events: []
    };
    
    await saveSimulatedTrace(t1, { cwd: tempDir });
    await saveSimulatedTrace(t2, { cwd: tempDir });
    
    const list = await listSimulatedTraces({ cwd: tempDir });
    expect(list.length).toBe(2);
    expect(list[0]!.txId).toBe("t2");
    expect(list[1]!.txId).toBe("t1");
  });

  it("should throw error for invalid txId (path traversal)", async () => {
    await expect(loadSimulatedTrace("..\\something", { cwd: tempDir }))
      .rejects.toThrow("Invalid txId");
  });
});
