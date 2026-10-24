import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Hardkas } from "../src/index.js";
import { withClientUrl } from "./helpers/rpc-instance.js";
import { officialSignedPayload, nodeNamesReceived } from "./helpers/official-signed-payload.js";
import { RpcRequestNotSentError } from "@hardkas/kaspa-rpc";
import {
  calculateContentHash,
  CURRENT_HASH_VERSION,
  expectedScriptPublicKeyHex,
  createLineageTransition,
  submitOutcomeOf,
  HardkasSchemas,
  HARDKAS_VERSION,
  ARTIFACT_VERSION
} from "@hardkas/artifacts";

vi.setConfig({ testTimeout: 60_000 });

// -----------------------------------------------------------------------------
// TX-SEND-IDEMPOTENT-1 (2026-10-21). Found by the simnet regression of 2026-10-21 (scenario S7) on a real rusty-kaspad
// 2.1.0: re-sending the signed artifact of a CONFIRMED payment broadcast it again; the node answered "transaction … is
// an orphan where orphan is disallowed" (its inputs are spent — by that very transaction), HardKAS recorded a SECOND
// submission for the txId (rejected), and from then on `tx status` / `tx receipt` answered RECEIPT_AMBIGUOUS_CONFLICT:
// the evidence model holds one submission per txId (IC-5′.5).
// Fixed in sdk.tx.send, without a new source of truth: under a workspace lock per txId, a transaction this workspace
// already recorded a submission for is never broadcast again. One observation decides: the node holds it (mempool or
// chain) → the recorded submission is returned (`alreadySubmitted`), nothing sent, nothing new recorded but that
// observation; it does not → TX_ALREADY_SUBMITTED, nothing sent (broadcasting it again would need a second submission
// for the txId, which the evidence model does not have).
// The stand-in node answers like rusty-kaspa 2.1.0: it accepts a transaction once (mempool), answers "already in the
// mempool" while it holds it, and "orphan where orphan is disallowed" once its inputs are spent (accepted by a block).
// Same hermetic setup as expected-txid-1.sdk: a real simnet plan (upstream Generator over scripted UTXOs), a signed
// artifact re-issued from it with an RPC-transaction payload and its official txid, every client call a stand-in.
// -----------------------------------------------------------------------------

const LOOPBACK = "http://127.0.0.1:16110";
const FROM = "kaspasim:qpumuen7l8wthtz45p3ftn58pvrs9xlumvkuu2xet8egzkcklqtes65ue9mw6";
const TO = "kaspasim:qrrqglu5g8kh6mfsg4qxa9wq0nv9cauwfwxw70984wkqnw2uwz0w27rvnw0sc";
const script = (address: string) => expectedScriptPublicKeyHex(address)!;
const UTXOS = [
  { outpoint: { transactionId: "a".repeat(64), index: 0 }, address: FROM, amountSompi: 1_000_000_000n, scriptPublicKey: script(FROM), blockDaaScore: 1000n, isCoinbase: false },
  { outpoint: { transactionId: "b".repeat(64), index: 1 }, address: FROM, amountSompi: 500_000_000n, scriptPublicKey: script(FROM), blockDaaScore: 1200n, isCoinbase: false }
];
const H = (n: number) => n.toString(16).padStart(64, "0");

/** The RPC transaction the plan authorizes, as a signer writes it, with its official id. */
function officialFromPlan(plan: any): { payload: string; txId: string } {
  return officialSignedPayload({
    inputs: plan.inputs.map((i: any) => ({ previousOutpoint: { transactionId: i.outpoint.transactionId, index: i.outpoint.index } })),
    outputs: [
      ...plan.outputs.map((o: any) => ({ amount: o.amountSompi, scriptPublicKey: { version: 0, scriptPublicKey: script(o.address) } })),
      ...(plan.change ? [{ amount: plan.change.amountSompi, scriptPublicKey: { version: 0, scriptPublicKey: script(plan.change.address) } }] : [])
    ]
  });
}

