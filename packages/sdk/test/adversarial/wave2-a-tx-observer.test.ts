import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Hardkas } from "../../src/index.js";
import { observeTxOnce, type TxObserverRpc, type TxObserverRpcRecorder } from "../../src/tx-observer.js";
import { calculateContentHash, CURRENT_HASH_VERSION, evidenceDigest, deriveObserverId } from "@hardkas/artifacts";
import { systemRuntimeContext, finalityDepthFor } from "@hardkas/core";

// Wave 2(a) · Q4 · the RPC observer and the SDK surface
//   observeTxOnce records what ONE node answers (mempool → virtual chain → header → finality
//   rule) as ONE sealed observation; `sdk.tx.observe` persists it and `sdk.tx.status`
//   derives the state from the workspace evidence. Confirmations are blue-score depth.

const TX = "1".repeat(64);
const H = (n: number) => n.toString(16).padStart(64, "0");

/** A scripted node: chain blocks in order, each with a blue/daa score and accepted tx ids. */
class FakeNode {
  sinkBlueScore = 1000n;
  virtualDaaScore = 5000n;
  pruningPointHash = H(1);
  mempool = new Map<string, { isOrphan: boolean; fee: string }>();
  chain: Array<{ hash: string; blueScore: bigint; daaScore: bigint; accepted: string[] }> = [{ hash: H(1), blueScore: 1n, daaScore: 1n, accepted: [] }];
  removed: string[] = [];
  get sink() {
    return this.chain[this.chain.length - 1]!.hash;
  }
  advance(blue: bigint, daa: bigint = blue) {
    this.sinkBlueScore += blue;
    this.virtualDaaScore += daa;
  }
  addChainBlock(hash: string, accepted: string[] = []) {
    this.chain.push({ hash, blueScore: this.sinkBlueScore, daaScore: this.virtualDaaScore, accepted });
  }
  reorgOut(hash: string) {
    this.chain = this.chain.filter((b) => b.hash !== hash);
    this.removed.push(hash);
  }
  recorder(): TxObserverRpcRecorder {
    const raw = this.rawRpc();
    const evidence: TxObserverRpcRecorder["evidence"] = [];
    const record = <T>(method: string, params: unknown, response: T): T => {
      evidence.push({ method, params, responseDigest: evidenceDigest(response) });
      return response;
    };
    const rpc: TxObserverRpc = {
      getBlockDagInfo: async () => record("getBlockDagInfo", {}, await raw.getBlockDagInfo()),
      getSinkBlueScore: async () => record("getSinkBlueScore", {}, (await raw.getSinkBlueScore()).toString()) as unknown as bigint,
      getMempoolEntry: async (txId) => record("getMempoolEntry", { txId }, await raw.getMempoolEntry(txId)),
      getVirtualChainFromBlock: async (startHash) => record("getVirtualChainFromBlock", { startHash }, await raw.getVirtualChainFromBlock(startHash)),
      getBlockHeader: async (hash) => record("getBlock", { hash }, await raw.getBlockHeader(hash))
    };
    // getSinkBlueScore must return a bigint to the observer; the digest above took its string form.
    rpc.getSinkBlueScore = async () => {
      const v = await raw.getSinkBlueScore();
      evidence.push({ method: "getSinkBlueScore", params: {}, responseDigest: evidenceDigest(v.toString()) });
      return v;
    };
    return { rpc, evidence };
  }

  rawRpc(): TxObserverRpc {
    return {
      getBlockDagInfo: async () => ({
        networkId: "simnet",
        virtualDaaScore: this.virtualDaaScore,
        sink: this.sink,
        pruningPointHash: this.pruningPointHash,
        serverVersion: "2.0.1"
      }),
      getSinkBlueScore: async () => this.sinkBlueScore,
      getMempoolEntry: async (txId) => {
        const e = this.mempool.get(txId);
        return e ? { isOrphan: e.isOrphan, feeSompi: e.fee } : null;
      },
      getVirtualChainFromBlock: async (startHash) => {
        const idx = this.chain.findIndex((b) => b.hash === startHash);
        if (idx < 0) {
          if (this.removed.includes(startHash)) {
            return {
              removedChainBlockHashes: [startHash],
              addedChainBlockHashes: this.chain.map((b) => b.hash),
              acceptedTransactionIds: this.chain.map((b) => ({ acceptingBlockHash: b.hash, acceptedTransactionIds: b.accepted }))
            };
          }
          const err: any = new Error(`block ${startHash} not found`);
          err.code = "RPC_NOT_FOUND";
          throw err;
        }
        const added = this.chain.slice(idx + 1);
        return {
          removedChainBlockHashes: [],
          addedChainBlockHashes: added.map((b) => b.hash),
          acceptedTransactionIds: added.map((b) => ({ acceptingBlockHash: b.hash, acceptedTransactionIds: b.accepted }))
        };
      },
      getBlockHeader: async (hash) => {
        const b = this.chain.find((x) => x.hash === hash);
        return b ? { blueScore: b.blueScore, daaScore: b.daaScore } : null;
      }
    };
  }
}

