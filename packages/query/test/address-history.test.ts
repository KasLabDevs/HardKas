import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { calculateContentHash, HardkasSchemas } from "@hardkas/artifacts";
import { readAddressHistory, locateTransactionByAddress, workspaceRecordsFor, type AddressHistoryRpc } from "../src/address-history.js";

// R3-D · ADDRESS-HISTORY-1 against a scripted node (the shapes of rusty-kaspad v2.1.0's getVirtualChainFromBlockV2 at
// verbosity High, as read on the isolated simnet: chainBlockHeader {hash, daaScore, blueScore}, accepted transactions
// with outputs' verboseData.scriptPublicKeyAddress and inputs' verboseData.utxoEntry). The real node is in
// packages/sdk/test/address-history-node.simnet.test.ts.

const BOB = "kaspasim:qra97q5zuevchu7w45mkjte5qa7saelqw3nfy2rljqjhkz0ngwk7vh34ldcsy";
const ALICE = "kaspasim:qpq99nxtny32lajqn3f2u20tktzyrey99n242efruhgpe2z9e2jzkfysgprhp";
const CAROL = "kaspasim:qzspdj2hsje4e0qcekc29z5c73j9k5nfc0set3zevfazf0262y2vv0vgf0t32";
const COV = "c0".repeat(32);

const hashOf = (i: number) => `b${i.toString(16).padStart(63, "0")}`;
const txid = (n: number) => `a${n.toString(16).padStart(63, "0")}`;

interface FakeOut {
  address: string;
  amount: bigint;
  covenantId?: string;
}
interface FakeIn {
  outpoint: string;
  address?: string;
  amount?: bigint;
  covenantId?: string;
}
function tx(id: string, inputs: FakeIn[], outputs: FakeOut[], coinbase = false): any {
  return {
    inputs: inputs.map((i) => {
      const [t, idx] = i.outpoint.split(":");
      return {
        previousOutpoint: { transactionId: t, index: Number(idx) },
        signatureScript: "41aa",
        sequence: 0,
        sigOpCount: 1,
        verboseData: {
          utxoEntry:
            i.address === undefined
              ? { verboseData: {} }
              : { amount: Number(i.amount ?? 0n), isCoinbase: false, ...(i.covenantId ? { covenantId: i.covenantId } : {}), verboseData: { scriptPublicKeyType: "PubKey", scriptPublicKeyAddress: i.address } }
        }
      };
    }),
    outputs: outputs.map((o) => ({
      value: Number(o.amount),
      scriptPublicKey: "0000",
      ...(o.covenantId ? { covenant: { authorizingInput: 0, covenantId: o.covenantId } } : {}),
      verboseData: { scriptPublicKeyType: "PubKey", scriptPublicKeyAddress: o.address }
    })),
    subnetworkId: coinbase ? "0100000000000000000000000000000000000000" : "0000000000000000000000000000000000000000",
    verboseData: { transactionId: id, blockHash: "ee".repeat(32), blockTime: 1 }
  };
}

interface FakeNodeOptions {
  tip: number;
  /** chain block index → accepted transactions */
  txs?: Record<number, any[]>;
  batch?: number;
  network?: string;
  synced?: boolean;
  pruningPoint?: number;
  /** hook to rewrite an answer (incoherence, reorgs) */
  v2?: (startIndex: number, answer: any, call: number) => any;
  failV2?: (call: number) => Error | undefined;
}

