import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { saveSimulatedTrace, loadSimulatedTrace } from "../src/traces.js";

// DEF-1a Wave 1: `StoredSimulatedTxTrace` schema now optionally carries
// `lineage`, `workflowId`, and `assumptionLevel`. Historical traces WITHOUT
// these fields must still round-trip (backward compatibility), while new
// traces WITH the fields must persist them faithfully.

function mkTmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "hk-wave1-trace-"));
}

describe("DEF-1a · StoredSimulatedTxTrace schema optionally carries lineage/workflow/assumption", () => {
  it("legacy trace WITHOUT the new fields still round-trips (rc.22-era artifacts stay readable)", async () => {
    const dir = mkTmp();
    const legacy: any = {
      schema: "hardkas.txTrace",
      hardkasVersion: "0.0.0",
      version: "1.0.0-alpha",
      hashVersion: 4,
      createdAt: "2026-01-01T00:00:00.000Z",
      txId: "simulated-legacy-abc123-tx",
      mode: "simulator",
      networkId: "simnet",
      events: [
        { type: "phase.started", phase: "send", timestamp: 1_700_000_000_000 },
        { type: "phase.completed", phase: "send", timestamp: 1_700_000_000_100 }
      ]
      // NO lineage, NO workflowId, NO assumptionLevel — legacy shape
    };
    const filePath = await saveSimulatedTrace(legacy, { cwd: dir });
    expect(fs.existsSync(filePath)).toBe(true);
    const back = await loadSimulatedTrace(legacy.txId, { cwd: dir });
    expect(back.txId).toBe(legacy.txId);
    expect(back.mode).toBe("simulator");
    expect((back as any).lineage).toBeUndefined();
    expect((back as any).workflowId).toBeUndefined();
    expect((back as any).assumptionLevel).toBeUndefined();
  });

  it("Wave-1 trace WITH the new fields persists them faithfully", async () => {
    const dir = mkTmp();
    const modern: any = {
      schema: "hardkas.txTrace",
      hardkasVersion: "0.12.0-rc.23",
      version: "1.0.0-alpha",
      hashVersion: 4,
      createdAt: "2026-09-18T00:00:00.000Z",
      txId: "simulated-modern-def456-tx",
      mode: "simulator",
      networkId: "simnet",
      workflowId: "wf_wave1_sentinel",
      assumptionLevel: "local-simulated",
      lineage: {
        artifactId: "a".repeat(64),
        lineageId: "b".repeat(64),
        parentArtifactId: "c".repeat(64),
        rootArtifactId: "b".repeat(64),
        sequence: 4
      },
      events: []
    };
    const filePath = await saveSimulatedTrace(modern, { cwd: dir });
    const back = await loadSimulatedTrace(modern.txId, { cwd: dir });
    expect(back.workflowId).toBe("wf_wave1_sentinel");
    expect(back.assumptionLevel).toBe("local-simulated");
    expect(back.lineage?.parentArtifactId).toBe("c".repeat(64));
    expect(back.lineage?.sequence).toBe(4);
  });
});
