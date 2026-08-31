import { describe, it, expect } from "vitest";
import { classifyExecutionCompatibility } from "../src/semantics/compatibility.js";
import type { HardkasExecutionTarget } from "../src/index.js";

describe("Execution Compatibility Classification", () => {
  const l1_mainnet_rpc: HardkasExecutionTarget = { domain: "kaspa-l1", network: "mainnet", mode: "rpc" };
  const l1_mainnet_localnet: HardkasExecutionTarget = { domain: "kaspa-l1", network: "mainnet", mode: "localnet" };
  const l1_testnet_rpc: HardkasExecutionTarget = { domain: "kaspa-l1", network: "testnet-10", mode: "rpc" };
  const l2_evm_rpc: HardkasExecutionTarget = { domain: "evm-l2", network: "mainnet", mode: "rpc" };
  const l1_mainnet_sim: HardkasExecutionTarget = { domain: "kaspa-l1", network: "mainnet", mode: "simulator" };

  it("should be identical for matching mode, domain, and network", () => {
    expect(classifyExecutionCompatibility(l1_mainnet_rpc, l1_mainnet_rpc)).toBe("identical");
    expect(classifyExecutionCompatibility(l1_mainnet_localnet, l1_mainnet_localnet)).toBe("identical");
  });

  it("should be incompatible for different domains", () => {
    expect(classifyExecutionCompatibility(l1_mainnet_rpc, l2_evm_rpc)).toBe("incompatible");
  });

  it("should be incompatible for different networks", () => {
    expect(classifyExecutionCompatibility(l1_mainnet_rpc, l1_testnet_rpc)).toBe("incompatible");
  });

  it("should be incompatible if either is a simulator", () => {
    expect(classifyExecutionCompatibility(l1_mainnet_sim, l1_mainnet_rpc)).toBe("incompatible");
    expect(classifyExecutionCompatibility(l1_mainnet_rpc, l1_mainnet_sim)).toBe("incompatible");
  });

  it("should be undefined for localnet <-> rpc without capability", () => {
    expect(classifyExecutionCompatibility(l1_mainnet_localnet, l1_mainnet_rpc)).toBe("undefined");
  });

  it("should be compatible for localnet <-> rpc with explicit proven capability", () => {
    expect(classifyExecutionCompatibility(l1_mainnet_localnet, l1_mainnet_rpc, "send")).toBe("compatible");
    expect(classifyExecutionCompatibility(l1_mainnet_localnet, l1_mainnet_rpc, "account.resolve")).toBe("compatible");
  });

  it("should be undefined for localnet <-> rpc with unproven capabilities", () => {
    expect(classifyExecutionCompatibility(l1_mainnet_localnet, l1_mainnet_rpc, "workflow")).toBe("undefined");
    expect(classifyExecutionCompatibility(l1_mainnet_localnet, l1_mainnet_rpc, "plan")).toBe("undefined");
    expect(classifyExecutionCompatibility(l1_mainnet_localnet, l1_mainnet_rpc, "sign")).toBe("undefined");
    expect(classifyExecutionCompatibility(l1_mainnet_localnet, l1_mainnet_rpc, "replay")).toBe("undefined");
  });
});
