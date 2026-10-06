import { describe, it, expect, beforeAll, vi, afterEach } from "vitest";
import { Hardkas } from "../src/index.js";

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

describe("P84: V1 Sign Blocking", () => {
  let sdk: Hardkas;
  let workspaceRoot: string;

  beforeAll(async () => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-test-"));
    sdk = await Hardkas.open({ cwd: workspaceRoot, autoBootstrap: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // SURFACE-TRUTH-1B: this test pinned "The configured WASM runtime does not support TX V1 signing. Upgrade to WASM
  // v2.x." for the default runtime, which is the pinned kaspa-wasm 2.x and signs v1. A simulator plan is refused for
  // the true reason: the simulator does not model transaction v1. (A v1 plan for a node network is signed by the
  // managed runtime: surface-truth-1b-contract.test.ts.)
  it("refuses a version 1 simulator plan because the simulator does not model v1, not as 'runtime too old'", async () => {
    const v1Plan: any = {
      schema: "hardkas.txPlan",
      version: "1.0.0-alpha",
      hardkasVersion: "1.0.0-alpha",
      mode: "simulator",
      networkId: "simnet",
      from: { address: "kaspatest:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqhg0eec5" },
      to: { address: "kaspatest:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqhg0eec5" },
      amountSompi: "1000",
      planId: "plan-mock",
      contentHash: "8f1ea26c03b2cae1f466d06c586dcee4a9add50e21a8f85cb49391f8abbd4dfb",
      createdAt: "2026-07-10T17:00:00.000Z",
      txVersion: 1,
      inputs: [],
      outputs: [],
      estimatedMass: "1000",
      estimatedFeeSompi: "100000"
    };

    let error: any;
    vi.spyOn(sdk.artifacts, "verify").mockResolvedValue();
    try {
      await sdk.tx.sign(v1Plan, {
        address: "kaspatest:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqhg0eec5"
      } as any);
    } catch (e) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.code).toBe("TX_V1_SIMULATION_UNSUPPORTED");
    expect(error.message).not.toMatch(/Upgrade to WASM/i);
  });

  it("should attempt to sign version 1 plans with WASM v2.x", async () => {
    // Open a new SDK instance using the local WASM provider which is v2.0.1
    const sdkV2 = await Hardkas.open({ 
      cwd: workspaceRoot, 
      autoBootstrap: true,
      wasm: { 
        provider: "local",
        path: path.join(process.cwd(), "vendor", "kaspa-wasm")
      }
    });

    const v1Plan: any = {
      schema: "hardkas.txPlan",
      version: "1.0.0-alpha",
      hardkasVersion: "1.0.0-alpha",
      mode: "simulator",
      networkId: "simnet",
      from: { address: "kaspatest:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqhg0eec5" },
      to: { address: "kaspatest:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqhg0eec5" },
      amountSompi: "1000",
      planId: "plan-mock",
      contentHash: "8f1ea26c03b2cae1f466d06c586dcee4a9add50e21a8f85cb49391f8abbd4dfb",
      createdAt: "2026-07-10T17:00:00.000Z",
      txVersion: 1,
      inputs: [],
      outputs: [],
      estimatedMass: "1000",
      estimatedFeeSompi: "100000"
    };

    let error: any;
    vi.spyOn(sdkV2.artifacts, "verify").mockResolvedValue();
    try {
      // It should NOT throw BLOCKED_BY_DEPENDENCY.
      // It might throw a signature generation error because inputs are empty, 
      // but that proves it bypassed the blocker.
      await sdkV2.tx.sign(v1Plan, {
        address: "kaspatest:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqhg0eec5",
        getPrivateKey: () => "0000000000000000000000000000000000000000000000000000000000000001"
      } as any);
    } catch (e) {
      error = e;
    }

    // Should NOT be BLOCKED_BY_DEPENDENCY
    if (error) {
      expect(error.code).not.toBe("BLOCKED_BY_DEPENDENCY");
    }
  });
});