/** A signed artifact re-issued from `plan` (sealed, verifiable) carrying `payload` and declaring `txId`. */
function signedFromPlan(plan: any, payload: string, txId: string): any {
  const s: any = {
    schema: HardkasSchemas.SignedTx,
    schemaVersion: HardkasSchemas.ArtifactV1,
    hardkasVersion: HARDKAS_VERSION,
    version: ARTIFACT_VERSION,
    hashVersion: CURRENT_HASH_VERSION,
    createdAt: "2026-10-21T00:00:00.000Z",
    status: "signed",
    sourcePlanId: plan.planId,
    networkId: plan.networkId,
    mode: plan.mode,
    execution: plan.execution,
    from: { address: plan.from.address },
    to: { address: plan.to.address },
    amountSompi: plan.amountSompi,
    txId,
    signedTransaction: { format: "hex", payload },
    lineage: createLineageTransition(plan, HardkasSchemas.SignedTx),
    ...(plan.workflowId ? { workflowId: plan.workflowId } : {}),
    ...(plan.assumptionLevel ? { assumptionLevel: plan.assumptionLevel } : {})
  };
  s.contentHash = calculateContentHash(s, CURRENT_HASH_VERSION);
  s.lineage.artifactId = s.contentHash;
  s.signedId = `signed-${s.contentHash.slice(0, 16)}`;
  return s;
}

/** A stand-in rusty-kaspa node: a virtual chain with accepting blocks, a mempool, and the submit rules that matter here. */
class FakeNode {
  sinkBlueScore = 5000n;
  virtualDaaScore = 1_000_000n;
  chain: Array<{ hash: string; blueScore: bigint; daaScore: bigint; accepted: string[] }> = [{ hash: H(1), blueScore: 5000n, daaScore: 1_000_000n, accepted: [] }];
  mempool = new Set<string>();
  /** Transactions this node refuses as a double spend (another one spent their inputs). */
  doubleSpent = new Set<string>();
  /** The next submitTransaction: the node receives it, but the answer is lost. */
  loseNextAnswer = false;
  /** The next submitTransaction never reaches the node (the client says so). */
  dropNextRequest = false;
  /** The node cannot be reached for reads. */
  readsDown = false;
  submits: string[] = [];
  get sink() {
    return this.chain[this.chain.length - 1]!.hash;
  }
  accepted(txId: string) {
    return this.chain.some((b) => b.accepted.includes(txId));
  }
  /** A chain block accepts the transaction (it leaves the mempool), and the chain grows `depth` blue score past it. */
  mine(txId: string, depth = 120n) {
    this.mempool.delete(txId);
    this.sinkBlueScore += 1n;
    this.virtualDaaScore += 1n;
    this.chain.push({ hash: H(this.chain.length + 1), blueScore: this.sinkBlueScore, daaScore: this.virtualDaaScore, accepted: [txId] });
    this.sinkBlueScore += depth;
    this.virtualDaaScore += depth;
  }
  async submit(transaction: unknown): Promise<{ transactionId: string }> {
    const { transactionId: txId } = await nodeNamesReceived(transaction);
    this.submits.push(txId);
    if (this.dropNextRequest) {
      this.dropNextRequest = false;
      throw new RpcRequestNotSentError("submitTransaction was not sent: the connection was closed before the request was written");
    }
    // rusty-kaspa 2.1.0 mining/errors/src/mempool.rs: RejectDuplicate, RejectDisallowedOrphan, RejectDoubleSpendInMempool
    if (this.mempool.has(txId)) throw new Error(`Rejected transaction ${txId}: transaction ${txId} is already in the mempool`);
    if (this.accepted(txId)) throw new Error(`Rejected transaction ${txId}: transaction ${txId} is an orphan where orphan is disallowed`);
    if (this.doubleSpent.has(txId)) throw new Error(`Rejected transaction ${txId}: output ${"c".repeat(64)}:0 already spent by transaction ${"d".repeat(64)} in the memory pool`);
    this.mempool.add(txId);
    if (this.loseNextAnswer) {
      this.loseNextAnswer = false;
      throw new Error("RPC request timed out after 30000ms (socket hang up)");
    }
    return { transactionId: txId };
  }
  call(method: string, params: any): any {
    if (this.readsDown) throw Object.assign(new Error(`connect ECONNREFUSED 127.0.0.1:1 (${method})`), { code: "RPC_CONNECTION_FAILED" });
    switch (method) {
      case "getBlockDagInfo":
        return { networkName: "simnet", virtualDaaScore: this.virtualDaaScore.toString(), sink: this.sink, pruningPointHash: this.chain[0]!.hash };
      case "getServerInfo":
        return { networkId: "simnet", serverVersion: "2.1.0", isSynced: true, hasUtxoIndex: true };
      case "getSinkBlueScore":
        return { blueScore: this.sinkBlueScore.toString() };
      case "getMempoolEntry": {
        if (!this.mempool.has(params.transactionId)) throw Object.assign(new Error("transaction not found"), { code: "RPC_NOT_FOUND" });
        return { mempoolEntry: { isOrphan: false, fee: "2000" } };
      }
      case "getVirtualChainFromBlock": {
        const idx = this.chain.findIndex((b) => b.hash === params.startHash);
        if (idx < 0) throw Object.assign(new Error(`block ${params.startHash} not found`), { code: "RPC_NOT_FOUND" });
        const added = this.chain.slice(idx + 1);
        return {
          removedChainBlockHashes: [],
          addedChainBlockHashes: added.map((b) => b.hash),
          acceptedTransactionIds: added.map((b) => ({ acceptingBlockHash: b.hash, acceptedTransactionIds: b.accepted }))
        };
      }
      case "getBlock": {
        const b = this.chain.find((x) => x.hash === params.hash);
        if (!b) throw Object.assign(new Error("block not found"), { code: "RPC_NOT_FOUND" });
        return { block: { header: { blueScore: b.blueScore.toString(), daaScore: b.daaScore.toString() } } };
      }
      default:
        throw new Error(`unscripted rpc ${method}`);
    }
  }
}

