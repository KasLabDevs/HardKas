import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Hardkas } from "../src/index.js";
import { withClientUrl } from "./helpers/rpc-instance.js";
import { officialSignedPayload, nodeNamesReceived } from "./helpers/official-signed-payload.js";
import {
  calculateContentHash,
  CURRENT_HASH_VERSION,
  expectedScriptPublicKeyHex,
  createLineageTransition,
  HardkasSchemas,
  HARDKAS_VERSION,
  ARTIFACT_VERSION
} from "@hardkas/artifacts";

vi.setConfig({ testTimeout: 60_000 });

// -----------------------------------------------------------------------------
// INT9 · I-2 (TX-SEND-IDEMPOTENT-3, 2026-11-09). TX-SEND-IDEMPOTENT-2 only asked the node's mempool before broadcasting
// a payment this workspace has no record of: a CONFIRMED payment whose record was lost (or that another workspace sent)
// went out again, the node answered "orphan" and a rejection was recorded (B6 review, I-2). Now the send asks the node
// for POSITIVE evidence before the broadcast, in this order, and refuses with ALREADY_SUBMITTED (nothing sent or
// recorded) when it has it:
//   1. the mempool holds the txId                                                → state MEMPOOL;
//   2. this workspace's stored looks at the txId, looked at once more, accept it → state ACCEPTED / CONFIRMED / FINALIZED;
//   3. an output of THIS txId is listed at the address it pays, with the amount and script the transaction gives it
//      (the txId commits to its outputs)                                        → state IN_CHAIN.
// Nothing is concluded from what the node does not list (the index lags; an output may be spent since): then the state
// is NOT_OBSERVED, or UNKNOWN when a read failed, and the broadcast goes ahead — the node judges, its answer recorded
// once. The send result names the check (`nodeCheck`). The stand-in node answers like rusty-kaspa 2.1.0 (the one of
// tx-send-idempotent-2, plus its UTXO index, virtual chain and headers through the generic `call`).
// -----------------------------------------------------------------------------

const LOOPBACK = "http://127.0.0.1:16110";
const FROM = "kaspasim:qpumuen7l8wthtz45p3ftn58pvrs9xlumvkuu2xet8egzkcklqtes65ue9mw6";
const TO = "kaspasim:qrrqglu5g8kh6mfsg4qxa9wq0nv9cauwfwxw70984wkqnw2uwz0w27rvnw0sc";
const script = (address: string) => expectedScriptPublicKeyHex(address)!;
const H = (n: number) => n.toString(16).padStart(64, "0");
const UTXOS = [
  { outpoint: { transactionId: "a".repeat(64), index: 0 }, address: FROM, amountSompi: 1_000_000_000n, scriptPublicKey: script(FROM), blockDaaScore: 1000n, isCoinbase: false },
  { outpoint: { transactionId: "b".repeat(64), index: 1 }, address: FROM, amountSompi: 500_000_000n, scriptPublicKey: script(FROM), blockDaaScore: 1200n, isCoinbase: false }
];

function officialFromPlan(plan: any): { payload: string; txId: string } {
  return officialSignedPayload({
    inputs: plan.inputs.map((i: any) => ({ previousOutpoint: { transactionId: i.outpoint.transactionId, index: i.outpoint.index } })),
    outputs: [
      ...plan.outputs.map((o: any) => ({ amount: o.amountSompi, scriptPublicKey: { version: 0, scriptPublicKey: script(o.address) } })),
      ...(plan.change ? [{ amount: plan.change.amountSompi, scriptPublicKey: { version: 0, scriptPublicKey: script(plan.change.address) } }] : [])
    ]
  });
}

