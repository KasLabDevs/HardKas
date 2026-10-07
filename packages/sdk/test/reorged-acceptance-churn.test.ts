import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Hardkas } from "../src/index.js";
import { observeTxOnce, type TxObserverRpcRecorder } from "../src/tx-observer.js";
import { calculateContentHash, CURRENT_HASH_VERSION, deriveObserverId, deriveTxStatus, evidenceDigest } from "@hardkas/artifacts";
import { finalityDepthFor, systemRuntimeContext } from "@hardkas/core";

// False REORGED, reproduced live on the canonical localnet (2026-10-02, record run 2, tx 7): with a
// fast miner the chain block that accepts a transaction is often replaced by a sibling that accepts it
// too ("accepting-block churn"). The look that saw the known accepting block A leave the selected chain
// sealed `chain_removed(A)` although the same node answer showed a new chain block B accepting the
// transaction (M1), and the next looks scanned from a cursor already past B (M2): REORGED until the wait
// timed out while the node kept the transaction accepted. REORGED may only be derived when, after A left
// the chain, no block of the observer's selected chain accepts the transaction.

const H = (n: number) => n.toString(16).padStart(64, "0");
const A = H(0xa);
const B = H(0xb);
const C = H(0xc);
const D = H(0xd);
const E = H(0xe);

interface Block {
  hash: string;
  blueScore: bigint;
  daaScore: bigint;
  accepted: string[];
}

/** A scripted node: a selected chain whose tail can be replaced (a reorg), with bounded virtual-chain answers. */
class ChurnNode {
  sinkBlueScore = 1000n;
  virtualDaaScore = 5000n;
  pruningPointHash = H(1);
  mempool = new Set<string>();
  chain: Block[] = [{ hash: H(1), blueScore: 1n, daaScore: 1n, accepted: [] }];
  known = new Map<string, Block>([[H(1), this.chain[0]!]]);
  /** For each block that left the selected chain: the chain block it forked from. */
  forkedFrom = new Map<string, string>();
  /** Chain blocks per getVirtualChainFromBlock answer (the node bounds its answers). */
  batch = Number.POSITIVE_INFINITY;

  get sink() {
    return this.chain[this.chain.length - 1]!.hash;
  }
  advance(blue: bigint) {
    this.sinkBlueScore += blue;
    this.virtualDaaScore += blue;
  }
  add(hash: string, accepted: string[] = []) {
    this.advance(1n);
    const b = { hash, blueScore: this.sinkBlueScore, daaScore: this.virtualDaaScore, accepted };
    this.chain.push(b);
    this.known.set(hash, b);
  }
  /** `hash` and every chain block after it leave the selected chain. */
  reorgFrom(hash: string) {
    const i = this.chain.findIndex((b) => b.hash === hash);
    const ancestor = this.chain[i - 1]!.hash;
    for (const b of this.chain.slice(i)) this.forkedFrom.set(b.hash, ancestor);
    this.chain = this.chain.slice(0, i);
  }
  /** Like the node: from a block off the selected chain, the answer names it removed and continues from the common ancestor. */
  virtualChainFrom(startHash: string) {
    let start = startHash;
    const removed: string[] = [];
    while (this.chain.findIndex((b) => b.hash === start) < 0) {
      const up = this.forkedFrom.get(start);
      if (!up) throw Object.assign(new Error(`block ${startHash} not found`), { code: "RPC_NOT_FOUND" });
      removed.push(start);
      start = up;
    }
    const from = this.chain.findIndex((b) => b.hash === start);
    const page = this.chain.slice(from + 1).slice(0, this.batch);
    return {
      removedChainBlockHashes: removed,
      addedChainBlockHashes: page.map((b) => b.hash),
      acceptedTransactionIds: page.map((b) => ({ acceptingBlockHash: b.hash, acceptedTransactionIds: b.accepted }))
    };
  }
  /** The same node as the observer's five reads (what `rpcObserverFor` adapts a client to), with evidence. */
  recorder(): TxObserverRpcRecorder {
    const evidence: TxObserverRpcRecorder["evidence"] = [];
    const record = <T>(method: string, params: unknown, response: T, digested: unknown = response): T => {
      evidence.push({ method, params, responseDigest: evidenceDigest(digested) });
      return response;
    };
    return {
      evidence,
      rpc: {
        getBlockDagInfo: async () =>
          record("getBlockDagInfo", {}, { networkId: "simnet", virtualDaaScore: this.virtualDaaScore, sink: this.sink, pruningPointHash: this.pruningPointHash, serverVersion: "2.1.0" }),
        getSinkBlueScore: async () => record("getSinkBlueScore", {}, this.sinkBlueScore, this.sinkBlueScore.toString()),
        getMempoolEntry: async (txId) => record("getMempoolEntry", { txId }, this.mempool.has(txId) ? { isOrphan: false, feeSompi: "1000" } : null),
        getVirtualChainFromBlock: async (startHash) => record("getVirtualChainFromBlock", { startHash }, this.virtualChainFrom(startHash)),
        getBlockHeader: async (hash) => {
          const b = this.known.get(hash);
          return record("getBlock", { hash }, b ? { blueScore: b.blueScore, daaScore: b.daaScore } : null);
        }
      }
    };
  }
}

