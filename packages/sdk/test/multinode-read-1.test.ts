import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { compareUtxosAcrossNodes, MULTINODE_GUARANTEE, observeTxAcrossNodes, readNodeSet, type ReadNode } from "../src/index.js";

// -----------------------------------------------------------------------------
// MULTINODE-READ-1 · several nodes read side by side, against in-memory stand-ins of the HardKAS client: identity (one
// network, the expected one), sync flag and lag behind the most advanced synced node; UTXOs compared outpoint by
// outpoint (agreed, entry conflict, presence differences the DAA scores account for = lag, others = disagreement); one
// look per node at a transaction (accepted by whom, which block, lag or disagreement). A wrong-network or unreachable
// node is never asked for data, and nothing is ever written to any node.
// -----------------------------------------------------------------------------

const H = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const ADDR = "kaspasim:qr0lr4ml9fn3chekrqmjdkergxl93l4wrk3dankcgvjq776s9wn9jeadh9sjw";
const SPK = "0000" + "20" + "aa".repeat(32) + "ac";
type Entry = { txid: string; index?: number; amount: bigint; daa: bigint; spk?: string; covenantId?: string };
type Fake = {
  network?: string;
  dagNetwork?: string;
  synced?: boolean;
  utxoIndex?: boolean;
  daa: bigint;
  unreachable?: boolean;
  utxos?: Entry[];
  mempool?: string[];
  /** txId → the chain block that accepted it, and that block's scores */
  accepted?: Record<string, { block: string; daa: bigint; blue: bigint }>;
  /** after its UTXOs are read, the node says it serves this network */
  switchAfterUtxoRead?: string;
  /** its getInfo.p2pId (default: its label) */
  p2pId?: string;
};

function node(label: string, f: Fake, calls: string[]): ReadNode {
  let switched = false;
  const network = () => (switched && f.switchAfterUtxoRead ? f.switchAfterUtxoRead : f.network ?? "simnet");
  const sink = H(`${label} sink`);
  const notFound = (what: string) => Object.assign(new Error(`${what} not found`), { code: "RPC_NOT_FOUND" });
  const client: any = {
    url: `ws://127.0.0.1/${label}`,
    async getServerInfo() {
      calls.push(`${label}:getServerInfo`);
      if (f.unreachable) throw new Error(`connect ECONNREFUSED ws://user:secret@127.0.0.1/${label}`);
      return { networkId: network(), serverVersion: "2.1.0", isSynced: f.synced ?? true, hasUtxoIndex: f.utxoIndex ?? true, virtualDaaScore: f.daa };
    },
    async getSinkBlueScore() {
      return { blueScore: f.daa - 5n };
    },
    async getUtxosByAddresses(addresses: string[]) {
      calls.push(`${label}:getUtxosByAddresses`);
      switched = true;
      return {
        entries: (f.utxos ?? []).map((e) => ({
          address: addresses[0],
          outpoint: { transactionId: e.txid, index: e.index ?? 0 },
          utxoEntry: { amount: e.amount, scriptPublicKey: e.spk ?? SPK, blockDaaScore: e.daa, isCoinbase: false, ...(e.covenantId ? { covenantId: e.covenantId } : {}) }
        }))
      };
    },
    async call(method: string, params: any) {
      calls.push(`${label}:${method}`);
      switch (method) {
        case "getInfo":
          return { p2pId: f.p2pId ?? label, serverVersion: "2.1.0", isSynced: f.synced ?? true, isUtxoIndexed: f.utxoIndex ?? true };
        case "getBlockDagInfo":
          return { network: f.dagNetwork && !switched ? f.dagNetwork : network(), virtualDaaScore: f.daa, sink, pruningPointHash: H("pruning point") };
        case "getSinkBlueScore":
          return { blueScore: f.daa - 5n };
        case "getMempoolEntry":
          if ((f.mempool ?? []).includes(params.transactionId)) return { mempoolEntry: { isOrphan: false, fee: 1000 } };
          throw notFound("transaction");
        case "getVirtualChainFromBlock": {
          const hits = Object.entries(f.accepted ?? {});
          if (hits.length === 0 || params.startHash !== H("pruning point")) return { removedChainBlockHashes: [], addedChainBlockHashes: [], acceptedTransactionIds: [] };
          return {
            removedChainBlockHashes: [],
            addedChainBlockHashes: hits.map(([, a]) => a.block),
            acceptedTransactionIds: hits.map(([tx, a]) => ({ acceptingBlockHash: a.block, acceptedTransactionIds: [tx] }))
          };
        }
        case "getBlock": {
          const hit = Object.values(f.accepted ?? {}).find((a) => a.block === params.hash);
          if (!hit) throw notFound("block");
          return { block: { header: { hash: hit.block, blueScore: hit.blue, daaScore: hit.daa } } };
        }
        default:
          throw new Error(`stand-in does not serve ${method}`);
      }
    },
    async submitTransaction() {
      calls.push(`${label}:submitTransaction`);
      throw new Error("a read-only node set wrote to a node");
    }
  };
  return { label, client };
}

