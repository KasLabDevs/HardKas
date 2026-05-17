import { describe, it, expect, vi } from "vitest";
import { connectKaspaWallet, detectKaspaWallets } from "../src/index.js";
import type { KaspaWalletAdapter, KaspaWalletAccount } from "../src/index.js";
import type { NetworkId } from "@hardkas/core";

describe("Wallet Adapter", () => {
  const mockAccount: KaspaWalletAccount = {
    address: "kaspatest:qzzmockaddress",
    networkId: "simnet"
  };

  const createMockAdapter = (id: string, installed: boolean, networkId: NetworkId = "simnet"): KaspaWalletAdapter => ({
    id,
    name: `${id} Wallet`,
    installed,
    features: ["address:read", "transaction:sign"],
    connect: vi.fn().mockResolvedValue({
      address: "kaspatest:qzzmockaddress",
      networkId
    }),
    disconnect: vi.fn().mockResolvedValue(undefined),
    getAccount: vi.fn().mockResolvedValue({
      address: "kaspatest:qzzmockaddress",
      networkId
    }),
    getNetwork: vi.fn().mockResolvedValue(networkId),
    signTransaction: vi.fn().mockResolvedValue({ transaction: {} }),
    on: vi.fn().mockReturnValue(() => {})
  });

  describe("detectKaspaWallets", () => {
    it("filters only installed adapters", async () => {
      const a1 = createMockAdapter("w1", true);
      const a2 = createMockAdapter("w2", false);
      const result = await detectKaspaWallets([a1, a2]);
      expect(result.adapters).toHaveLength(1);
      expect(result.adapters[0].id).toBe("w1");
    });
  });

  describe("connectKaspaWallet", () => {
    it("throws if no adapters are installed", async () => {
      await expect(
        connectKaspaWallet({ adapters: [] })
      ).rejects.toThrow("No compatible Kaspa wallet provider was detected.");
    });

    it("connects to preferred wallet if found", async () => {
      const a1 = createMockAdapter("w1", true);
      const a2 = createMockAdapter("w2", true);
      const connected = await connectKaspaWallet({
        adapters: [a1, a2],
        preferredWalletId: "w2"
      });
      expect(connected.id).toBe("w2");
      expect(a2.connect).toHaveBeenCalled();
    });

    it("throws if preferred wallet is specified but not found", async () => {
      const a1 = createMockAdapter("w1", true);
      await expect(
        connectKaspaWallet({
          adapters: [a1],
          preferredWalletId: "w2"
        })
      ).rejects.toThrow("Wallet provider not found: w2");
    });

    it("succeeds when requested network matches connected network", async () => {
      const a1 = createMockAdapter("w1", true, "simnet");
      const connected = await connectKaspaWallet({
        adapters: [a1],
        networkId: "simnet"
      });
      expect(connected.id).toBe("w1");
    });

    it("throws error when requested network mismatches connected network", async () => {
      const a1 = createMockAdapter("w1", true, "mainnet");
      await expect(
        connectKaspaWallet({
          adapters: [a1],
          networkId: "simnet"
        })
      ).rejects.toThrow("Wallet connected to mainnet, expected simnet");
    });

    it("does not assert network if no networkId is requested", async () => {
      const a1 = createMockAdapter("w1", true, "mainnet");
      const connected = await connectKaspaWallet({
        adapters: [a1]
      });
      expect(connected.id).toBe("w1");
    });
  });
});
