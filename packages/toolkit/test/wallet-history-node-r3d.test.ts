import { describe, it, expect, vi } from "vitest";
import { WalletToolkit } from "../src/wallet.js";

// R3-D · WalletToolkit.history() of a wallet that reads through a node (options.rpc): a Kaspa node keeps no address
// history, so it is read from the node's selected chain over a bounded window (@hardkas/query readAddressHistory). The
// array holds the entries and carries the coverage; WALLET_HISTORY_UNSUPPORTED stays for a client that cannot read a
// chain (wallet-history-g7k.test.ts keeps that case unchanged). Scripted node; nothing is sent.

const ADDRESS = "kaspasim:qra97q5zuevchu7w45mkjte5qa7saelqw3nfy2rljqjhkz0ngwk7vh34ldcsy";
const OTHER = "kaspasim:qzspdj2hsje4e0qcekc29z5c73j9k5nfc0set3zevfazf0262y2vv0vgf0t32";
const hashOf = (i: number) => `b${i.toString(16).padStart(63, "0")}`;
const txid = (i: number) => `a${i.toString(16).padStart(63, "0")}`;

function scriptedNode(tip: number, accepted: Record<number, any[]>, extra: Partial<Record<string, (p: any) => any>> = {}) {
  const methods: string[] = [];
  const header = (i: number) => ({ hash: hashOf(i), daaScore: i, blueScore: i, parentsByLevel: i === 0 ? [] : [[hashOf(i - 1)]] });
  const rpc = {
    getUtxosByAddress: vi.fn(async () => []),
    getBalanceByAddress: vi.fn(async () => ({ balanceSompi: 0n })),
    async call(method: string, params: any) {
      methods.push(method);
      if (extra[method]) return extra[method]!(params);
      switch (method) {
        case "getServerInfo":
          return { networkId: "simnet", isSynced: true };
        case "getBlockDagInfo":
          return { sink: hashOf(tip), virtualDaaScore: tip + 1, pruningPointHash: hashOf(0) };
        case "getSinkBlueScore":
          return { blueScore: tip };
        case "getBlock": {
          const i = parseInt(String(params.hash).slice(1), 16);
          return { block: { header: header(i), verboseData: { selectedParentHash: i === 0 ? "fe".repeat(32) : hashOf(i - 1) } } };
        }
        case "getVirtualChainFromBlockV2": {
          const i = parseInt(String(params.startHash).slice(1), 16);
          const added = [];
          const acc = [];
          for (let j = i + 1; j <= tip; j++) {
            added.push(hashOf(j));
            acc.push({ chainBlockHeader: header(j), acceptedTransactions: accepted[j] ?? [] });
          }
          return { removedChainBlockHashes: [], addedChainBlockHashes: added, chainBlockAcceptedTransactions: acc };
        }
        default:
          throw new Error(`unexpected ${method}`);
      }
    }
  };
  return { rpc, methods };
}

const pay = (id: string, to: string, amount: number) => ({
  inputs: [{ previousOutpoint: { transactionId: txid(900), index: 0 }, verboseData: { utxoEntry: { amount: 1000, verboseData: { scriptPublicKeyAddress: OTHER } } } }],
  outputs: [{ value: amount, verboseData: { scriptPublicKeyAddress: to } }],
  verboseData: { transactionId: id }
});

function open(name: string, rpc: any, extra: Record<string, unknown> = {}) {
  const wallet = WalletToolkit.open(name, { storePath: `mem://${name}`, rpc, ...extra });
  vi.spyOn(wallet, "receive").mockResolvedValue(ADDRESS);
  return wallet;
}

describe("R3-D · WalletToolkit.history() through a node", () => {
  it("TH-1 the window's entries, as an array that carries what the window covered", async () => {
    const { rpc } = scriptedNode(20, { 5: [pay(txid(1), ADDRESS, 300)], 9: [pay(txid(2), OTHER, 1)], 12: [pay(txid(3), ADDRESS, 200)] });
    const history = await open("r3d-th1", rpc).history();
    expect(Array.isArray(history)).toBe(true);
    expect(history.map((e: any) => e.txId)).toEqual([txid(1), txid(3)]);
    expect(history[0]).toMatchObject({ direction: "in", receivedSompi: "300", acceptance: { chainBlockHash: hashOf(5), confirmationsDaa: "16" } });
    expect(history.coverage?.window).toMatchObject({ requested: { kind: "default", lookback: 1000 }, reachedTip: true, startsAtPruningPoint: true });
    expect(history.total).toBe(2);
    expect(rpc.getUtxosByAddress).not.toHaveBeenCalled();
  });

  it("TH-2 a window from a DAA score, and historyPage() with the whole result", async () => {
    const { rpc } = scriptedNode(20, { 5: [pay(txid(1), ADDRESS, 300)], 12: [pay(txid(3), ADDRESS, 200)] });
    const wallet = open("r3d-th2", rpc);
    const page = await wallet.historyPage({ since: 8, limit: 10 });
    expect(page.entries.map((e) => e.txId)).toEqual([txid(3)]);
    expect(page.coverage.window.firstCoveredDaaScore).toBe("8");
    expect(page.coverage.notCovered[0]).toMatch(/at or below DAA score 7/);
  });

  it("TH-3 mainnet is refused before the node is asked anything", async () => {
    const { rpc, methods } = scriptedNode(5, {});
    const wallet = open("r3d-th3", rpc, { networkId: "mainnet" });
    await expect(wallet.history()).rejects.toMatchObject({ code: "MAINNET_CONNECTION_DISABLED" });
    expect(methods).toEqual([]);
  });

  it("TH-4 a node that cannot bound a window, and none given: WALLET_HISTORY_UNSUPPORTED with its cause; with a window, the node's own error", async () => {
    const { rpc } = scriptedNode(5, {}, { getBlockDagInfo: () => ({ sink: hashOf(5) }) });
    const wallet = open("r3d-th4", rpc);
    await expect(wallet.history()).rejects.toMatchObject({ code: "WALLET_HISTORY_UNSUPPORTED", metadata: { source: "rpc", supported: false } });
    await expect(wallet.history({ since: 2 })).rejects.toMatchObject({ code: "ADDRESS_HISTORY_NODE_UNSUPPORTED" });
  });

  it("TH-5 a provider wallet has no chain window: historyPage() is WALLET_HISTORY_UNSUPPORTED, history() keeps the provider's items", async () => {
    const items = [{ txId: "t", timestamp: 1, amountSompi: 1n, isSend: false }];
    const provider = { source: "mock", getBalances: async () => ({}), getUtxos: async () => ({}), getHistory: async () => ({ items }) };
    const wallet = WalletToolkit.open("r3d-th5", { storePath: "mem://r3d-th5", provider });
    vi.spyOn(wallet, "receive").mockResolvedValue(ADDRESS);
    expect(await wallet.history()).toEqual(items);
    await expect(wallet.historyPage()).rejects.toMatchObject({ code: "WALLET_HISTORY_UNSUPPORTED" });
  });
});
