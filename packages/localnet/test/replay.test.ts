import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { saveSimulatedReceipt } from "../src/receipts";
import { saveSimulatedTrace } from "../src/traces";
import { getSimulatedReplaySummary } from "../src/replay";
import { ARTIFACT_SCHEMAS } from "@hardkas/artifacts";

describe("replay summary", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hardkas-replay-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("should construct a replay summary from receipt and trace", async () => {
    const txId = "simtx_replay_123";
    const receipt: any = {
      schema: ARTIFACT_SCHEMAS.TX_RECEIPT,
      hardkasVersion: "0.3.0-alpha",
      version: "1.0.0-alpha",
      hashVersion: 1,
      txId,
      mode: "simulated" as const,
      networkId: "simnet" as const,
      fromAddress: "alice",
      toAddress: "bob",
      amountSompi: "100000000",
      feeSompi: "350",
      changeSompi: "99899999650",
      spentUtxoIds: ["u1"],
      createdUtxoIds: ["u2", "u3"],
      daaScore: "5",
      createdAt: new Date().toISOString()
    };

    const trace: any = {
      schema: ARTIFACT_SCHEMAS.TX_TRACE,
      hardkasVersion: "0.3.0-alpha",
      version: "1.0.0-alpha",
      txId,
      mode: "simulated" as const,
      networkId: "simnet" as const,
      createdAt: receipt.createdAt,
      events: [
        { type: "phase.completed" as const, phase: "send", timestamp: Date.now() }
      ]
    };

    await saveSimulatedReceipt(receipt, { cwd: tempDir });
    await saveSimulatedTrace(trace, { cwd: tempDir });

    const summary = await getSimulatedReplaySummary(txId, { cwd: tempDir });

    expect(summary.receipt).toEqual(receipt);
    expect(summary.trace).toEqual(trace);
    expect(summary.summary.spentCount).toBe(1);
    expect(summary.summary.createdCount).toBe(2);
    expect(summary.summary.transferredSompi).toBe(100000000n);
    expect(summary.summary.feeSompi).toBe(350n);
    expect(summary.summary.changeSompi).toBe(99899999650n);
    expect(summary.summary.finalDaaScore).toBe("5");
  });
});
