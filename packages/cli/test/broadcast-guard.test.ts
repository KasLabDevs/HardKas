import { describe, it, expect } from "vitest";
import { assertBroadcastNetworkAllowed } from "../src/broadcast-guard.js";

describe("assertBroadcastNetworkAllowed", () => {
  it("should allow same non-mainnet network", () => {
    expect(() => assertBroadcastNetworkAllowed({
      artifactNetworkId: "simnet",
      selectedNetwork: "simnet"
    })).not.toThrow();
  });

  it("should block mainnet (always rejected in v0.2-alpha)", () => {
    expect(() => assertBroadcastNetworkAllowed({
      artifactNetworkId: "mainnet",
      selectedNetwork: "mainnet"
    })).toThrow(/Mainnet broadcast is disabled in HardKAS v0.2-alpha/);
  });

  it("should block mainnet even if only artifact is mainnet", () => {
    expect(() => assertBroadcastNetworkAllowed({
      artifactNetworkId: "kaspa",
      selectedNetwork: "devnet"
    })).toThrow(/Mainnet broadcast is disabled in HardKAS v0.2-alpha/);
  });

  it("should block mainnet-like aliases", () => {
    expect(() => assertBroadcastNetworkAllowed({
      artifactNetworkId: "kaspa-mainnet",
      selectedNetwork: "kaspa-mainnet"
    })).toThrow(/Mainnet broadcast is disabled in HardKAS v0.2-alpha/);
  });

  it("should fail on network mismatch", () => {
    expect(() => assertBroadcastNetworkAllowed({
      artifactNetworkId: "simnet",
      selectedNetwork: "testnet-10"
    })).toThrow(/Network mismatch/);
  });
});