function fakeNode(o: FakeNodeOptions) {
  const calls: Array<{ method: string; params: any }> = [];
  const batch = o.batch ?? 50;
  const pp = o.pruningPoint ?? 0;
  const indexOf = (h: string) => {
    const m = /^b([0-9a-f]{63})$/.exec(h);
    if (!m) return -1;
    const i = parseInt(m[1]!, 16);
    return i <= o.tip ? i : -1;
  };
  const header = (i: number) => ({ hash: hashOf(i), daaScore: i, blueScore: i + 1, parentsByLevel: i === 0 ? [] : [[hashOf(i - 1)]] });
  let v2calls = 0;
  const rpc: AddressHistoryRpc & { calls: typeof calls; tipTo(n: number): void } = {
    calls,
    tipTo(n: number) {
      o.tip = n;
    },
    async call<T>(method: string, params: any): Promise<T> {
      calls.push({ method, params });
      switch (method) {
        case "getServerInfo":
          return { networkId: o.network ?? "simnet", isSynced: o.synced ?? true, serverVersion: "2.1.0" } as T;
        case "getBlockDagInfo":
          return { network: o.network ?? "simnet", sink: hashOf(o.tip), virtualDaaScore: o.tip + 1, pruningPointHash: hashOf(pp) } as T;
        case "getSinkBlueScore":
          return { blueScore: o.tip + 1 } as T;
        case "getBlock": {
          const i = indexOf(params.hash);
          if (i < 0) throw new Error(`cannot find header ${params.hash}`);
          return { block: { header: header(i), verboseData: { selectedParentHash: i === 0 ? "fe".repeat(32) : hashOf(i - 1) } } } as T;
        }
        case "getVirtualChainFromBlockV2": {
          const call = v2calls++;
          const fail = o.failV2?.(call);
          if (fail) throw fail;
          expect(params.dataVerbosityLevel).toBe("High");
          const i = indexOf(params.startHash);
          if (i < 0) throw new Error(`cannot find header ${params.startHash}`);
          const added: string[] = [];
          const accepted: any[] = [];
          for (let j = i + 1; j <= Math.min(o.tip, i + batch); j++) {
            added.push(hashOf(j));
            accepted.push({ chainBlockHeader: { hash: hashOf(j), daaScore: j, blueScore: j + 1 }, acceptedTransactions: o.txs?.[j] ?? [] });
          }
          const answer = { removedChainBlockHashes: [], addedChainBlockHashes: added, chainBlockAcceptedTransactions: accepted };
          return (o.v2 ? o.v2(i, answer, call) : answer) as T;
        }
        default:
          throw new Error(`unexpected ${method}`);
      }
    }
  };
  return rpc;
}

// three payments to bob (blocks 10, 20, 30), two spends by bob (blocks 40: spends the first; 50: spends the second),
// coinbases to alice on every 5th block, a payment to carol that never touches bob
function bobChain(): Record<number, any[]> {
  const txs: Record<number, any[]> = {};
  for (let i = 5; i <= 60; i += 5) txs[i] = [tx(txid(1000 + i), [], [{ address: ALICE, amount: 50n }], true)];
  txs[10]!.push(tx(txid(1), [{ outpoint: `${txid(900)}:0`, address: ALICE, amount: 1000n }], [{ address: BOB, amount: 300n }, { address: ALICE, amount: 690n }]));
  txs[20]!.push(tx(txid(2), [{ outpoint: `${txid(901)}:0`, address: ALICE, amount: 1000n }], [{ address: BOB, amount: 200n }, { address: ALICE, amount: 790n }]));
  txs[30]!.push(tx(txid(3), [{ outpoint: `${txid(902)}:0`, address: ALICE, amount: 1000n }], [{ address: ALICE, amount: 590n }, { address: BOB, amount: 400n }]));
  txs[40]!.push(tx(txid(4), [{ outpoint: `${txid(1)}:0`, address: BOB, amount: 300n }], [{ address: CAROL, amount: 100n }, { address: BOB, amount: 190n }]));
  txs[50]!.push(tx(txid(5), [{ outpoint: `${txid(2)}:0`, address: BOB, amount: 200n }], [{ address: CAROL, amount: 190n }]));
  txs[55]!.push(tx(txid(6), [{ outpoint: `${txid(903)}:0`, address: ALICE, amount: 1000n }], [{ address: CAROL, amount: 990n }]));
  return txs;
}

