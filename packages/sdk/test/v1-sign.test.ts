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

  it("should block sign for version 1 plans with WASM v0.13", async () => {
    const v1Plan: any = {
      schema: "hardkas.txPlan",
      version: "1.0.0-alpha",
      hardkasVersion: "1.0.0-alpha",
      mode: "simulated",
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
    if (error.code !== "BLOCKED_BY_DEPENDENCY") {
      console.log("UNEXPECTED ERROR:", error.message, error.details);
    }
    expect(error.code).toBe("BLOCKED_BY_DEPENDENCY");
    expect(error.message).toContain("The configured WASM runtime does not support TX V1 signing.");
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
      mode: "simulated",
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
