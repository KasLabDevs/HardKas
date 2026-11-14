import { describe, it, expect, vi } from "vitest";
import { ViemIgraTxSigner } from "../src/viem-igra-signer.js";
import { getL2Profile } from "../src/registry.js";
import { IgraTxPlanArtifact } from "@hardkas/artifacts";

describe("ViemIgraTxSigner", () => {
  const mockPlan: IgraTxPlanArtifact = {
    schema: "hardkas.igraTxPlan.v1",
    hardkasVersion: "0.13.0-rc.2",
    networkId: "local",
    mode: "l2-rpc",
    createdAt: new Date().toISOString(),
    planId: "plan-123",
    l2Network: "local",
    chainId: 31337,
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

  const localGuard = { expectedChainId: 31337, profile: getL2Profile("local")! };

  const mockAccount = {
    name: "test-acc",
    address: "0x1234567890123456789012345678901234567890",
    privateKey: "a".repeat(64) // 64 chars hex
  };

  const setupMockViem = (decodedChainId?: number) => {
    const signTransaction = vi.fn().mockResolvedValue("0xsignedtx");
    const privateKeyToAccount = vi.fn().mockReturnValue({ signTransaction });
    const keccak256 = vi.fn().mockReturnValue("0xtxhash");

    const viemLoader = async () => ({
      keccak256,
      ...(decodedChainId !== undefined
        ? { parseTransaction: () => ({ chainId: decodedChainId }) }
        : {})
    });
    const accountsLoader = async () => ({ privateKeyToAccount });

    return {
      viemLoader,
      accountsLoader,
      signTransaction,
      privateKeyToAccount,
      keccak256
    };
  };

  const signerWith = (mocks: ReturnType<typeof setupMockViem>) =>
    new ViemIgraTxSigner({ viemLoader: mocks.viemLoader, accountsLoader: mocks.accountsLoader });

  it("signs correctly with valid input and 0x prefix private key", async () => {
    const mocks = setupMockViem(31337);
    const result = await signerWith(mocks).sign({
      plan: mockPlan,
      account: { ...mockAccount, privateKey: "0x" + "a".repeat(64) },
      guard: localGuard
    });

    expect(result.rawTransaction).toBe("0xsignedtx");
    expect(result.txHash).toBe("0xtxhash");
    expect(mocks.privateKeyToAccount).toHaveBeenCalledWith("0x" + "a".repeat(64));
  });

  it("signs correctly with non-0x prefix private key", async () => {
    const mocks = setupMockViem();
    const result = await signerWith(mocks).sign({
      plan: mockPlan,
      account: mockAccount,
      guard: localGuard
    });

    expect(result.rawTransaction).toBe("0xsignedtx");
    expect(mocks.privateKeyToAccount).toHaveBeenCalledWith("0x" + "a".repeat(64));
  });

  it("refuses to sign without a network guard", async () => {
    await expect(
      signerWith(setupMockViem()).sign({ plan: mockPlan, account: mockAccount })
    ).rejects.toThrow(expect.objectContaining({ code: "L2_CHAIN_ID_REQUIRED" }));
  });

  it("refuses a plan built for another chain than the guard's", async () => {
    await expect(
      signerWith(setupMockViem()).sign({
        plan: { ...mockPlan, chainId: 38836 },
        account: mockAccount,
        guard: localGuard
      })
    ).rejects.toThrow(expect.objectContaining({ code: "L2_CHAIN_ID_MISMATCH" }));
  });

  // MAINNET TOTAL LOCKDOWN (owner decision 2026-11-09): this case read "... allows it with it" (allowMainnet: true signed
  // for 38833). allowMainnet no longer authorizes anything: the same call is refused, with or without it.
  it("refuses mainnet (chain 38833 and chain 1) with or without allowMainnet (MAINNET TOTAL LOCKDOWN)", async () => {
    const mainnet = getL2Profile("igra-mainnet")!;
    const feeLimits = { maxGasLimit: 100000n, maxFeePerGasWei: 10n ** 12n, maxTotalFeeWei: 10n ** 17n };
    for (const chainId of [38833, 1]) {
      for (const allowMainnet of [undefined, true]) {
        const guard = {
          expectedChainId: chainId,
          ...(chainId === 38833 ? { profile: mainnet } : {}),
          ...(allowMainnet !== undefined ? { allowMainnet } : {}),
          feeLimits
        };
        await expect(
          signerWith(setupMockViem()).sign({ plan: { ...mockPlan, chainId }, account: mockAccount, guard })
        ).rejects.toThrow(expect.objectContaining({ code: "L2_MAINNET_WRITE_BLOCKED" }));
      }
    }
  });

  it("refuses when fee ceilings are missing or exceeded", async () => {
    const galleon = getL2Profile("igra-galleon")!;
    const plan = { ...mockPlan, chainId: 38836 };
    await expect(
      signerWith(setupMockViem()).sign({
        plan,
        account: mockAccount,
        guard: { expectedChainId: 38836, profile: galleon }
      })
    ).rejects.toThrow(expect.objectContaining({ code: "L2_FEE_POLICY_REQUIRED" }));
    await expect(
      signerWith(setupMockViem()).sign({
        plan,
        account: mockAccount,
        guard: {
          expectedChainId: 38836,
          profile: galleon,
          feeLimits: { maxGasLimit: 21000n, maxFeePerGasWei: 999n, maxTotalFeeWei: 10n ** 18n }
        }
      })
    ).rejects.toThrow(expect.objectContaining({ code: "L2_FEE_LIMIT_EXCEEDED" }));
  });

  it("refuses a serialized transaction whose chain ID differs from the guard", async () => {
    await expect(
      signerWith(setupMockViem(1)).sign({ plan: mockPlan, account: mockAccount, guard: localGuard })
    ).rejects.toThrow(expect.objectContaining({ code: "L2_SIGNED_TX_MISMATCH" }));
  });

  it("rejects Kaspa L1 address", async () => {
    await expect(
      signerWith(setupMockViem()).sign({
        plan: mockPlan,
        account: { ...mockAccount, address: "kaspa:qpau7..." },
        guard: localGuard
      })
    ).rejects.toThrow("Igra L2 signing requires an EVM 0x account address.");
  });

  it("rejects invalid hex private key format", async () => {
    await expect(
      signerWith(setupMockViem()).sign({
        plan: mockPlan,
        account: { ...mockAccount, privateKey: "short" },
        guard: localGuard
      })
    ).rejects.toThrow("Invalid EVM private key format for account 'test-acc'.");
  });

  it("does not leak private key in error messages", async () => {
    const pk = "b".repeat(64);
    try {
      await signerWith(setupMockViem()).sign({
        plan: mockPlan,
        account: { ...mockAccount, privateKey: "invalid hex!" },
        guard: localGuard
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      expect(msg).not.toContain(pk);
      expect(msg).toContain("Invalid EVM private key format");
    }
  });

  it("rejects incomplete plan missing gasLimit", async () => {
    const incompletePlan = {
      ...mockPlan,
      request: { ...mockPlan.request, gasLimit: undefined }
    };
    await expect(
      signerWith(setupMockViem()).sign({
        plan: incompletePlan as any,
        account: mockAccount,
        guard: localGuard
      })
    ).rejects.toThrow(
      "Igra transaction plan is incomplete. Rebuild the plan with gas limit."
    );
  });

  it("handles txHash as optional (viem without keccak256)", async () => {
    const viemLoader = async () => ({}); // no keccak256
    const signTransaction = vi.fn().mockResolvedValue("0xsignedtx");
    const accountsLoader = async () => ({
      privateKeyToAccount: () => ({ signTransaction })
    });

    const signer = new ViemIgraTxSigner({ viemLoader, accountsLoader });
    const result = await signer.sign({ plan: mockPlan, account: mockAccount, guard: localGuard });

    expect(result.rawTransaction).toBe("0xsignedtx");
    expect(result.txHash).toBeUndefined();
  });
});