async function outcome(p: Promise<unknown>) {
  try {
    return { result: (await p) as any, error: undefined as any };
  } catch (error: any) {
    return { result: undefined as any, error };
  }
}

describe("TX-SEND-IDEMPOTENT-1 · sdk.tx.send never broadcasts a transaction this workspace already submitted", () => {
  let ws: string;
  let node: FakeNode;
  let plan: any;
  let official: { payload: string; txId: string };
  let signed: any;

  /** An SDK instance on the workspace, every client call a stand-in answered by `node`. */
  async function openSdk(): Promise<any> {
    const sdk: any = await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simnet" });
    const cfg: any = sdk.config.config;
    cfg.networks = { ...(cfg.networks ?? {}), simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: "ws://127.0.0.1:1" } };
    vi.spyOn(sdk.rpc, "getUtxosByAddress").mockImplementation(async () => UTXOS.map((u) => ({ ...u })) as any);
    vi.spyOn(sdk.rpc, "getMempoolEntriesByAddresses").mockResolvedValue({ entries: [] } as any);
    vi.spyOn(sdk.rpc, "getBlockDagInfo").mockImplementation(async () => ({ networkId: "simnet", virtualDaaScore: node.virtualDaaScore, tipHashes: [node.sink], virtualParentHashes: [node.sink], sink: node.sink }) as any);
    vi.spyOn(sdk.rpc, "getServerInfo").mockResolvedValue({ networkId: "simnet", serverVersion: "2.1.0", isSynced: true } as any);
    vi.spyOn(sdk.rpc, "getSinkBlueScore").mockImplementation(async () => ({ blueScore: node.sinkBlueScore.toString() }) as any);
    vi.spyOn(sdk.rpc, "call").mockImplementation(async (method: string, params: any) => node.call(method, params));
    vi.spyOn(sdk.rpc, "submitTransaction").mockImplementation(async (transaction: any) => node.submit(transaction));
    withClientUrl(sdk, LOOPBACK);
    return sdk;
  }

  const filesIn = (sub: string) => {
    const dir = path.join(ws, ".hardkas", "artifacts", sub);
    return fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  };
  const submissions = () => filesIn("receipts").filter((f) => /txsubmission/i.test(f));
  const observations = () => filesIn("observations");

  beforeEach(async () => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-tsi1-"));
    fs.mkdirSync(path.join(ws, ".hardkas"));
    node = new FakeNode();
    const sdk = await openSdk();
    plan = await sdk.tx.plan({
      from: { name: FROM, kind: "external-wallet", network: "simnet", address: FROM } as any,
      to: { name: TO, kind: "external-wallet", network: "simnet", address: TO } as any,
      amount: "3",
      feeRate: 1000n
    });
    await sdk.artifacts.write(plan);
    official = officialFromPlan(plan);
    signed = signedFromPlan(plan, official.payload, official.txId);
    await sdk.artifacts.write(signed);
    await sdk.close?.();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(ws, { recursive: true, force: true });
  });

  it("T1 · control · the first send broadcasts once and records one submission", async () => {
    const sdk = await openSdk();
    const first = await outcome(sdk.tx.send(signed, LOOPBACK));
    expect(first.error, String(first.error?.message)).toBeUndefined();
    expect(first.result.submitted).toBe(true);
    expect(first.result.alreadySubmitted).toBeUndefined();
    expect(node.submits).toEqual([official.txId]);
    expect(submissions()).toHaveLength(1);
  });

  it("T2 · re-sending a CONFIRMED transaction: no broadcast, the recorded submission is returned with its observed state, and its txId stays unambiguous (it recorded a second, 'orphan' submission → RECEIPT_AMBIGUOUS_CONFLICT)", async () => {
    const sdk = await openSdk();
    const first = await sdk.tx.send(signed, LOOPBACK);
    node.mine(official.txId);
    const again = await outcome(sdk.tx.send(signed, LOOPBACK));
    expect(again.error, String(again.error?.message)).toBeUndefined();
    expect(node.submits).toEqual([official.txId]);
    expect(submissions()).toHaveLength(1);
    expect(again.result).toMatchObject({ alreadySubmitted: true, submitted: false, txId: official.txId, artifactId: first.artifactId, mode: "real" });
    expect(again.result.derived.status).toBe("CONFIRMED");
    expect((await sdk.tx.status(official.txId)).status).toBe("CONFIRMED");
    expect(((await sdk.artifacts.read({ tx: official.txId })) as any).contentHash).toBe(first.artifactId);
  });

  it("T3 · re-sending a transaction the node holds in its mempool (accepted, not yet in a block): no broadcast, MEMPOOL_ACCEPTED", async () => {
    const sdk = await openSdk();
    await sdk.tx.send(signed, LOOPBACK);
    const again = await outcome(sdk.tx.send(signed, LOOPBACK));
    expect(again.error, String(again.error?.message)).toBeUndefined();
    expect(node.submits).toHaveLength(1);
    expect(submissions()).toHaveLength(1);
    expect(again.result).toMatchObject({ alreadySubmitted: true });
    expect(again.result.derived.status).toBe("MEMPOOL_ACCEPTED");
    expect((await sdk.tx.status(official.txId)).status).toBe("MEMPOOL_ACCEPTED");
  });

  it("T4 · the answer was lost after the node received it (outcome unknown): the re-send finds it in the node and does not broadcast it again; the recorded outcome stays unknown", async () => {
    const sdk = await openSdk();
    node.loseNextAnswer = true;
    const first = await sdk.tx.send(signed, LOOPBACK);
    expect(submitOutcomeOf((first.submission as any).submitResult)).toBe("unknown");
    const again = await outcome(sdk.tx.send(signed, LOOPBACK));
    expect(again.error, String(again.error?.message)).toBeUndefined();
    expect(node.submits).toHaveLength(1);
    expect(submissions()).toHaveLength(1);
    expect(again.result).toMatchObject({ alreadySubmitted: true, artifactId: first.artifactId });
    expect(again.result.derived.status).toBe("MEMPOOL_ACCEPTED");
  });

  it("T5 · the connection was lost before the request reached the node (SUBMIT_NOT_SENT, nothing recorded): sending again IS the first broadcast", async () => {
    const sdk = await openSdk();
    node.dropNextRequest = true;
    const first = await outcome(sdk.tx.send(signed, LOOPBACK));
    expect(first.error?.code).toBe("SUBMIT_NOT_SENT");
    expect(submissions()).toHaveLength(0);
    const again = await outcome(sdk.tx.send(signed, LOOPBACK));
    expect(again.error, String(again.error?.message)).toBeUndefined();
    expect(again.result.submitted).toBe(true);
    expect(again.result.alreadySubmitted).toBeUndefined();
    expect(node.submits).toHaveLength(2);
    expect(submissions()).toHaveLength(1);
  });

  it("T6 · a real rejection (double spend): the re-send is refused with TX_ALREADY_SUBMITTED, nothing sent, the rejection stays the one record", async () => {
    const sdk = await openSdk();
    node.doubleSpent.add(official.txId);
    const first = await sdk.tx.send(signed, LOOPBACK);
    expect(submitOutcomeOf((first.submission as any).submitResult)).toBe("rejected");
    const again = await outcome(sdk.tx.send(signed, LOOPBACK));
    expect(again.error?.code).toBe("TX_ALREADY_SUBMITTED");
    expect(again.error?.message).toMatch(/Nothing was sent/);
    expect(again.error?.message).toMatch(/outcome rejected/);
    expect(node.submits).toHaveLength(1);
    expect(submissions()).toHaveLength(1);
    expect((await sdk.tx.status(official.txId)).status).toBe("REJECTED_BY_NODE");
  });

  it("T7 · two sends of the same signed artifact at once: one broadcast, one submission; the other returns it", async () => {
    const sdk = await openSdk();
    const submit = sdk.rpc.submitTransaction as any;
    submit.mockImplementation(async (transaction: any) => {
      await new Promise((r) => setTimeout(r, 300));
      return node.submit(transaction);
    });
    const [a, b] = await Promise.all([outcome(sdk.tx.send(signed, LOOPBACK)), outcome(sdk.tx.send(signed, LOOPBACK))]);
    expect(a.error, String(a.error?.message)).toBeUndefined();
    expect(b.error, String(b.error?.message)).toBeUndefined();
    expect(node.submits).toHaveLength(1);
    expect(submissions()).toHaveLength(1);
    expect([a.result.alreadySubmitted, b.result.alreadySubmitted].filter(Boolean)).toHaveLength(1);
    expect(a.result.artifactId).toBe(b.result.artifactId);
  });

  it("T8 · after a restart (a new SDK instance on the same workspace) the recorded submission still decides: no broadcast", async () => {
    const before = await openSdk();
    await before.tx.send(signed, LOOPBACK);
    node.mine(official.txId);
    vi.restoreAllMocks();
    const after = await openSdk();
    const again = await outcome(after.tx.send(signed, LOOPBACK));
    expect(again.error, String(again.error?.message)).toBeUndefined();
    expect(node.submits).toHaveLength(1);
    expect(submissions()).toHaveLength(1);
    expect(again.result.alreadySubmitted).toBe(true);
    expect(again.result.derived.status).toBe("CONFIRMED");
  });

  it("T9 · outcome unknown and the node does NOT hold it: refused with TX_ALREADY_SUBMITTED (a re-broadcast would need a second submission for the txId); nothing sent, only the observation recorded", async () => {
    const sdk = await openSdk();
    node.loseNextAnswer = true;
    await sdk.tx.send(signed, LOOPBACK);
    node.mempool.delete(official.txId); // the node dropped it
    const looks = observations().length;
    const again = await outcome(sdk.tx.send(signed, LOOPBACK));
    expect(again.error?.code).toBe("TX_ALREADY_SUBMITTED");
    expect(again.error?.message).toMatch(/outcome unknown/);
    expect(again.error?.message).toMatch(/second submission/);
    expect(node.submits).toHaveLength(1);
    expect(submissions()).toHaveLength(1);
    expect(observations()).toHaveLength(looks + 1);
  });

  it("T11 · the re-send observes through a client with no typed getSinkBlueScore (the CLI's wRPC client): the same request through its generic call; no broadcast", async () => {
    const sdk = await openSdk();
    await sdk.tx.send(signed, LOOPBACK);
    node.mine(official.txId);
    Object.defineProperty(sdk.rpc, "getSinkBlueScore", { value: undefined, configurable: true, writable: true });
    const again = await outcome(sdk.tx.send(signed, LOOPBACK));
    expect(again.error, String(again.error?.message)).toBeUndefined();
    expect(node.submits).toHaveLength(1);
    expect(again.result).toMatchObject({ alreadySubmitted: true });
    expect(again.result.derived.status).toBe("CONFIRMED");
  });

  it("T10 · the node cannot be observed when re-sending: refused, nothing sent, nothing recorded", async () => {
    const sdk = await openSdk();
    await sdk.tx.send(signed, LOOPBACK);
    node.readsDown = true;
    const looks = observations().length;
    const again = await outcome(sdk.tx.send(signed, LOOPBACK));
    expect(again.error?.code).toBe("TX_ALREADY_SUBMITTED");
    expect(again.error?.message).toMatch(/could not be observed/);
    expect(node.submits).toHaveLength(1);
    expect(submissions()).toHaveLength(1);
    expect(observations()).toHaveLength(looks);
  });
});
