import { describe, it, expect, vi, beforeEach } from "vitest";
import { runL2ContractDeployPlan } from "../src/runners/l2-contract-runners.js";
import * as l2 from "@hardkas/l2";
import * as artifacts from "@hardkas/artifacts";

// Mock @hardkas/l2
vi.mock("@hardkas/l2", async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    EvmJsonRpcClient: vi.fn().mockImplementation(() => ({
      getChainId: vi.fn().mockResolvedValue(12345),
      getTransactionCount: vi.fn().mockResolvedValue(7n),
      getGasPriceWei: vi.fn().mockResolvedValue(1000000000n),
      estimateGas: vi.fn().mockResolvedValue(100000n)
    })),
    encodeConstructorArgs: vi.fn().mockImplementation((bytecode, sig, args) => {
        // console.log("MOCK: encodeConstructorArgs called with sig:", sig);
        return bytecode + "beef"; // Mock appending encoded args
    })
  };
});

// Mock @hardkas/artifacts
vi.mock("@hardkas/artifacts", async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    writeArtifact: vi.fn().mockResolvedValue(undefined),
    createIgraDeployPlanId: vi.fn().mockReturnValue("igradeploy_mock_123"),
    assertValidIgraTxPlanArtifact: vi.fn(),
    ARTIFACT_SCHEMAS: {
      IGRA_TX_PLAN: "hardkas.igraTxPlan.v1"
    }
  };
});

describe("runL2ContractDeployPlan", () => {
  let consoleSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("builds a simple deployment plan with bytecode only", async () => {
    const options = {
      network: "igra",
      from: "0x1234567890123456789012345678901234567890",
      bytecode: "0x60006000",
      url: "http://localhost:8545"
    };

    // console.log("DEBUG: options =", options);
    await runL2ContractDeployPlan(options as any);

    expect(artifacts.writeArtifact).toHaveBeenCalled();
    const artifact = (artifacts.writeArtifact as any).mock.calls[0][1];
    
    expect(artifact.txType).toBe("contract-deploy");
    expect(artifact.request.to).toBeUndefined();
    expect(artifact.request.data).toBe("0x60006000");
    expect(artifact.chainId).toBe(12345);
    expect(artifact.request.nonce).toBe("7");
    
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("contract deploy plan built"));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("igradeploy_mock_123"));
  });

  it("builds a deployment plan with constructor args", async () => {
    const options = {
      network: "igra",
      from: "0x1234567890123456789012345678901234567890",
      bytecode: "0x60006000",
      constructor: "constructor(uint256)",
      args: "100",
      url: "http://localhost:8545"
    };

    await runL2ContractDeployPlan(options);

    expect(l2.encodeConstructorArgs).toHaveBeenCalledWith("0x60006000", "constructor(uint256)", ["100"]);
    const artifact = (artifacts.writeArtifact as any).mock.calls[0][1];
    expect(artifact.request.data).toBe("0x60006000beef");
  });

  it("rejects invalid bytecode", async () => {
    const options = {
      network: "igra",
      from: "0x1234567890123456789012345678901234567890",
      bytecode: "invalid",
      url: "http://localhost:8545"
    };

    await expect(runL2ContractDeployPlan(options)).rejects.toThrow("Invalid hex bytecode");
  });

  it("rejects empty bytecode", async () => {
    const options = {
      network: "igra",
      from: "0x1234567890123456789012345678901234567890",
      bytecode: "0x",
      url: "http://localhost:8545"
    };

    await expect(runL2ContractDeployPlan(options)).rejects.toThrow("Missing or empty bytecode");
  });

  it("outputs JSON when requested", async () => {
    const options = {
      network: "igra",
      from: "0x1234567890123456789012345678901234567890",
      bytecode: "0x60006000",
      url: "http://localhost:8545",
      json: true
    };

    await runL2ContractDeployPlan(options);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringMatching(/\{[\s\S]*artifact[\s\S]*\}/));
  });
});