const OBS = deriveObserverId({ kind: "rpc", target: "simnet", locator: "ws://scripted-node.test:18210" });
const base = { txId: TX, observerId: OBS, networkId: "simnet" as any, mode: "localnet" as any, maxBatches: 5 };

describe("Wave 2(a) · observeTxOnce records what the node answers", () => {
  it("mempool → chain acceptance (blue-score depth) → reorg → finality, one sealed observation per look", async () => {
    const node = new FakeNode();
    node.mempool.set(TX, { isOrphan: false, fee: "1500" });
    const inMempool = await observeTxOnce(node.recorder(), { ...base, since: H(1) }, systemRuntimeContext);
    expect(inMempool.finding).toEqual({ type: "mempool_entry", isOrphan: false, feeSompi: "1500" });
    expect(inMempool.observer.observerId).toBe(OBS);
    expect(inMempool.observer.description).toBe("observation obtained through the configured RPC observer");
    expect(inMempool.evidence.map((e) => e.method)).toEqual(["getBlockDagInfo", "getSinkBlueScore", "getMempoolEntry"]);
    expect(inMempool.contentHash).toBe(calculateContentHash(inMempool, CURRENT_HASH_VERSION));

    node.mempool.delete(TX);
    node.advance(10n);
    node.addChainBlock(H(2), [TX]);
    node.advance(3n, 9_000n); // 3 blue, 9,000 DAA: the unit is blue score
    const acceptedObs = await observeTxOnce(node.recorder(), { ...base, since: H(1) }, systemRuntimeContext);
    expect(acceptedObs.finding).toMatchObject({ type: "chain_accepted", acceptingBlockHash: H(2), confirmationsBlue: "3", confirmationsDaa: "9000" });
    expect(acceptedObs.point.sinkBlueScore).toBe(node.sinkBlueScore.toString());

    node.reorgOut(H(2));
    node.advance(1n);
    const removedObs = await observeTxOnce(node.recorder(), { ...base, since: H(1), previousAcceptingBlockHash: H(2) }, systemRuntimeContext);
    expect(removedObs.finding).toEqual({ type: "chain_removed", acceptingBlockHash: H(2) });

    node.addChainBlock(H(3), [TX]);
    node.advance(BigInt(finalityDepthFor("simnet")!));
    const finalObs = await observeTxOnce(node.recorder(), { ...base, since: H(1) }, systemRuntimeContext);
    expect(finalObs.finding).toMatchObject({ type: "finality_reached", acceptingBlockHash: H(3), finalityDepth: String(finalityDepthFor("simnet")) });
  });

  it("a cursor the node cannot serve is pruned_unobservable; an unseen tx is not_found with the scanned window", async () => {
    const node = new FakeNode();
    const pruned = await observeTxOnce(node.recorder(), { ...base, since: H(99) }, systemRuntimeContext);
    expect(pruned.finding.type).toBe("pruned_unobservable");
    node.advance(1n);
    node.addChainBlock(H(2), ["2".repeat(64)]);
    const notFound = await observeTxOnce(node.recorder(), { ...base, since: H(1) }, systemRuntimeContext);
    expect(notFound.finding).toEqual({ type: "not_found", scannedFrom: H(1), scannedTo: H(2), scannedChainBlocks: 1 });
  });
});

