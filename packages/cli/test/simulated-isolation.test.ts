import { describe, it, expect } from "vitest";
import { runTxPlan } from "../src/runners/tx-plan-runner.js";
import { loadHardkasConfig } from "@hardkas/config";

describe("Simulated Isolation", () => {
  it("must succeed even if an unreachable RPC URL is provided", async () => {
    const { config } = await loadHardkasConfig();
    
    // We provide a bogus URL that would normally timeout or fail.
    // However, because networkId is simnet, the simulated backend must not even attempt to connect to it.
    const artifact = await runTxPlan({
      from: "alice",
      to: "bob",
      amount: "10",
      networkId: "simnet",
      feeRate: "1",
      config,
      url: "http://127.0.0.1:1" // Unreachable port
    });

    expect(artifact).toBeDefined();
    expect(artifact.networkId).toBe("simnet");
    expect(artifact.mode).toBe("simulated");
    expect(artifact.from.address).toContain("kaspa:sim_");
    expect(artifact.rpcUrl).toBe("simulated://local"); // It ignores the provided URL
  });
});