describe("False REORGED · accepting-block churn (live 2026-10-02 record run 2, tx 7)", () => {
  let ws: string;
  let sdk: Hardkas;
  let node: ChurnNode;

  beforeEach(async () => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-churn-sdk-"));
    sdk = await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simulated" });
    node = new ChurnNode();
    // The client the SDK holds is scripted; nothing leaves the process.
    vi.spyOn(sdk.rpc, "getBlockDagInfo").mockImplementation(async () => ({ networkId: "simnet", virtualDaaScore: node.virtualDaaScore, tipHashes: [node.sink], virtualParentHashes: [node.sink], sink: node.sink }) as any);
    vi.spyOn(sdk.rpc, "getSinkBlueScore").mockImplementation(async () => ({ blueScore: node.sinkBlueScore.toString() }));
    vi.spyOn(sdk.rpc, "getServerInfo").mockImplementation(async () => ({ networkId: "simnet", serverVersion: "2.1.0" }) as any);
    vi.spyOn(sdk.rpc, "call").mockImplementation(async (method: string, params: any) => {
      switch (method) {
        case "getBlockDagInfo":
          return { networkName: "simnet", virtualDaaScore: node.virtualDaaScore.toString(), sink: node.sink, pruningPointHash: node.pruningPointHash };
        case "getMempoolEntry":
          if (!node.mempool.has(params.transactionId)) throw Object.assign(new Error("transaction not found"), { code: "RPC_NOT_FOUND" });
          return { mempoolEntry: { isOrphan: false, fee: "1000" } };
        case "getVirtualChainFromBlock":
          return node.virtualChainFrom(params.startHash);
        case "getBlock": {
          const b = node.known.get(params.hash);
          if (!b) throw Object.assign(new Error("block not found"), { code: "RPC_NOT_FOUND" });
          return { block: { header: { blueScore: b.blueScore.toString(), daaScore: b.daaScore.toString() } } };
        }
        default:
          throw new Error(`unscripted rpc ${method}`);
      }
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(ws, { recursive: true, force: true });
  });

  /** A real-broadcast submission recorded in the workspace (the cursor starts at its submit point). */
  async function realSend(): Promise<string> {
    const TX = "1".repeat(64);
    const plan = await sdk.tx.plan({ from: "alice", to: "bob", amount: "10" });
    await sdk.artifacts.write(plan);
    const signed: any = await sdk.tx.sign(plan, "alice");
    const s: any = structuredClone(signed);
    delete s.authorization;
    s.signedTransaction = { format: "hex", payload: "deadbeef" };
    s.txId = TX;
    delete s.contentHash;
    s.lineage = { ...s.lineage, artifactId: "" };
    s.contentHash = calculateContentHash(s, CURRENT_HASH_VERSION);
    s.lineage.artifactId = s.contentHash;
    s.signedId = `signed-${s.contentHash.slice(0, 16)}`;
    await sdk.artifacts.write(s);
    vi.spyOn(sdk.rpc, "submitTransaction").mockResolvedValue({ transactionId: TX } as any);
    const sent: any = await sdk.tx.send(s, "http://127.0.0.1:16110");
    expect(sent.submitted).toBe(true);
    return sent.txId;
  }

  it("R1 · the answer that removes the accepting block A also shows B accepting the tx: the state follows B, never REORGED", async () => {
    const txId = await realSend();
    node.add(H(2));
    node.add(A, [txId]);
    node.advance(3n);
    const first = await sdk.tx.observe(txId);
    expect(first.derived.status).toBe("ACCEPTED");
    expect(first.derived.acceptingBlockHash).toBe(A);

    // A sibling B that also merges the tx overtakes A: one reorg, one answer.
    node.reorgFrom(A);
    node.add(B, [txId]);
    node.advance(2n);
    const second = await sdk.tx.observe(txId);
    expect(second.derived.status).toBe("ACCEPTED");
    expect(second.derived.acceptingBlockHash).toBe(B);
    expect(second.observation.finding).toMatchObject({ type: "chain_accepted", acceptingBlockHash: B, removedAcceptingBlockHash: A });

    node.advance(100n);
    const third = await sdk.tx.observe(txId);
    expect(third.derived.status).toBe("CONFIRMED");
    expect(third.derived.acceptingBlockHash).toBe(B);
    expect([first, second, third].map((r) => r.derived.status)).not.toContain("REORGED");
    expect((await sdk.tx.status(txId)).status).toBe("CONFIRMED");
  });

  it("R2 · after A leaves, the next looks scan from A: a re-accepting block the removal look did not reach is still found", async () => {
    const txId = await realSend();
    node.add(A, [txId]);
    node.advance(3n);
    expect((await sdk.tx.observe(txId, { maxBatches: 1 })).derived.acceptingBlockHash).toBe(A);

    // A leaves; the new chain is X1, B (accepts the tx), X2, X3. The node answers one chain block at a
    // time and each look reads one answer, so the removal look cannot reach B (an artificial bound;
    // by default a look reads 20 answers of thousands of chain blocks).
    node.reorgFrom(A);
    node.add(H(0x101));
    node.add(B, [txId]);
    node.add(H(0x102));
    node.add(H(0x103));
    node.batch = 1;
    const looks = [];
    for (let i = 0; i < 5; i++) {
      looks.push(await sdk.tx.observe(txId, { maxBatches: 1 }));
      node.advance(1n); // each look at its own point: the history order never rests on wall-clock ties
    }
    const last = looks[looks.length - 1]!;
    expect(looks.map((l) => l.derived.status), JSON.stringify(looks.map((l) => l.observation.finding))).toContain("ACCEPTED");
    expect(last.derived.status).toBe("ACCEPTED");
    expect(last.derived.acceptingBlockHash).toBe(B);
  });

  it("control · A leaves and no chain block accepts the tx: REORGED is legitimate; back in the mempool → MEMPOOL_ACCEPTED; re-mined → ACCEPTED", async () => {
    const txId = await realSend();
    node.add(A, [txId]);
    node.advance(3n);
    expect((await sdk.tx.observe(txId)).derived.status).toBe("ACCEPTED");

    node.reorgFrom(A);
    node.add(H(0x201));
    node.add(H(0x202));
    node.mempool.add(txId);
    const removal = await sdk.tx.observe(txId);
    expect(removal.observation.finding).toEqual({ type: "chain_removed", acceptingBlockHash: A });
    expect(removal.derived.status).toBe("REORGED");

    expect((await sdk.tx.observe(txId)).derived.status).toBe("MEMPOOL_ACCEPTED");

    node.mempool.delete(txId);
    node.add(C, [txId]);
    node.advance(2n);
    const again = await sdk.tx.observe(txId);
    expect(again.derived.status).toBe("ACCEPTED");
    expect(again.derived.acceptingBlockHash).toBe(C);
  });

  it("control · mempool → accepted → confirmed, without churn", async () => {
    const txId = await realSend();
    node.mempool.add(txId);
    expect((await sdk.tx.observe(txId)).derived.status).toBe("MEMPOOL_ACCEPTED");
    node.mempool.delete(txId);
    node.add(A, [txId]);
    node.advance(3n);
    expect((await sdk.tx.observe(txId)).derived.status).toBe("ACCEPTED");
    node.advance(100n);
    const done = await sdk.tx.observe(txId);
    expect(done.derived.status).toBe("CONFIRMED");
    expect(done.derived.acceptingBlockHash).toBe(A);
  });

  it("control · churn A → B → C across looks, then two replacements between two looks: the state follows the tx, never REORGED", async () => {
    const txId = await realSend();
    const statuses: string[] = [];
    const look = async () => {
      const r = await sdk.tx.observe(txId);
      statuses.push(r.derived.status);
      return r;
    };
    node.add(A, [txId]);
    node.advance(2n);
    expect((await look()).derived.acceptingBlockHash).toBe(A);
    node.reorgFrom(A);
    node.add(B, [txId]);
    expect((await look()).derived.acceptingBlockHash).toBe(B);
    node.reorgFrom(B);
    node.add(C, [txId]);
    expect((await look()).derived.acceptingBlockHash).toBe(C);
    // Two replacements before the next look: C → D → E.
    node.reorgFrom(C);
    node.add(D, [txId]);
    node.reorgFrom(D);
    node.add(E, [txId]);
    const afterTwo = await look();
    expect(afterTwo.derived.acceptingBlockHash).toBe(E);
    expect(afterTwo.observation.finding).toMatchObject({ type: "chain_accepted", acceptingBlockHash: E, removedAcceptingBlockHash: C });
    node.advance(100n);
    expect((await look()).derived.status).toBe("CONFIRMED");
    expect(statuses).not.toContain("REORGED");
  });
});

// The late look: nobody looked between the replacement of A and B reaching finality (a `tx status`
// run much later). The removal branch then finds B already final. Before the fix that same branch
// sealed `chain_removed(A)` and the history derived REORGED for a final transaction. The network must
// be one whose finality depth is known (simnet), so this drives the observer directly with the reads
// `sdk.tx.observe` makes, passing the accepting block the history established (A) as it does.
describe("False REORGED · the late look: B is already final when the tx is looked at again", () => {
  const TXL = "2".repeat(64);
  const OBS = deriveObserverId({ kind: "rpc", target: "simnet", locator: "ws://scripted-node.test:18210" });
  const look = { txId: TXL, observerId: OBS, networkId: "simnet" as any, mode: "localnet" as any };

  function simnetSubmission(submitSink: string, submitBlue: bigint): any {
    const signed = "b".repeat(64);
    const s: any = {
      schema: "hardkas.txSubmission.v1",
      hardkasVersion: "0.12.0-rc.27",
      version: "1.0.0-alpha",
      hashVersion: CURRENT_HASH_VERSION,
      networkId: "simnet",
      mode: "localnet",
      createdAt: "2026-10-02T00:00:00.000Z",
      signedArtifactId: signed,
      txId: TXL,
      submitResult: { accepted: true, transactionId: TXL },
      submitPoint: { virtualDaaScore: submitBlue.toString(), sinkHash: submitSink, sinkBlueScore: submitBlue.toString() },
      workflowId: "wf_0000000000000000",
      assumptionLevel: "local-rpc",
      lineage: { artifactId: "", parentArtifactId: signed, lineageId: signed, rootArtifactId: signed, sequence: 3 }
    };
    s.contentHash = calculateContentHash(s, CURRENT_HASH_VERSION);
    s.lineage.artifactId = s.contentHash;
    return s;
  }

  it("A replaced by B and looked at again only once B is final: FINALIZED by B, never REORGED", async () => {
    const node = new ChurnNode();
    const submission = simnetSubmission(node.sink, node.sinkBlueScore);
    node.add(A, [TXL]);
    node.advance(3n);
    const first = await observeTxOnce(node.recorder(), { ...look, since: submission.submitPoint.sinkHash }, systemRuntimeContext);
    expect(first.finding).toMatchObject({ type: "chain_accepted", acceptingBlockHash: A });
    expect(deriveTxStatus({ txId: TXL, submission, observations: [first] }).status).toBe("ACCEPTED");

    // A sibling B that also merges the tx overtakes A; the next look comes after B is final.
    node.reorgFrom(A);
    node.add(B, [TXL]);
    node.advance(BigInt(finalityDepthFor("simnet")!));
    const late = await observeTxOnce(node.recorder(), { ...look, since: first.point.sinkHash, previousAcceptingBlockHash: A }, systemRuntimeContext);
    expect(late.finding).toMatchObject({ type: "finality_reached", acceptingBlockHash: B, finalityDepth: String(finalityDepthFor("simnet")) });

    const derived = deriveTxStatus({ txId: TXL, submission, observations: [first, late] });
    expect(derived.status, JSON.stringify(derived.reasons)).toBe("FINALIZED");
    expect(derived.acceptingBlockHash).toBe(B);
  });
});