describe("Wave 2(a) · SDK: submission cursor, persisted observations, derived status, blue-score waits", () => {
  let ws: string;
  let sdk: Hardkas;
  let node: FakeNode;

  beforeEach(async () => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-w2a-sdk-"));
    sdk = await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simulated" });
    node = new FakeNode();
    // The client the SDK holds is scripted; nothing leaves the process.
    vi.spyOn(sdk.rpc, "getBlockDagInfo").mockImplementation(async () => ({ networkId: "simnet", virtualDaaScore: node.virtualDaaScore, tipHashes: [node.sink], virtualParentHashes: [node.sink], sink: node.sink }) as any);
    vi.spyOn(sdk.rpc, "getSinkBlueScore").mockImplementation(async () => ({ blueScore: node.sinkBlueScore.toString() }));
    vi.spyOn(sdk.rpc, "getServerInfo").mockImplementation(async () => ({ networkId: "simnet", serverVersion: "2.0.1" }) as any);
    vi.spyOn(sdk.rpc, "call").mockImplementation(async (method: string, params: any) => {
      const rpc = node.rawRpc();
      switch (method) {
        case "getBlockDagInfo":
          return { networkName: "simnet", virtualDaaScore: node.virtualDaaScore.toString(), sink: node.sink, pruningPointHash: node.pruningPointHash };
        case "getMempoolEntry": {
          const e = await rpc.getMempoolEntry(params.transactionId);
          if (!e) throw Object.assign(new Error("transaction not found"), { code: "RPC_NOT_FOUND" });
          return { mempoolEntry: { isOrphan: e.isOrphan, fee: e.feeSompi } };
        }
        case "getVirtualChainFromBlock":
          return rpc.getVirtualChainFromBlock(params.startHash);
        case "getBlock": {
          const h = await rpc.getBlockHeader(params.hash);
          if (!h) throw Object.assign(new Error("block not found"), { code: "RPC_NOT_FOUND" });
          return { block: { header: { blueScore: h.blueScore.toString(), daaScore: h.daaScore.toString() } } };
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

  async function realSend(): Promise<{ txId: string; submissionId: string }> {
    const plan = await sdk.tx.plan({ from: "alice", to: "bob", amount: "10" });
    await sdk.artifacts.write(plan);
    const signed: any = await sdk.tx.sign(plan, "alice");
    // The real-broadcast branch: a non-synthetic re-issue (a synthetic authorization is never broadcast).
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
    return { txId: sent.txId, submissionId: sent.submission.contentHash };
  }

  it("the submission carries the observer's cursor (submitPoint); status derives SUBMITTED until something is observed", async () => {
    const { txId, submissionId } = await realSend();
    const submission: any = await sdk.artifacts.read({ artifact: submissionId });
    expect(submission.submitPoint).toEqual({ virtualDaaScore: node.virtualDaaScore.toString(), sinkHash: node.sink, sinkBlueScore: node.sinkBlueScore.toString() });
    const derived = await sdk.tx.status(txId);
    expect(derived.status).toBe("SUBMITTED");
    expect(derived.evidence.submissionArtifactId).toBe(submissionId);
    expect(derived.evidence.observationArtifactIds).toEqual([]);
  });

  it("observe persists FULL observations under observations/ and status follows the evidence: MEMPOOL_ACCEPTED → ACCEPTED → CONFIRMED(policy)", async () => {
    const { txId, submissionId } = await realSend();
    node.mempool.set(txId, { isOrphan: false, fee: "1200" });
    const first = await sdk.tx.observe(txId);
    expect(first.observation.subject).toEqual({ txId, submissionArtifactId: submissionId });
    // The SDK's observer identity is stable across looks and authenticated in every observation.
    expect(first.observation.observer.observerId).toBe(sdk.tx.observerId());
    expect(sdk.tx.observerId()).toMatch(/^obs_[0-9a-f]{64}$/);
    expect(first.observation.point.sinkHash).toBe(node.sink);
    expect(first.observationPath!.replace(/\\/g, "/")).toMatch(/\.hardkas\/artifacts\/observations\//);
    expect(first.derived.status, JSON.stringify(first.derived.evidence.ignored)).toBe("MEMPOOL_ACCEPTED");
    expect((await sdk.tx.status(txId)).status).toBe("MEMPOOL_ACCEPTED");

    node.mempool.delete(txId);
    node.advance(5n);
    node.addChainBlock(H(2), [txId]);
    node.advance(2n, 500n);
    const second = await sdk.tx.observe(txId);
    expect(second.observation.finding).toMatchObject({ type: "chain_accepted", acceptingBlockHash: H(2), confirmationsBlue: "2", confirmationsDaa: "500" });
    expect(second.derived.status).toBe("ACCEPTED");

    node.advance(98n);
    const third = await sdk.tx.observe(txId);
    expect(third.derived.status).toBe("CONFIRMED");
    expect(third.derived.confirmations).toEqual({ blue: "100", daa: "598", unit: "blue-score" });
    const status = await sdk.tx.status(txId);
    expect(status.status).toBe("CONFIRMED");
    // The deciding evidence is the observer's whole history (3 looks), not one cherry-picked observation.
    expect(status.evidence.observationArtifactIds).toHaveLength(3);
    expect(status.evidence.observationArtifactIds).toContain(third.observation.contentHash);
    // The observer is described, never identified as a node (D-Q1.a interim); the network is the submission's.
    expect(status.observers).toEqual([{ observerId: sdk.tx.observerId(), kind: "rpc", networkId: "simulated", serverVersion: "2.0.1", description: "observation obtained through the configured RPC observer" }]);
    expect(status.perObserver.map((h) => [h.observerId, h.status])).toEqual([[sdk.tx.observerId(), "CONFIRMED"]]);

    const verified = await sdk.artifacts.verify(third.observation, { strict: true, throwOnInvalid: false });
    expect(verified.valid).toBe(true);
    expect(verified.authScope).toBe("FULL");
  });

  it("waitForConfirmations counts blue-score depth (a large DAA delta does not confirm) and waitForAccepted returns on acceptance", async () => {
    const { txId } = await realSend();
    node.advance(1n);
    node.addChainBlock(H(2), [txId]);
    node.advance(1n, 10_000n); // DAA races ahead; blue depth is 1
    const acceptedWait: any = await sdk.tx.waitForAccepted({ txId, timeoutMs: 2000, pollIntervalMs: 10 });
    expect(acceptedWait.status).toBe("accepted");
    expect(acceptedWait.acceptingBlockHash).toBe(H(2));
    expect(acceptedWait.confirmations).toBe(1);

    let ticks = 0;
    const original = sdk.rpc.getSinkBlueScore as any;
    (sdk.rpc.getSinkBlueScore as any).mockImplementation(async () => {
      ticks += 1;
      if (ticks > 2) node.advance(2n, 0n); // blue depth grows 2 per poll after two polls
      return { blueScore: node.sinkBlueScore.toString() };
    });
    const confirmedWait: any = await sdk.tx.waitForConfirmations({ txId, minConfirmations: 5, timeoutMs: 5000, pollIntervalMs: 5 });
    expect(confirmedWait.status).toBe("confirmed");
    expect(confirmedWait.confirmationUnit).toBe("blue-score");
    expect(confirmedWait.confirmations).toBeGreaterThanOrEqual(5);
    expect(confirmedWait.derived.policy.origin).toBe("user");
    void original;
  });

  it("a reorg is derived from the evidence (REORGED), then a new acceptance is ACCEPTED again", async () => {
    const { txId } = await realSend();
    node.advance(1n);
    node.addChainBlock(H(2), [txId]);
    node.advance(3n);
    expect((await sdk.tx.observe(txId)).derived.status).toBe("ACCEPTED");
    node.reorgOut(H(2));
    node.advance(1n);
    const afterReorg = await sdk.tx.observe(txId);
    expect(afterReorg.observation.finding).toEqual({ type: "chain_removed", acceptingBlockHash: H(2) });
    expect(afterReorg.derived.status).toBe("REORGED");
    node.addChainBlock(H(3), [txId]);
    node.advance(2n);
    const again = await sdk.tx.observe(txId, { since: H(1) });
    expect(again.derived.status).toBe("ACCEPTED");
    expect(again.derived.acceptingBlockHash).toBe(H(3));
  });

  it("a planted LEGACY (v4) observation never decides; the simulator's txId derives SYNTHETIC_EXECUTED and cannot be observed", async () => {
    const { txId } = await realSend();
    node.advance(1n);
    node.addChainBlock(H(2), [txId]);
    node.advance(500n);
    const real = await sdk.tx.observe(txId, { persist: false });
    const legacy: any = structuredClone(real.observation);
    legacy.hashVersion = 4;
    delete legacy.contentHash;
    legacy.contentHash = calculateContentHash(legacy, 4);
    fs.mkdirSync(path.join(ws, ".hardkas", "artifacts", "observations"), { recursive: true });
    fs.writeFileSync(path.join(ws, ".hardkas", "artifacts", "observations", "legacy.json"), JSON.stringify(legacy));
    const derived = await sdk.tx.status(txId);
    expect(derived.status).toBe("SUBMITTED");
    expect(derived.evidence.observationArtifactIds).toEqual([]);

    const plan = await sdk.tx.plan({ from: "alice", to: "bob", amount: "1" });
    await sdk.artifacts.write(plan);
    const signed = await sdk.tx.sign(plan, "alice");
    const sent: any = await sdk.tx.send(signed);
    const synthetic = await sdk.tx.status(sent.receipt.txId);
    expect(synthetic.status).toBe("SYNTHETIC_EXECUTED");
    expect(synthetic.isFinal).toBe(false);
    await expect(sdk.tx.observe(sent.receipt.txId)).rejects.toMatchObject({ code: "OBSERVATION_SYNTHETIC_TXID" });
  });
});
