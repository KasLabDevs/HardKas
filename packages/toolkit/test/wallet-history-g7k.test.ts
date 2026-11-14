import { describe, it, expect, vi } from "vitest";
import { WalletToolkit } from "../src/wallet.js";

// G7 k (notes cross-check, 09 §5) · `history()` of a wallet that reads through a node (`options.rpc`) answered an empty
// history (in fact WalletQuery's whole result object, typed as an array) instead of saying there is none: a Kaspa node
// keeps no address history. It now refuses with WALLET_HISTORY_UNSUPPORTED; a provider's history comes back as its
// array of items, and a provider that fails is a typed error, never an empty list.

const ADDRESS = "kaspasim:qhistory";

function open(name: string, options: Record<string, unknown>) {
  const wallet = WalletToolkit.open(name, { storePath: `mem://${name}`, ...options });
  vi.spyOn(wallet, "receive").mockResolvedValue(ADDRESS);
  return wallet;
}

describe("G7 k · WalletToolkit.history()", () => {
  it("a node-backed wallet (options.rpc only) refuses: WALLET_HISTORY_UNSUPPORTED, never an empty list", async () => {
    const rpc = { getUtxosByAddress: vi.fn(async () => []), getBalanceByAddress: vi.fn(async () => ({ balanceSompi: 0n })) };
    const wallet = open("g7k-rpc", { rpc });
    await expect(wallet.history()).rejects.toMatchObject({ code: "WALLET_HISTORY_UNSUPPORTED", metadata: { source: "rpc", supported: false } });
    expect(rpc.getUtxosByAddress).not.toHaveBeenCalled();
  });

  it("a provider that keeps history: its items, as an array", async () => {
    const items = [{ txId: "t1", timestamp: 1, amountSompi: 5n, isSend: false }];
    const provider = {
      source: "indexer",
      getBalances: async () => ({}),
      getUtxos: async () => ({}),
      getHistory: vi.fn(async () => ({ items }))
    };
    const wallet = open("g7k-provider", { provider, rpc: {} });
    const history = await wallet.history();
    expect(Array.isArray(history)).toBe(true);
    expect(history).toEqual(items);
    expect(provider.getHistory).toHaveBeenCalledWith({ addresses: [ADDRESS] });
  });

  it("a provider that fails: WALLET_QUERY_PROVIDER_UNAVAILABLE, not an empty list", async () => {
    const provider = {
      source: "indexer",
      getBalances: async () => ({}),
      getUtxos: async () => ({}),
      getHistory: async () => {
        throw new Error("indexer down");
      }
    };
    const wallet = open("g7k-failing", { provider });
    await expect(wallet.history()).rejects.toMatchObject({ code: "WALLET_QUERY_PROVIDER_UNAVAILABLE" });
  });

  it("no node and no provider: the empty history of a wallet with nothing behind it, as an array", async () => {
    const wallet = open("g7k-none", {});
    expect(await wallet.history()).toEqual([]);
  });
});
