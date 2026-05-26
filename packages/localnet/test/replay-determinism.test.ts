import { describe, it, expect, vi, beforeEach } from "vitest";
import { applySimulatedPayment } from "../src/transactions.js";
import { createInitialLocalnetState } from "../src/state.js";
import { RuntimeContext, globalTelemetry } from "@hardkas/core";

describe("Deterministic Replay Injection", () => {
  let mockClock: number;
  let mockRandom: number;
  let executionIdCount: number;
  let workflowIdCount: number;

  const mockCtx: RuntimeContext = {
    clock: {
      now: () => mockClock
    },
    random: {
      next: () => mockRandom
    },
    ids: {
      execution: () => `exec_${executionIdCount++}`,
      workflow: () => `wf_${workflowIdCount++}`
    },
    telemetry: globalTelemetry
  };

  beforeEach(() => {
    mockClock = 1000000000;
    mockRandom = 0.5;
    executionIdCount = 1;
    workflowIdCount = 1;
  });

  it("should produce the exact same receipt and trace for identical inputs across two different replays", () => {
    const initialState = createInitialLocalnetState();
    initialState.utxos = [
      { id: "tx1:0", address: "kaspa:sim_q1", amountSompi: "100000", spent: false, createdAtDaaScore: "0" }
    ];

    const input = {
      from: "kaspa:sim_q1",
      to: "kaspa:sim_q2",
      amountSompi: 50000n
    };

    // Replay 1
    const result1 = applySimulatedPayment(initialState, input, mockCtx);
    
    // Reset mock state perfectly
    mockClock = 1000000000;
    mockRandom = 0.5;
    executionIdCount = 1;
    workflowIdCount = 1;

    // Replay 2
    const result2 = applySimulatedPayment(initialState, input, mockCtx);

    expect(result1.ok).toBe(true);
    expect(result2.ok).toBe(true);
    
    // Identical receipts
    expect(result1.receipt).toEqual(result2.receipt);

    // Identical artifacts
    expect(result1.planArtifact).toEqual(result2.planArtifact);
    
    // Identical states
    expect(result1.state).toEqual(result2.state);
    
    // Changing the clock should change the artifact creation timestamp
    mockClock = 2000000000;
    const result3 = applySimulatedPayment(initialState, input, mockCtx);
    
    expect(result1.receipt!.createdAt).not.toEqual(result3.receipt!.createdAt);
    // Despite different timestamps, the semantic content hash must be perfectly identical
    expect(result1.receipt!.contentHash).toEqual(result3.receipt!.contentHash);
  });
});
