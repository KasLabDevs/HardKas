import { describe, it, expect } from "vitest";
import { getNetworkFromAddress } from "../src/runners/tx-sign-runner.js";

describe("Semantic Validation - Network Contamination Protection", () => {
  it("strictly prevents simnet addresses from being treated as mainnet", () => {
    const simAddress = "kaspa:sim_qre9nx7u4j026cff64k73z9yhxzznsn6h0u5m002v32v46p69f7cxqw2mjs32";
    const net = getNetworkFromAddress(simAddress);
    expect(net).toBe("simnet");
    expect(net).not.toBe("mainnet");
  });

  it("strictly prevents simnet addresses from being treated as testnet", () => {
    const simAddress = "kaspa:sim_qre9nx7u4j026cff64k73z9yhxzznsn6h0u5m002v32v46p69f7cxqw2mjs32";
    const net = getNetworkFromAddress(simAddress);
    expect(net).toBe("simnet");
    expect(net).not.toContain("testnet");
  });

  it("correctly identifies real mainnet addresses", () => {
    const mainnetAddress = "kaspa:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkx9awp4e";
    const net = getNetworkFromAddress(mainnetAddress);
    expect(net).toBe("mainnet");
  });

  it("correctly identifies real testnet addresses", () => {
    const testnetAddress = "kaspatest:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkx9awp4e";
    const net = getNetworkFromAddress(testnetAddress);
    expect(net).toBe("testnet-10"); // Note: getNetworkFromAddress currently returns testnet-10 for Kaspatest
  });
});
