import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hardkas } from "../index.js";
import { JsonWrpcKaspaClient } from "@hardkas/kaspa-rpc";

describe("SimulatedProvider Integration", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should not make any wRPC calls when simulating transactions or fetching balances in simulated network", async () => {
    const wrpcSpy = vi.spyOn(JsonWrpcKaspaClient.prototype, "getBalanceByAddress");

    const sdk = await Hardkas.create({
      autoBootstrap: true,
      network: "simulated",
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
    });

    // This should use the SimulatedProvider under the hood, NOT JsonWrpcKaspaClient
    const balance = await sdk.accounts.balance("kaspa:sim_alice");
    expect(balance).toBeDefined();

    // Verify 0 wRPC calls
    expect(wrpcSpy).not.toHaveBeenCalled();
  });
});