function signedFromPlan(plan: any, payload: string, txId: string): any {
  const s: any = {
    schema: HardkasSchemas.SignedTx,
    schemaVersion: HardkasSchemas.ArtifactV1,
    hardkasVersion: HARDKAS_VERSION,
    version: ARTIFACT_VERSION,
    hashVersion: CURRENT_HASH_VERSION,
    createdAt: "2026-11-09T00:00:00.000Z",
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

/** A stand-in rusty-kaspa node: mempool, submit rules, a UTXO index (by address), a virtual chain and its headers. */
class FakeNode {
  mempool = new Set<string>();
  inChain = new Set<string>();
  submits: string[] = [];
  reads: string[] = [];
  sinkBlueScore = 1000n;
  virtualDaaScore = 1_000_000n;
  chain: Array<{ hash: string; blueScore: bigint; daaScore: bigint; accepted: string[] }> = [{ hash: H(1), blueScore: 1n, daaScore: 1n, accepted: [] }];
  /** The UTXOs the node lists at an address (default: the plan's two inputs, at FROM). */
  utxosAt: (address: string) => any[] = (address) => (address === FROM ? UTXOS.map((u) => ({ ...u })) : []);
  failUtxoReads = false;
  get sink() {
    return this.chain[this.chain.length - 1]!.hash;
  }
  async submit(transaction: unknown): Promise<{ transactionId: string }> {
    const { transactionId: txId } = await nodeNamesReceived(transaction);
    this.submits.push(txId);
    if (this.mempool.has(txId)) throw new Error(`Rejected transaction ${txId}: transaction ${txId} is already in the mempool`);
    if (this.inChain.has(txId)) throw new Error(`Rejected transaction ${txId}: transaction ${txId} is an orphan where orphan is disallowed`);
    this.mempool.add(txId);
    return { transactionId: txId };
  }
  call(method: string, params: any): any {
    this.reads.push(method);
    switch (method) {
      case "getServerInfo":
        return { networkId: "simnet", serverVersion: "2.1.0", isSynced: true, hasUtxoIndex: true };
      case "getBlockDagInfo":
        return { networkName: "simnet", virtualDaaScore: this.virtualDaaScore.toString(), sink: this.sink, pruningPointHash: H(1) };
      case "getMempoolEntry": {
        if (!this.mempool.has(params.transactionId)) throw Object.assign(new Error("transaction not found"), { code: "RPC_NOT_FOUND" });
        return { mempoolEntry: { isOrphan: false, fee: "2000" } };
      }
      case "getUtxosByAddresses": {
        if (this.failUtxoReads) throw new Error("utxo index is disabled (start kaspad with --utxoindex)");
        const entries = (params.addresses as string[]).flatMap((a) =>
          this.utxosAt(a).map((u) => ({
            address: a,
            outpoint: u.outpoint,
            utxoEntry: { amount: String(u.amountSompi), scriptPublicKey: { version: 0, scriptPublicKey: u.scriptPublicKey }, blockDaaScore: String(u.blockDaaScore), isCoinbase: false }
          }))
        );
        return { entries };
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
        return { block: { header: { hash: b.hash, blueScore: b.blueScore.toString(), daaScore: b.daaScore.toString() } } };
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

describe("TX-SEND-IDEMPOTENT-3 · a payment with no record here is not broadcast when the node shows it already has it", () => {
  let ws: string;
  let node: FakeNode;
  let plan: any;
  let official: { payload: string; txId: string };
  let signed: any;

  async function openSdk(): Promise<any> {
    const sdk: any = await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simnet" });
    const cfg: any = sdk.config.config;
    cfg.networks = { ...(cfg.networks ?? {}), simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: "ws://127.0.0.1:1" } };
    vi.spyOn(sdk.rpc, "getUtxosByAddress").mockImplementation(async (address: string) => node.utxosAt(address) as any);
    vi.spyOn(sdk.rpc, "getMempoolEntriesByAddresses").mockResolvedValue({ entries: [] } as any);
    vi.spyOn(sdk.rpc, "getBlockDagInfo").mockImplementation(async () => ({ networkId: "simnet", virtualDaaScore: node.virtualDaaScore, tipHashes: [node.sink], sink: node.sink }) as any);
    vi.spyOn(sdk.rpc, "getSinkBlueScore").mockImplementation(async () => ({ blueScore: node.sinkBlueScore.toString() }) as any);
    vi.spyOn(sdk.rpc, "getServerInfo").mockResolvedValue({ networkId: "simnet", serverVersion: "2.1.0", isSynced: true } as any);
    vi.spyOn(sdk.rpc, "call").mockImplementation(async (method: string, params: any) => node.call(method, params));
    vi.spyOn(sdk.rpc, "submitTransaction").mockImplementation(async (transaction: any) => node.submit(transaction));
    withClientUrl(sdk, LOOPBACK);
    return sdk;
  }

  const files = (sub: string, re: RegExp) => {
    const dir = path.join(ws, ".hardkas", "artifacts", sub);
    return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => re.test(f)) : [];
  };
  const submissions = () => files("receipts", /txsubmission/i);
  const observations = () => files("observations", /\.json$/);

  beforeEach(async () => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-tsi3-"));
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

  const spentInputs = () => new Set(plan.inputs.map((i: any) => `${i.outpoint.transactionId}:${i.outpoint.index}`));
  const withoutSpentInputs = (address: string) =>
    address === FROM ? UTXOS.filter((u) => !spentInputs().has(`${u.outpoint.transactionId}:${u.outpoint.index}`)).map((u) => ({ ...u })) : [];
  /** The node applied the payment: its inputs leave the index and its outputs appear, accepted at DAA score `daa`. */
  const applied = (daa = 999_900n) => {
    node.inChain.add(official.txId);
    const pays = [...plan.outputs.map((o: any) => ({ address: o.address, amount: BigInt(o.amountSompi) })), ...(plan.change ? [{ address: plan.change.address, amount: BigInt(plan.change.amountSompi) }] : [])];
    node.utxosAt = (address) => [
      ...withoutSpentInputs(address),
      ...pays
        .map((p, index) => ({ p, index }))
        .filter(({ p }) => p.address === address)
        .map(({ p, index }) => ({ outpoint: { transactionId: official.txId, index }, address, amountSompi: p.amount, scriptPublicKey: script(address), blockDaaScore: daa, isCoinbase: false }))
    ];
  };

  it("I3-1 · in the chain, its record lost, a plain send (no preflight): ALREADY_SUBMITTED, state IN_CHAIN with the listed output as evidence; nothing sent or recorded", async () => {
    applied();
    const sdk = await openSdk();
    const r = await outcome(sdk.tx.send(signed, LOOPBACK));
    expect(r.error?.code, String(r.error?.message ?? JSON.stringify(r.result?.nodeCheck))).toBe("ALREADY_SUBMITTED");
    expect(r.error?.metadata).toMatchObject({ txId: official.txId, state: "IN_CHAIN", recorded: false });
    const evidence = r.error?.metadata?.evidence;
    expect(evidence?.kind).toBe("utxo-index");
    expect(evidence?.outputs?.[0]).toMatchObject({ outpoint: `${official.txId}:0`, address: TO, amountSompi: String(plan.outputs[0].amountSompi), blockDaaScore: "999900" });
    expect(evidence?.virtualDaaScore).toBe("1000000");
    expect(evidence?.daaScoreDepth).toBe("100");
    expect(String(r.error?.message)).toMatch(/already in the chain/);
    expect(String(r.error?.message)).not.toMatch(/confirmed/i);
    expect(node.submits).toEqual([]);
    expect(submissions()).toHaveLength(0);
  });

  it("I3-2 · in the chain, its record lost, this workspace's stored looks: ALREADY_SUBMITTED, state CONFIRMED with the accepting block and its blue-score confirmations; nothing sent or recorded", async () => {
    node.inChain.add(official.txId);
    node.chain.push({ hash: H(2), blueScore: 10n, daaScore: 999_000n, accepted: [official.txId] });
    node.sinkBlueScore = 500n;
    node.utxosAt = withoutSpentInputs; // its outputs already spent: the index alone would not tell
    const look = await openSdk();
    const seen = await look.tx.observe(official.txId, { since: H(1) });
    expect(seen.derived.status).toBe("CONFIRMED");
    const stored = observations().length;
    const sdk = await openSdk();
    const r = await outcome(sdk.tx.send(signed, LOOPBACK));
    expect(r.error?.code, String(r.error?.message ?? JSON.stringify(r.result?.nodeCheck))).toBe("ALREADY_SUBMITTED");
    expect(r.error?.metadata).toMatchObject({ txId: official.txId, state: "CONFIRMED", recorded: false });
    expect(r.error?.metadata?.evidence).toMatchObject({ kind: "virtual-chain", acceptingBlockHash: H(2), confirmations: { blue: "490", unit: "blue-score" } });
    expect(node.submits).toEqual([]);
    expect(submissions()).toHaveLength(0);
    expect(observations(), "the check's look is not stored").toHaveLength(stored);
  });

  it("I3-3 · nothing of it anywhere (mempool, looks, outputs): NOT_OBSERVED — one broadcast, one submission, and the result names the check", async () => {
    const sdk = await openSdk();
    const r = await outcome(sdk.tx.send(signed, LOOPBACK));
    expect(r.error, String(r.error?.message)).toBeUndefined();
    expect(node.submits).toEqual([official.txId]);
    expect(submissions()).toHaveLength(1);
    expect(r.result?.nodeCheck).toMatchObject({ txId: official.txId, state: "NOT_OBSERVED" });
    expect(r.result.nodeCheck.checks.map((c: any) => `${c.check}:${c.result}`)).toEqual(["mempool:not-found", "observations:skipped", "utxo-outputs:not-found"]);
  });

  it("I3-4 · a read the node cannot answer (no UTXO index): UNKNOWN — the broadcast goes ahead (documented policy), and the result says which read failed", async () => {
    node.failUtxoReads = true;
    const sdk = await openSdk();
    const r = await outcome(sdk.tx.send(signed, LOOPBACK));
    expect(r.error, String(r.error?.message)).toBeUndefined();
    expect(node.submits).toEqual([official.txId]);
    expect(r.result?.nodeCheck?.state).toBe("UNKNOWN");
    expect(r.result.nodeCheck.checks.find((c: any) => c.check === "utxo-outputs")).toMatchObject({ result: "unavailable" });
    expect(String(r.result.nodeCheck.checks.find((c: any) => c.check === "utxo-outputs")?.detail)).toMatch(/utxoindex/);
  });

  it("I3-5 · an entry under this txId with another amount is not evidence: UNKNOWN, never IN_CHAIN; the node judges", async () => {
    node.utxosAt = (address) =>
      address === TO ? [{ outpoint: { transactionId: official.txId, index: 0 }, address: TO, amountSompi: 1n, scriptPublicKey: script(TO), blockDaaScore: 5n, isCoinbase: false }] : withoutSpentInputs(address);
    const sdk = await openSdk();
    const r = await outcome(sdk.tx.send(signed, LOOPBACK));
    expect(r.error?.code).not.toBe("ALREADY_SUBMITTED");
    expect(node.submits).toEqual([official.txId]);
    expect(r.result?.nodeCheck?.state).toBe("UNKNOWN");
    expect(String(r.result.nodeCheck.checks.find((c: any) => c.check === "utxo-outputs")?.detail)).toMatch(/another amount or script/);
  });

  it("I3-6 · in the chain with every output spent since (the index cannot tell): NOT_OBSERVED, the node rejects it, the rejection is recorded once", async () => {
    node.inChain.add(official.txId);
    node.utxosAt = withoutSpentInputs;
    const sdk = await openSdk();
    const r = await outcome(sdk.tx.send(signed, LOOPBACK));
    expect(node.submits).toEqual([official.txId]);
    expect(submissions()).toHaveLength(1);
    expect(r.result?.submitted).toBe(false);
    expect(r.result?.nodeCheck?.state).toBe("NOT_OBSERVED");
    const again = await outcome((await openSdk()).tx.send(signed, LOOPBACK));
    expect(again.error?.code).toBe("TX_ALREADY_SUBMITTED");
    expect(node.submits, "the recorded rejection is never retried").toEqual([official.txId]);
  });

  it("I3-8 · the mempool still lists it while the stored looks show the chain accepted it (rusty-kaspa #1146): the chain's CONFIRMED wins over MEMPOOL; nothing sent", async () => {
    node.chain.push({ hash: H(2), blueScore: 10n, daaScore: 999_000n, accepted: [official.txId] });
    node.sinkBlueScore = 500n;
    const look = await openSdk();
    expect((await look.tx.observe(official.txId, { since: H(1) })).derived.status).toBe("CONFIRMED");
    node.mempool.add(official.txId);
    const sdk = await openSdk();
    const r = await outcome(sdk.tx.send(signed, LOOPBACK));
    expect(r.error?.code, String(r.error?.message)).toBe("ALREADY_SUBMITTED");
    expect(r.error?.metadata).toMatchObject({ state: "CONFIRMED", evidence: { kind: "virtual-chain", acceptingBlockHash: H(2) } });
    expect(r.error?.metadata?.checks?.[0]).toMatchObject({ check: "mempool", result: "found" });
    expect(node.submits).toEqual([]);
  });

  it("I3-7 · (control) already in the mempool: MEMPOOL as before, and only the mempool was asked", async () => {
    node.mempool.add(official.txId);
    const sdk = await openSdk();
    const r = await outcome(sdk.tx.send(signed, LOOPBACK));
    expect(r.error?.code).toBe("ALREADY_SUBMITTED");
    expect(r.error?.metadata).toMatchObject({ state: "MEMPOOL", recorded: false, evidence: { kind: "mempool-entry", isOrphan: false } });
    expect(node.reads.filter((m) => m === "getUtxosByAddresses")).toEqual([]);
    expect(node.submits).toEqual([]);
  });
});