const outcome = async <T>(p: Promise<T>) => {
  try {
    return { result: await p, error: undefined as any };
  } catch (error: any) {
    return { result: undefined as any, error };
  }
};

describe("MULTINODE-READ-1 · read-only node sets", () => {
  it("MN-1 identity and lag: one network, the expected one; unsynced, unreachable and wrong-network nodes named; lag behind the most advanced synced node", async () => {
    const calls: string[] = [];
    const set = await readNodeSet(
      [
        node("A", { daa: 1000n }, calls),
        node("B", { daa: 990n }, calls),
        node("C", { network: "testnet-10", daa: 2000n }, calls),
        node("D", { unreachable: true, daa: 0n }, calls),
        node("E", { synced: false, daa: 5000n }, calls),
        node("F", { daa: 500n }, calls),
        node("G", { dagNetwork: "testnet-10", daa: 1000n }, calls)
      ],
      { expectedNetwork: "simnet" }
    );
    const by = Object.fromEntries(set.nodes.map((n) => [n.label, n]));
    expect(Object.fromEntries(set.nodes.map((n) => [n.label, n.standing]))).toEqual({
      A: "usable",
      B: "usable",
      C: "wrong-network",
      D: "unreachable",
      E: "unsynced",
      F: "lagging",
      G: "wrong-network"
    });
    expect(set.reference).toEqual({ label: "A", virtualDaaScore: "1000" });
    expect([by.A!.lagDaa, by.B!.lagDaa, by.F!.lagDaa]).toEqual(["0", "10", "500"]);
    expect(by.G!.reasons[0]).toMatch(/do not name one network/);
    expect(by.D!.reasons[0]).not.toMatch(/secret/);
    expect(set.guarantee).toBe(MULTINODE_GUARANTEE);
    expect(set.scope).toBe("multi-observer");
    expect((await outcome(readNodeSet([node("A", { daa: 1n }, calls)], { expectedNetwork: "" }))).error?.code).toBe("MULTINODE_NETWORK_REQUIRED");
    expect((await outcome(readNodeSet([node("A", { daa: 1n }, calls), node("A", { daa: 1n }, calls)], { expectedNetwork: "simnet" }))).error?.code).toBe("MULTINODE_LABELS_NOT_UNIQUE");
  });

  it("MN-2 UTXOs every node lists with the same entry are agreed; each node's total and the DAA window of its answer are reported", async () => {
    const calls: string[] = [];
    const utxos = [{ txid: H("u1"), amount: 5n, daa: 900n }, { txid: H("u2"), amount: 7n, daa: 950n }];
    const nodes = [node("A", { daa: 1000n, utxos }, calls), node("B", { daa: 995n, utxos }, calls)];
    const cmp = await compareUtxosAcrossNodes(nodes, await readNodeSet(nodes, { expectedNetwork: "simnet" }), [ADDR]);
    expect(cmp.agreed).toEqual([`${H("u1")}:0`, `${H("u2")}:0`].sort());
    expect(cmp.disagreements).toEqual([]);
    expect(cmp.lag).toEqual([]);
    expect(cmp.nodes).toEqual({ A: { listed: 2, totalSompi: "12", daaBefore: "1000", daaAfter: "1000" }, B: { listed: 2, totalSompi: "12", daaBefore: "995", daaAfter: "995" } });
  });

  it("MN-3 one outpoint listed with different entries (amount, script, covenant id): UTXO_ENTRY_CONFLICT, never resolved by a vote", async () => {
    const calls: string[] = [];
    const base = { txid: H("u1"), amount: 5n, daa: 900n };
    for (const [name, other] of [
      ["amount", { ...base, amount: 6n }],
      ["script", { ...base, spk: "0000" + "20" + "bb".repeat(32) + "ac" }],
      ["covenant", { ...base, covenantId: H("cov") }]
    ] as const) {
      const nodes = [node("A", { daa: 1000n, utxos: [base] }, calls), node("B", { daa: 1000n, utxos: [base] }, calls), node("C", { daa: 1000n, utxos: [other] }, calls)];
      const cmp = await compareUtxosAcrossNodes(nodes, await readNodeSet(nodes, { expectedNetwork: "simnet" }), [ADDR]);
      expect(cmp.disagreements.map((d) => d.code), name).toEqual(["UTXO_ENTRY_CONFLICT"]);
      expect(Object.keys(cmp.disagreements[0]!.nodes).sort(), name).toEqual(["A", "B", "C"]);
      expect(cmp.agreed, name).toEqual([]);
    }
  });

  it("MN-4 presence differences the DAA scores account for are lag: a new output a node behind has not reached; a spent one only a node behind still lists", async () => {
    const calls: string[] = [];
    const fresh = { txid: H("new"), amount: 5n, daa: 995n };
    const spent = { txid: H("spent"), amount: 9n, daa: 100n };
    const nodes = [node("A", { daa: 1000n, utxos: [fresh] }, calls), node("F", { daa: 500n, utxos: [spent] }, calls)];
    const set = await readNodeSet(nodes, { expectedNetwork: "simnet" });
    expect(set.nodes.find((n) => n.label === "F")!.standing).toBe("lagging");
    const cmp = await compareUtxosAcrossNodes(nodes, set, [ADDR]);
    expect(cmp.disagreements).toEqual([]);
    expect(cmp.lag.map((l) => l.subject).sort()).toEqual([`${H("new")}:0`, `${H("spent")}:0`].sort());
    expect(cmp.lag.find((l) => l.subject.startsWith(H("new")))!.explanation).toMatch(/created at DAA 995/);
    expect(cmp.lag.find((l) => l.subject.startsWith(H("spent")))!.explanation).toMatch(/only nodes behind list it/);
  });

  it("MN-5 a presence difference between nodes at the same height: UTXO_PRESENCE_DISAGREES", async () => {
    const calls: string[] = [];
    const nodes = [node("A", { daa: 1000n, utxos: [{ txid: H("u1"), amount: 5n, daa: 900n }] }, calls), node("B", { daa: 999n, utxos: [] }, calls)];
    const cmp = await compareUtxosAcrossNodes(nodes, await readNodeSet(nodes, { expectedNetwork: "simnet" }), [ADDR]);
    expect(cmp.disagreements.map((d) => d.code)).toEqual(["UTXO_PRESENCE_DISAGREES"]);
    expect(cmp.lag).toEqual([]);
  });

  it("MN-6 a transaction: accepted by some nodes; a node behind the accepting block is lag; one past it that did not accept is TX_ACCEPTANCE_DIFFERS; two accepting blocks are TX_ACCEPTING_BLOCK_DIFFERS", async () => {
    const calls: string[] = [];
    const tx = H("tx");
    const x = { block: H("block X"), daa: 995n, blue: 990n };
    const nodes = [
      node("A", { daa: 1000n, accepted: { [tx]: x } }, calls),
      node("B", { daa: 990n, mempool: [tx] }, calls),
      node("C", { daa: 1000n, mempool: [tx] }, calls)
    ];
    const across = await observeTxAcrossNodes(nodes, await readNodeSet(nodes, { expectedNetwork: "simnet" }), tx);
    expect(across.acceptedBy).toEqual(["A"]);
    expect((across.nodes.A as any).finding).toMatchObject({ type: "chain_accepted", acceptingBlockHash: x.block });
    expect((across.nodes.B as any).finding.type).toBe("mempool_entry");
    expect(across.lag.map((l) => l.explanation)).toEqual([expect.stringMatching(/^B had not reached the accepting block's DAA score \(995\)/)]);
    expect(across.disagreements.map((d) => d.code)).toEqual(["TX_ACCEPTANCE_DIFFERS"]);
    expect(across.disagreements[0]!.detail).toMatch(/C did not accept it/);
    expect(new Set(across.observations.map((o) => o.observer.observerId)).size).toBe(3);

    const y = { block: H("block Y"), daa: 996n, blue: 991n };
    const forked = [node("A", { daa: 1000n, accepted: { [tx]: x } }, calls), node("B", { daa: 1000n, accepted: { [tx]: y } }, calls)];
    const split = await observeTxAcrossNodes(forked, await readNodeSet(forked, { expectedNetwork: "simnet" }), tx);
    expect(split.disagreements.map((d) => d.code)).toEqual(["TX_ACCEPTING_BLOCK_DIFFERS"]);
    expect(split.acceptedBy).toEqual(["A", "B"]);
  });

  it("MN-7 a wrong-network or unreachable node is never asked for data, a node that changes network mid-read is dropped, and nothing is written to any node", async () => {
    const calls: string[] = [];
    const tx = H("tx");
    const nodes = [
      node("A", { daa: 1000n, utxos: [{ txid: H("u1"), amount: 5n, daa: 900n }], mempool: [tx] }, calls),
      node("B", { daa: 1000n, utxos: [{ txid: H("u1"), amount: 5n, daa: 900n }], mempool: [tx] }, calls),
      node("C", { network: "testnet-10", daa: 1000n, utxos: [{ txid: H("u1"), amount: 5n, daa: 900n }] }, calls),
      node("D", { unreachable: true, daa: 0n }, calls),
      node("S", { daa: 1000n, utxos: [{ txid: H("other"), amount: 1n, daa: 900n }], switchAfterUtxoRead: "testnet-10" }, calls)
    ];
    const set = await readNodeSet(nodes, { expectedNetwork: "simnet" });
    const cmp = await compareUtxosAcrossNodes(nodes, set, [ADDR]);
    expect(cmp.agreed).toEqual([`${H("u1")}:0`]);
    expect((cmp.nodes.S as any).error).toMatch(/no longer says it serves simnet/);
    expect(cmp.disagreements).toEqual([]);
    await observeTxAcrossNodes(nodes.filter((n) => n.label !== "S"), set, tx);
    const dataCalls = calls.filter((c) => /getUtxosByAddresses|getMempoolEntry|getVirtualChainFromBlock|getBlock$/.test(c));
    expect(dataCalls.filter((c) => c.startsWith("C:") || c.startsWith("D:"))).toEqual([]);
    expect(calls.filter((c) => c.endsWith(":submitTransaction"))).toEqual([]);
  });

  it("MN-9 one node behind two endpoints (same p2p id) is one node: the second is a duplicate, never compared with the first", async () => {
    const calls: string[] = [];
    const nodes = [node("A", { daa: 1000n, p2pId: "peer-1" }, calls), node("A2", { daa: 1000n, p2pId: "peer-1" }, calls), node("B", { daa: 1000n, utxos: [] }, calls)];
    const set = await readNodeSet(nodes, { expectedNetwork: "simnet" });
    expect(set.nodes.map((n) => n.standing)).toEqual(["usable", "duplicate", "usable"]);
    expect(set.nodes[1]!.reasons[0]).toMatch(/the same node as A \(p2p id peer-1\)/);
    await compareUtxosAcrossNodes(nodes, set, [ADDR]);
    expect(calls).not.toContain("A2:getUtxosByAddresses");
  });

  it("MN-8 fewer than two nodes that answer: MULTINODE_INSUFFICIENT_NODES (nothing compared); a malformed txId is refused before any read", async () => {
    const calls: string[] = [];
    const nodes = [node("A", { daa: 1000n }, calls), node("C", { network: "testnet-10", daa: 1000n }, calls)];
    const set = await readNodeSet(nodes, { expectedNetwork: "simnet" });
    expect((await outcome(compareUtxosAcrossNodes(nodes, set, [ADDR]))).error?.code).toBe("MULTINODE_INSUFFICIENT_NODES");
    expect((await outcome(observeTxAcrossNodes(nodes, set, H("tx")))).error?.code).toBe("MULTINODE_INSUFFICIENT_NODES");
    const before = calls.length;
    expect((await outcome(observeTxAcrossNodes(nodes, set, "not-a-txid"))).error?.code).toBe("MULTINODE_TXID_INVALID");
    expect(calls.length).toBe(before);
  });
});
