import { describe, it, expect } from "vitest";
import { getNetworkFromAddress } from "../src/runners/tx-sign-runner.js";
import { verifyArtifactSemantics } from "@hardkas/artifacts";

describe("Semantic Validation - Network Contamination Protection", () => {
  it("strictly prevents simnet addresses from being treated as mainnet", () => {
    const simAddress =
      "kaspa:sim_qre9nx7u4j026cff64k73z9yhxzznsn6h0u5m002v32v46p69f7cxqw2mjs32";
    const net = getNetworkFromAddress(simAddress);
    expect(net).toBe("simnet");
    expect(net).not.toBe("mainnet");
  });

  it("strictly prevents simnet addresses from being treated as testnet", () => {
    const simAddress =
      "kaspa:sim_qre9nx7u4j026cff64k73z9yhxzznsn6h0u5m002v32v46p69f7cxqw2mjs32";
    const net = getNetworkFromAddress(simAddress);
    expect(net).toBe("simnet");
    expect(net).not.toContain("testnet");
  });

  it("correctly identifies real mainnet addresses", () => {
    const mainnetAddress =
      "kaspa:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkx9awp4e";
    const net = getNetworkFromAddress(mainnetAddress);
    expect(net).toBe("mainnet");
  });

  it("correctly identifies real testnet addresses", () => {
    const testnetAddress =
      "kaspatest:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkx9awp4e";
    const net = getNetworkFromAddress(testnetAddress);
    expect(net).toBe("testnet-10"); // Note: getNetworkFromAddress currently returns testnet-10 for Kaspatest
  });

  it("simulated -> mainnet contamination detection (verifyArtifactSemantics fails)", () => {
    const plan = {
      schema: "hardkas.txPlan",
      hardkasVersion: "0.9.3-alpha",
      version: "1.0.0-alpha",
      networkId: "mainnet",
      mode: "real",
      createdAt: new Date().toISOString(),
      planId: "plan_123",
      from: { address: "kaspa:sim_alice" },
      to: { address: "kaspa:sim_bob" },
      amountSompi: "1000",
      estimatedFeeSompi: "10",
      estimatedMass: "100",
      inputs: [],
      outputs: []
    };

    const result = verifyArtifactSemantics(plan);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("Network/Address mismatch"))).toBe(true);
  });

  it("simulated -> testnet contamination detection (verifyArtifactSemantics fails)", () => {
    const plan = {
      schema: "hardkas.txPlan",
      hardkasVersion: "0.9.3-alpha",
      version: "1.0.0-alpha",
      networkId: "testnet-10",
      mode: "real",
      createdAt: new Date().toISOString(),
      planId: "plan_123",
      from: { address: "kaspa:sim_alice" },
      to: { address: "kaspa:sim_bob" },
      amountSompi: "1000",
      estimatedFeeSompi: "10",
      estimatedMass: "100",
      inputs: [],
      outputs: []
    };

    const result = verifyArtifactSemantics(plan);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("Network/Address mismatch"))).toBe(true);
  });

  it("mixed-network artifact lineage rejection (parent on simnet, child on testnet)", () => {
    const child = {
      schema: "hardkas.txPlan",
      hardkasVersion: "0.9.3-alpha",
      version: "1.0.0-alpha",
      networkId: "testnet-10",
      mode: "real",
      createdAt: new Date().toISOString(),
      planId: "plan_child",
      from: {
        address: "kaspatest:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkx9awp4e"
      },
      to: {
        address: "kaspatest:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkx9awp4e"
      },
      amountSompi: "1000",
      estimatedFeeSompi: "10",
      estimatedMass: "100",
      inputs: [],
      outputs: [],
      lineage: {
        artifactId: "plan_child",
        lineageId: "lineage_123",
        parentArtifactId: "plan_parent",
        rootArtifactId: "plan_parent"
      }
    };

    const parent = {
      schema: "hardkas.txPlan",
      hardkasVersion: "0.9.3-alpha",
      version: "1.0.0-alpha",
      networkId: "simnet",
      mode: "simulated",
      createdAt: new Date().toISOString(),
      planId: "plan_parent",
      from: { address: "kaspa:sim_alice" },
      to: { address: "kaspa:sim_bob" },
      amountSompi: "1000",
      estimatedFeeSompi: "10",
      estimatedMass: "100",
      inputs: [],
      outputs: []
    };

    const result = verifyArtifactSemantics(child, { parent });
    expect(result.ok).toBe(false);
    expect(
      result.errors.some(
        (e) =>
          e.includes("lineage") || e.includes("network") || e.includes("Network mismatch")
      )
    ).toBe(true);
  });
});
