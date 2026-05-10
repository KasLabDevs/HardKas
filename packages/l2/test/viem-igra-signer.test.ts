import { describe, it, expect, vi } from "vitest";
import { ViemIgraTxSigner } from "../src/viem-igra-signer.js";
import { IgraTxPlanArtifact } from "@hardkas/artifacts";

describe("ViemIgraTxSigner", () => {
  const mockPlan: IgraTxPlanArtifact = {
    schema: "hardkas.igraTxPlan.v1",
    hardkasVersion: "0.2.2-alpha",
    networkId: "igra",
    mode: "l2-rpc",
    createdAt: new Date().toISOString(),
    planId: "plan-123",
    l2Network: "igra",
    chainId: 1,
    request: {
      from: "0x1234567890123456789012345678901234567890",
      to: "0x0987654321098765432109876543210987654321",
      data: "0x",
      valueWei: "1000",
      gasLimit: "21000",
      gasPriceWei: "1000000000",
      nonce: "0"
    },
    estimatedGas: "21000",
    estimatedFeeWei: "21000000000000",
    status: "built"
  };

  const mockAccount = {
    name: "test-acc",
    address: "0x1234567890123456789012345678901234567890",
    privateKey: "a".repeat(64) // 64 chars hex
  };

  const setupMockViem = () => {
    const signTransaction = vi.fn().mockResolvedValue("0xsignedtx");
    const privateKeyToAccount = vi.fn().mockReturnValue({ signTransaction });
    const keccak256 = vi.fn().mockReturnValue("0xtxhash");

    const viemLoader = async () => ({ keccak256 });
    const accountsLoader = async () => ({ privateKeyToAccount });

    return { viemLoader, accountsLoader, signTransaction, privateKeyToAccount, keccak256 };
  };

  it("signs correctly with valid input and 0x prefix private key", async () => {
    const mocks = setupMockViem();
    const signer = new ViemIgraTxSigner({
      viemLoader: mocks.viemLoader,
      accountsLoader: mocks.accountsLoader
    });

    const result = await signer.sign({
      plan: mockPlan,
      account: { ...mockAccount, privateKey: "0x" + "a".repeat(64) }
    });

    expect(result.rawTransaction).toBe("0xsignedtx");
    expect(result.txHash).toBe("0xtxhash");
    expect(mocks.privateKeyToAccount).toHaveBeenCalledWith("0x" + "a".repeat(64));
  });

  it("signs correctly with non-0x prefix private key", async () => {
    const mocks = setupMockViem();
    const signer = new ViemIgraTxSigner({
      viemLoader: mocks.viemLoader,
      accountsLoader: mocks.accountsLoader
    });

    const result = await signer.sign({
      plan: mockPlan,
      account: mockAccount
    });

    expect(result.rawTransaction).toBe("0xsignedtx");
    expect(mocks.privateKeyToAccount).toHaveBeenCalledWith("0x" + "a".repeat(64));
  });

  it("rejects Kaspa L1 address", async () => {
    const mocks = setupMockViem();
    const signer = new ViemIgraTxSigner({
      viemLoader: mocks.viemLoader,
      accountsLoader: mocks.accountsLoader
    });

    await expect(signer.sign({
      plan: mockPlan,
      account: { ...mockAccount, address: "kaspa:qpau7..." }
    })).rejects.toThrow("Igra L2 signing requires an EVM 0x account address.");
  });

  it("rejects invalid hex private key format", async () => {
    const mocks = setupMockViem();
    const signer = new ViemIgraTxSigner({
      viemLoader: mocks.viemLoader,
      accountsLoader: mocks.accountsLoader
    });

    await expect(signer.sign({
      plan: mockPlan,
      account: { ...mockAccount, privateKey: "short" }
    })).rejects.toThrow("Invalid EVM private key format for account 'test-acc'.");
  });

  it("does not leak private key in error messages", async () => {
    const mocks = setupMockViem();
    const signer = new ViemIgraTxSigner({
      viemLoader: mocks.viemLoader,
      accountsLoader: mocks.accountsLoader
    });

    const pk = "b".repeat(64);
    try {
      await signer.sign({
        plan: mockPlan,
        account: { ...mockAccount, privateKey: "invalid hex!" }
      });
    } catch (e: any) {
      expect(e.message).not.toContain(pk);
      expect(e.message).toContain("Invalid EVM private key format");
    }
  });

  it("rejects incomplete plan missing gasLimit", async () => {
    const mocks = setupMockViem();
    const signer = new ViemIgraTxSigner({
      viemLoader: mocks.viemLoader,
      accountsLoader: mocks.accountsLoader
    });

    const incompletePlan = { ...mockPlan, request: { ...mockPlan.request, gasLimit: undefined } };
    await expect(signer.sign({
      plan: incompletePlan as any,
      account: mockAccount
    })).rejects.toThrow("Igra transaction plan is incomplete. Rebuild the plan with gas limit.");
  });

  it("handles txHash as optional (viem without keccak256)", async () => {
    const viemLoader = async () => ({}); // no keccak256
    const signTransaction = vi.fn().mockResolvedValue("0xsignedtx");
    const accountsLoader = async () => ({ privateKeyToAccount: () => ({ signTransaction }) });

    const signer = new ViemIgraTxSigner({ viemLoader, accountsLoader });
    const result = await signer.sign({ plan: mockPlan, account: mockAccount });

    expect(result.rawTransaction).toBe("0xsignedtx");
    expect(result.txHash).toBeUndefined();
  });
});