const made: string[] = [];
afterEach(() => {
  for (const d of made.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe("R3-D · readAddressHistory (scripted node)", () => {
  it("H-1 mainnet in any form is refused before anything is asked (MAINNET_CONNECTION_DISABLED)", async () => {
    for (const [networkId, address] of [
      ["mainnet", BOB],
      ["kaspa-mainnet", BOB],
      ["simnet", "kaspa:qra97q5zuevchu7w45mkjte5qa7saelqw3nfy2rljqjhkz0ngwk7vh34ldcsy"]
    ] as const) {
      const node = fakeNode({ tip: 10 });
      await expect(readAddressHistory(node, { address, networkId })).rejects.toMatchObject({ code: "MAINNET_CONNECTION_DISABLED" });
      expect(node.calls, `${networkId} ${address}`).toEqual([]);
    }
  });

  it("H-2 a node that says mainnet: refused after its one identity answer, nothing else read", async () => {
    const node = fakeNode({ tip: 10, network: "mainnet" });
    await expect(readAddressHistory(node, { address: BOB, networkId: "simnet" })).rejects.toMatchObject({ code: "MAINNET_CONNECTION_DISABLED" });
    expect(node.calls.map((c) => c.method)).toEqual(["getServerInfo"]);
  });

  it("H-3 usage, the simulator, and a network mismatch are typed refusals before any read", async () => {
    const cases: Array<[any, string]> = [
      [{ address: BOB, networkId: "simulated" }, "ADDRESS_HISTORY_REQUIRES_NODE"],
      [{ address: BOB, networkId: "testnet-10" }, "ADDRESS_HISTORY_NETWORK_MISMATCH"],
      [{ address: "not-an-address", networkId: "simnet" }, "ADDRESS_HISTORY_USAGE"],
      [{ address: BOB, networkId: "nonsense" }, "ADDRESS_HISTORY_USAGE"],
      [{ address: BOB, networkId: "simnet", since: "xyz" }, "ADDRESS_HISTORY_USAGE"],
      [{ address: BOB, networkId: "simnet", limit: 0 }, "ADDRESS_HISTORY_USAGE"],
      [{ address: BOB, networkId: "simnet", maxChainBlocks: 1.5 }, "ADDRESS_HISTORY_USAGE"],
      [{ address: BOB, networkId: "simnet", cursor: "garbage" }, "ADDRESS_HISTORY_USAGE"]
    ];
    for (const [opts, code] of cases) {
      const node = fakeNode({ tip: 10 });
      await expect(readAddressHistory(node, opts), JSON.stringify(opts)).rejects.toMatchObject({ code });
      expect(node.calls, JSON.stringify(opts)).toEqual([]);
    }
    const other = fakeNode({ tip: 10, network: "devnet" });
    await expect(readAddressHistory(other, { address: BOB, networkId: "simnet" })).rejects.toMatchObject({ code: "ADDRESS_HISTORY_NETWORK_MISMATCH" });
    expect(other.calls.map((c) => c.method)).toEqual(["getServerInfo"]);
  });

  it("H-4 the whole chain: three payments and two spends, deduplicated, in chain order, with their depths", async () => {
    const node = fakeNode({ tip: 70, txs: bobChain(), batch: 16 });
    const r = await readAddressHistory(node, { address: BOB, networkId: "simnet", since: "0" });
    expect(r.schema).toBe(HardkasSchemas.AddressHistoryV1);
    expect(r.entries.map((e) => e.txId)).toEqual([txid(1), txid(2), txid(3), txid(4), txid(5)]);
    expect(r.total).toBe(5);
    const [p1, p2, p3, s1, s2] = r.entries;
    expect(p1).toMatchObject({ source: "node", direction: "in", receivedSompi: "300", spentSompi: "0", netSompi: "300", outputs: [{ index: 0, amountSompi: "300", spentBy: txid(4) }] });
    expect(p2!.outputs).toEqual([{ index: 0, amountSompi: "200", spentBy: txid(5) }]);
    expect(p3!.outputs).toEqual([{ index: 1, amountSompi: "400" }]);
    expect(s1).toMatchObject({ direction: "self", receivedSompi: "190", spentSompi: "300", netSompi: "-110", spends: [{ outpoint: `${txid(1)}:0`, amountSompi: "300", matchedBy: "node-entry" }] });
    expect(s2).toMatchObject({ direction: "out", receivedSompi: "0", spentSompi: "200", netSompi: "-200" });
    // virtual DAA 71, sink blue score 71: chain block i has DAA i and blue score i+1
    expect(p1!.acceptance).toMatchObject({ chainBlockHash: hashOf(10), daaScore: "10", blueScore: "11", previousChainBlockHash: hashOf(9), confirmationsDaa: "61", confirmationsBlue: "60" });
    expect(s2!.acceptance).toMatchObject({ chainBlockHash: hashOf(50), confirmationsDaa: "21" });
    expect(r.coverage.window).toMatchObject({
      requested: { kind: "daaScore", value: "0" },
      from: { hash: hashOf(0), daaScore: "0" },
      firstCoveredDaaScore: "1",
      to: { hash: hashOf(70), daaScore: "70" },
      chainBlocks: 70,
      reachedTip: true,
      startsAtPruningPoint: true,
      stoppedBy: "tip"
    });
    expect(r.coverage.spends).toBe("node-entries");
    expect(r.coverage.notCovered.join(" ")).toMatch(/mempool/);
    // the pruning point is the genesis here: nothing older exists, so no "before the window" gap is claimed
    expect(r.coverage.notCovered.join(" ")).not.toMatch(/at or below DAA score/);
    expect(r.coverage.reads.getVirtualChainFromBlockV2).toBe(Math.ceil(70 / 16) + 1);
  });

  it("H-5 a window that starts after the first payment: it is not reported, the coverage says so, and its spend (later) still is", async () => {
    const node = fakeNode({ tip: 70, txs: bobChain() });
    const r = await readAddressHistory(node, { address: BOB, networkId: "simnet", since: "15" });
    expect(r.entries.map((e) => e.txId)).toEqual([txid(2), txid(3), txid(4), txid(5)]);
    expect(r.coverage.window).toMatchObject({ from: { hash: hashOf(14), daaScore: "14" }, firstCoveredDaaScore: "15", startsAtPruningPoint: false, reachedTip: true });
    expect(r.coverage.notCovered[0]).toMatch(/at or below DAA score 14/);
    // the spend of the first payment's output names it through the node's spent entry, though that output is older
    expect(r.entries.find((e) => e.txId === txid(4))!.spends).toEqual([{ outpoint: `${txid(1)}:0`, amountSompi: "300", coinbase: false, matchedBy: "node-entry" }]);
    // and a block-hash start is the same window
    const byHash = await readAddressHistory(fakeNode({ tip: 70, txs: bobChain() }), { address: BOB, networkId: "simnet", since: hashOf(14) });
    expect(byHash.entries.map((e) => e.txId)).toEqual(r.entries.map((e) => e.txId));
  });

  it("H-6 the default window: lookback chain blocks back from the sink", async () => {
    const node = fakeNode({ tip: 70, txs: bobChain() });
    const r = await readAddressHistory(node, { address: BOB, networkId: "simnet", lookback: 25 });
    expect(r.coverage.window).toMatchObject({ requested: { kind: "default", lookback: 25 }, from: { daaScore: "45" }, chainBlocks: 25, reachedTip: true, requestedStartNotReached: false });
    expect(r.entries.map((e) => e.txId)).toEqual([txid(5)]);
    const all = await readAddressHistory(fakeNode({ tip: 70, txs: bobChain() }), { address: BOB, networkId: "simnet" });
    expect(all.coverage.window).toMatchObject({ requested: { kind: "default", lookback: 1000 }, startsAtPruningPoint: true, from: { daaScore: "0" } });
    expect(all.total).toBe(5);
  });

  it("H-7 the read bound: the window stops at maxChainBlocks, says where, and the next window continues from there", async () => {
    const node = fakeNode({ tip: 70, txs: bobChain(), batch: 64 });
    const a = await readAddressHistory(node, { address: BOB, networkId: "simnet", since: "0", maxChainBlocks: 25 });
    expect(a.coverage.window).toMatchObject({ chainBlocks: 25, reachedTip: false, stoppedBy: "max-chain-blocks", to: { hash: hashOf(25) }, continueFrom: hashOf(25) });
    expect(a.entries.map((e) => e.txId)).toEqual([txid(1), txid(2)]);
    expect(a.coverage.notCovered.join(" ")).toMatch(new RegExp(`after chain block ${hashOf(25)}`));
    const b = await readAddressHistory(node, { address: BOB, networkId: "simnet", since: a.coverage.window.continueFrom!, maxChainBlocks: 25 });
    expect(b.entries.map((e) => e.txId)).toEqual([txid(3), txid(4), txid(5)]);
  });

  it("H-8 pages: limit and a cursor over the same window", async () => {
    const node = fakeNode({ tip: 70, txs: bobChain() });
    const p1 = await readAddressHistory(node, { address: BOB, networkId: "simnet", since: "0", limit: 2 });
    expect(p1.entries.map((e) => e.txId)).toEqual([txid(1), txid(2)]);
    expect(p1.page).toMatchObject({ offset: 0, limit: 2 });
    expect(typeof p1.page.nextCursor).toBe("string");
    node.tipTo(75); // the chain moves on: the cursor's window is pinned to the chain block the first page read last
    const p2 = await readAddressHistory(node, { address: BOB, networkId: "simnet", cursor: p1.page.nextCursor!, limit: 2 });
    expect(p2.entries.map((e) => e.txId)).toEqual([txid(3), txid(4)]);
    expect(p2.coverage.window).toMatchObject({ requested: { kind: "cursor" }, to: { hash: hashOf(70) }, stoppedBy: "page-end" });
    const p3 = await readAddressHistory(node, { address: BOB, networkId: "simnet", cursor: p2.page.nextCursor!, limit: 2 });
    expect(p3.entries.map((e) => e.txId)).toEqual([txid(5)]);
    expect(p3.page.nextCursor).toBeUndefined();
    await expect(readAddressHistory(node, { address: CAROL, networkId: "simnet", cursor: p1.page.nextCursor! })).rejects.toMatchObject({ code: "ADDRESS_HISTORY_USAGE" });
  });

  it("H-9 an input without the node's spent entry is matched only to an output created in the window; the coverage says so", async () => {
    const txs = bobChain();
    // strip every spent entry's address
    for (const list of Object.values(txs)) for (const t of list) for (const i of t.inputs) i.verboseData.utxoEntry = { verboseData: {} };
    const node = fakeNode({ tip: 70, txs });
    const whole = await readAddressHistory(node, { address: BOB, networkId: "simnet", since: "0" });
    expect(whole.entries.map((e) => e.txId)).toEqual([txid(1), txid(2), txid(3), txid(4), txid(5)]);
    expect(whole.entries[3]!.spends).toEqual([{ outpoint: `${txid(1)}:0`, matchedBy: "window-output" }]);
    expect(whole.entries[3]!.spentSompi).toBeUndefined();
    expect(whole.coverage.spends).toBe("window-outputs-only");
    const later = await readAddressHistory(fakeNode({ tip: 70, txs }), { address: BOB, networkId: "simnet", since: "15" });
    // the spend of the first payment cannot be attributed (its output is before the window): it shows only as the
    // change it paid back, and the coverage says why
    expect(later.entries.map((e) => e.txId)).toEqual([txid(2), txid(3), txid(4), txid(5)]);
    expect(later.entries[2]).toMatchObject({ direction: "in", spends: [], receivedSompi: "190" });
    expect(later.entries[3]!.spends).toEqual([{ outpoint: `${txid(2)}:0`, matchedBy: "window-output" }]);
    expect(later.coverage.notCovered.join(" ")).toMatch(/P2PK unlock does not name its key/);
  });

  it("H-10 covenant-bound outputs and spends are labelled, never counted as plain KAS", async () => {
    const txs: Record<number, any[]> = {
      3: [tx(txid(7), [{ outpoint: `${txid(900)}:0`, address: ALICE, amount: 900n }], [{ address: BOB, amount: 500n, covenantId: COV }, { address: BOB, amount: 100n }])],
      6: [tx(txid(8), [{ outpoint: `${txid(7)}:0`, address: BOB, amount: 500n, covenantId: COV }], [{ address: CAROL, amount: 490n, covenantId: COV }])]
    };
    const r = await readAddressHistory(fakeNode({ tip: 8, txs }), { address: BOB, networkId: "simnet" });
    expect(r.entries[0]).toMatchObject({ covenantBound: true, receivedSompi: "100", covenantBoundReceivedSompi: "500", outputs: [{ index: 0, covenantId: COV, spentBy: txid(8) }, { index: 1 }] });
    expect(r.entries[1]).toMatchObject({ covenantBound: true, direction: "out", spends: [{ outpoint: `${txid(7)}:0`, covenantId: COV, amountSompi: "500" }] });
  });

  it("H-11 the pruning point bounds every start: a DAA below it is moved up (and said); an unknown block is SINCE_UNAVAILABLE", async () => {
    const node = fakeNode({ tip: 70, txs: bobChain(), pruningPoint: 12 });
    const r = await readAddressHistory(node, { address: BOB, networkId: "simnet", since: "3" });
    expect(r.coverage.window).toMatchObject({ from: { hash: hashOf(12) }, startsAtPruningPoint: true, clampedToPruningPoint: true });
    expect(r.entries.map((e) => e.txId)).toEqual([txid(2), txid(3), txid(4), txid(5)]);
    expect(r.coverage.notCovered[0]).toMatch(/pruning point \(nothing older is readable on this node\)/);
    const below = await readAddressHistory(fakeNode({ tip: 70, txs: bobChain(), pruningPoint: 12 }), { address: BOB, networkId: "simnet", since: hashOf(5) });
    expect(below.coverage.window).toMatchObject({ from: { hash: hashOf(12) }, clampedToPruningPoint: true });
    await expect(readAddressHistory(fakeNode({ tip: 70 }), { address: BOB, networkId: "simnet", since: "cd".repeat(32) })).rejects.toMatchObject({ code: "ADDRESS_HISTORY_SINCE_UNAVAILABLE" });
  });

  it("H-12 an incoherent chain answer is rejected whole (ADDRESS_HISTORY_CHAIN_ANSWER_INCOHERENT)", async () => {
    const node = fakeNode({
      tip: 20,
      txs: bobChain(),
      v2: (_i, a) => ({ ...a, chainBlockAcceptedTransactions: a.chainBlockAcceptedTransactions.slice(1) })
    });
    await expect(readAddressHistory(node, { address: BOB, networkId: "simnet", since: "0" })).rejects.toMatchObject({ code: "ADDRESS_HISTORY_CHAIN_ANSWER_INCOHERENT" });
  });

  it("H-13 a reorg between two batches: the removed chain blocks' transactions are dropped, the new chain's kept", async () => {
    const txs = bobChain();
    const node = fakeNode({
      tip: 70,
      txs,
      batch: 30,
      v2: (i, a, call) => {
        // second batch (from block 30): the node says block 30 left the chain; its payment is accepted again by block 31
        if (call === 1 && i === 30) {
          return {
            removedChainBlockHashes: [hashOf(30)],
            addedChainBlockHashes: [hashOf(31), ...a.addedChainBlockHashes.slice(1)],
            chainBlockAcceptedTransactions: [
              { chainBlockHeader: { hash: hashOf(31), daaScore: 31, blueScore: 32 }, acceptedTransactions: txs[30]! },
              ...a.chainBlockAcceptedTransactions.slice(1)
            ]
          };
        }
        return a;
      }
    });
    const r = await readAddressHistory(node, { address: BOB, networkId: "simnet", since: "0" });
    expect(r.entries.map((e) => e.txId)).toEqual([txid(1), txid(2), txid(3), txid(4), txid(5)]);
    expect(r.entries[2]!.acceptance).toMatchObject({ chainBlockHash: hashOf(31) });
  });

  it("H-14 the deadline ends the window early, and the coverage says so", async () => {
    let t = 0;
    const node = fakeNode({ tip: 70, txs: bobChain(), batch: 10 });
    const slow: AddressHistoryRpc = {
      async call<T>(m: string, p: any) {
        if (m === "getVirtualChainFromBlockV2") t += 400;
        return node.call<T>(m, p);
      }
    };
    const r = await readAddressHistory(slow, { address: BOB, networkId: "simnet", since: "0", timeoutMs: 1000, now: () => t });
    expect(r.coverage.window).toMatchObject({ reachedTip: false, stoppedBy: "deadline", chainBlocks: 30 });
    expect(r.entries.map((e) => e.txId)).toEqual([txid(1), txid(2), txid(3)]);
  });

  it("H-15 a node that cannot serve the read: typed (NODE_UNSUPPORTED, READ_FAILED), never an empty history", async () => {
    const noV2 = fakeNode({ tip: 10, failV2: () => new Error("Kaspa RpcApi -> Error: unknown variant `High`, expected one of `None`") });
    await expect(readAddressHistory(noV2, { address: BOB, networkId: "simnet" })).rejects.toMatchObject({ code: "ADDRESS_HISTORY_NODE_UNSUPPORTED" });
    const down = fakeNode({ tip: 10, failV2: () => new Error("WebSocket is not connected") });
    await expect(readAddressHistory(down, { address: BOB, networkId: "simnet" })).rejects.toMatchObject({ code: "ADDRESS_HISTORY_READ_FAILED" });
    const noPp: AddressHistoryRpc = { async call<T>(m: string) { return (m === "getBlockDagInfo" ? { sink: hashOf(1) } : { networkId: "simnet" }) as T; } };
    await expect(readAddressHistory(noPp, { address: BOB, networkId: "simnet" })).rejects.toMatchObject({ code: "ADDRESS_HISTORY_NODE_UNSUPPORTED" });
  });

  it("H-16 locateTransactionByAddress: the accepting chain block and a cursor before it; not found says which window", async () => {
    const node = fakeNode({ tip: 70, txs: bobChain() });
    const hit = await locateTransactionByAddress(node, { address: BOB, networkId: "simnet", txId: txid(2) });
    expect(hit).toMatchObject({ found: true, acceptance: { chainBlockHash: hashOf(20), previousChainBlockHash: hashOf(19) } });
    const miss = await locateTransactionByAddress(fakeNode({ tip: 70, txs: bobChain() }), { address: BOB, networkId: "simnet", txId: txid(1), since: "15" });
    expect(miss.found).toBe(false);
    expect(miss.coverage.window.firstCoveredDaaScore).toBe("15");
  });

  it("H-17 an unsynced node: the history is read and the coverage says what that means", async () => {
    const r = await readAddressHistory(fakeNode({ tip: 20, txs: bobChain(), synced: false }), { address: BOB, networkId: "simnet" });
    expect(r.coverage.node).toMatchObject({ isSynced: false, networkId: "simnet" });
    expect(r.coverage.notCovered.join(" ")).toMatch(/says it is not synced/);
  });
});

describe("R3-D · the workspace's own records", () => {
  function workspaceWith(records: any[]): string {
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-r3d-hist-"));
    made.push(ws);
    const dir = path.join(ws, ".hardkas", "artifacts", "receipts");
    fs.mkdirSync(dir, { recursive: true });
    records.forEach((r, i) => fs.writeFileSync(path.join(dir, `r${i}.json`), JSON.stringify(r)));
    return ws;
  }
  const sealed = (a: any) => ({ ...a, contentHash: calculateContentHash(a, 5) });

  function planAndSubmission(id: string, opts: { inputs: any[]; outputs: any[]; change?: any; accepted?: boolean; error?: string }) {
    const plan = sealed({
      schema: HardkasSchemas.TxPlan,
      hashVersion: 5,
      networkId: "simnet",
      mode: "rpc",
      from: { address: BOB },
      to: { address: CAROL },
      amountSompi: "1",
      estimatedFeeSompi: "1",
      estimatedMass: "1",
      inputs: opts.inputs,
      outputs: opts.outputs,
      ...(opts.change ? { change: opts.change } : {})
    });
    const submission = sealed({
      schema: HardkasSchemas.TxSubmissionV1,
      hashVersion: 5,
      hardkasVersion: "0.0.0-test",
      version: "1.0.0-alpha",
      mode: "rpc",
      createdAt: "2026-11-15T00:00:00.000Z",
      networkId: "simnet",
      txId: id,
      signedArtifactId: "dd".repeat(32),
      submitResult: { accepted: opts.accepted ?? true, ...(opts.error ? { error: opts.error } : {}) },
      submittedAt: "2026-11-15T00:00:00.000Z",
      fee: { status: "derived", method: "inputs-minus-outputs", inputsSompi: "1", outputsSompi: "1", feeSompi: "0", inputCount: 1, outputCount: 1, planArtifactId: plan.contentHash }
    });
    return [plan, submission];
  }

  it("W-1 the workspace's spends are listed even outside the window; inside it, merged with the node's entry", async () => {
    const outside = txid(77);
    const ws = workspaceWith([
      // bob's spend of txid(1):0 recorded here (it IS in the window: merged)
      ...planAndSubmission(txid(4), { inputs: [{ outpoint: { transactionId: txid(1), index: 0 }, amountSompi: "300", address: BOB }], outputs: [{ address: CAROL, amountSompi: "100" }], change: { address: BOB, amountSompi: "190" } }),
      // a spend the window does not hold (sent, never observed here)
      ...planAndSubmission(outside, { inputs: [{ outpoint: { transactionId: txid(3), index: 1 }, amountSompi: "400", address: BOB }], outputs: [{ address: CAROL, amountSompi: "390" }] }),
      // a submission the node rejected is not history
      ...planAndSubmission(txid(78), { inputs: [{ outpoint: { transactionId: txid(3), index: 1 }, amountSompi: "400", address: BOB }], outputs: [{ address: CAROL, amountSompi: "380" }], accepted: false, error: "Rejected transaction x: bad" })
    ]);
    const found = workspaceRecordsFor(ws, BOB);
    expect(found.records.map((r) => r.txId).sort()).toEqual([txid(4), outside].sort());
    const r = await readAddressHistory(fakeNode({ tip: 70, txs: bobChain() }), { address: BOB, networkId: "simnet", since: "35", workspaceRoot: ws });
    expect(r.entries.map((e) => [e.txId, e.source])).toEqual([
      [txid(4), "node+workspace"],
      [txid(5), "node"],
      [outside, "workspace"]
    ]);
    const rec = r.entries[2]!;
    expect(rec).toMatchObject({ direction: "out", spentSompi: "400", spends: [{ outpoint: `${txid(3)}:1`, matchedBy: "workspace-plan" }], workspace: { state: "SUBMITTED" } });
    expect(rec.outsideWindow).toMatch(/locates no accepting chain block/);
    expect(r.coverage.workspace).toMatchObject({ merged: true, records: 2, outsideWindow: 1, rejected: 0 });
  });

  it("W-2 a record whose identity does not verify is not used, and is counted", async () => {
    const [plan, submission] = planAndSubmission(txid(4), { inputs: [{ outpoint: { transactionId: txid(1), index: 0 }, amountSompi: "300", address: BOB }], outputs: [{ address: CAROL, amountSompi: "100" }] });
    const ws = workspaceWith([plan, { ...submission, txId: txid(99) }]);
    const found = workspaceRecordsFor(ws, BOB);
    expect(found).toMatchObject({ records: [], rejected: 1 });
  });
});
