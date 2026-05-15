// SAFETY_LEVEL: SIMULATION_ONLY
//
// Reproducibility Proof v0 for canonical local artifact workflows.
// Generates deterministic artifacts from fixed inputs.
// ZERO non-deterministic operations allowed in this file.
//
// This does NOT prove: RPC reproducibility, Docker reproducibility,
// SQLite WAL durability, or consensus replay validity.
// It proves ONLY: same code + same inputs = same contentHash everywhere.

import { calculateContentHash } from "@hardkas/artifacts";
import { createTestHarness } from "./harness.js";
import { runLinearChain, runWideDag, profileMass } from "@hardkas/simulator";

export interface ReproducibilityReport {
  /** Fixed proof version — does NOT change between releases. */
  proofVersion: "repro-v0";
  /** Informational only — NOT part of hash comparison. */
  hardkasVersion: string;
  artifacts: {
    l1Plan: string;
    l1Signed: string;
    igraPlan: string;
    dagLinearScenario: string;
    dagWideScenario: string;
    massProfile: string;
    canonicalNested: string;
    simulatedTxReceipt: string;
  };
}

/**
 * Generate the reproducibility report.
 * This function MUST be fully deterministic.
 * Same code version → same output → always → everywhere.
 */
export function generateReproducibilityReport(): ReproducibilityReport {
  // 1. L1 Plan artifact
  const l1Plan = {
    schema: "hardkas.txPlan",
    networkId: "simnet",
    mode: "simulated",
    from: { address: "kaspatest:qz0s9xrz5y5e8dq5azmpg756aeepm6fesq82ye7wv" },
    to: { address: "kaspatest:qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg" },
    amountSompi: "100000000",
    inputs: [
      { outpoint: { transactionId: "a".repeat(64), index: 0 }, amountSompi: "200000000" }
    ],
    outputs: [
      { address: "kaspatest:qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg", amountSompi: "100000000" },
      { address: "kaspatest:qz0s9xrz5y5e8dq5azmpg756aeepm6fesq82ye7wv", amountSompi: "99998000" }
    ],
    estimatedMass: "2000",
    estimatedFeeSompi: "2000"
  };

  // 2. L1 Signed artifact
  const l1Signed = {
    schema: "hardkas.signedTx",
    networkId: "simnet",
    mode: "simulated",
    rawTransaction: "0".repeat(128),
    inputs: l1Plan.inputs,
    outputs: l1Plan.outputs,
    mass: "2000",
    feeSompi: "2000"
  };

  // 3. L2 Igra Plan artifact
  const igraPlan = {
    schema: "hardkas.igraTxPlan.v1",
    networkId: "simnet",
    mode: "l2-rpc",
    l2Network: "igra-devnet",
    chainId: 42069,
    request: {
      from: "0x1234567890123456789012345678901234567890",
      to: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      data: "0x",
      valueWei: "1000000000000000000"
    },
    status: "built"
  };

  // 4. DAG scenarios — use integer PPM for ratios, NO floats
  const linearResult = runLinearChain({ name: "repro-linear", blockCount: 10 });
  const wideResult = runWideDag({ name: "repro-wide", blockCount: 10, k: 18 });

  // Integer-only ratio computation (no float dependency)
  const linearTotal = linearResult.metrics.blueBlocks + linearResult.metrics.redBlocks;
  const linearRedPpm = linearTotal > 0
    ? Math.trunc((linearResult.metrics.redBlocks * 1_000_000) / linearTotal)
    : 0;
  const wideTotal = wideResult.metrics.blueBlocks + wideResult.metrics.redBlocks;
  const wideRedPpm = wideTotal > 0
    ? Math.trunc((wideResult.metrics.redBlocks * 1_000_000) / wideTotal)
    : 0;

  // 5. Mass profile
  const massResult = profileMass({ inputCount: 3, outputCount: 2, payloadBytes: 0, feeRate: 1n });

  // 6. Canonical nesting test (key order, null, BigInt, array order)
  const nestedObj = {
    z: { b: 2, a: 1 },
    y: [3, 1, 2],
    x: null,
    w: "test",
    v: 123456789012345678901234567890n
  };

  // 7. Simulated transaction via harness
  const harness = createTestHarness({ accounts: 3, initialBalance: 100_000_000_000n });
  const names = harness.accountNames();
  const txResult = harness.send({
    from: names[0]!,
    to: names[1]!,
    amountSompi: 10_000_000_000n
  });

  return {
    proofVersion: "repro-v0",
    hardkasVersion: "0.2.2-alpha.1",
    artifacts: {
      l1Plan: calculateContentHash(l1Plan),
      l1Signed: calculateContentHash(l1Signed),
      igraPlan: calculateContentHash(igraPlan),
      dagLinearScenario: calculateContentHash({
        totalBlocks: linearResult.metrics.totalBlocks,
        blueBlocks: linearResult.metrics.blueBlocks,
        redBlocks: linearResult.metrics.redBlocks,
        redRatioPpm: linearRedPpm,
        selectedChainLength: linearResult.metrics.selectedChainLength,
      }),
      dagWideScenario: calculateContentHash({
        totalBlocks: wideResult.metrics.totalBlocks,
        blueBlocks: wideResult.metrics.blueBlocks,
        redBlocks: wideResult.metrics.redBlocks,
        redRatioPpm: wideRedPpm,
      }),
      massProfile: calculateContentHash({
        totalMass: massResult.totalMass.toString(),
        inputMass: massResult.inputMass.toString(),
        outputMass: massResult.outputMass.toString(),
        estimatedFeeSompi: massResult.estimatedFeeSompi.toString(),
      }),
      canonicalNested: calculateContentHash(nestedObj),
      simulatedTxReceipt: txResult.ok ? calculateContentHash({
        status: txResult.receipt.status,
        txId: txResult.receipt.txId,
      }) : "TX_FAILED",
    }
  };
}
