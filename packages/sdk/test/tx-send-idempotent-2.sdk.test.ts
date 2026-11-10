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
// TX-SEND-IDEMPOTENT-2 (L1-CORE-1 B2, 2026-11-07). TX-SEND-IDEMPOTENT-1 never re-broadcasts what THIS workspace recorded.
// A payment it holds no submission of — sent from another workspace, or whose record was lost — was still broadcast
// when the node already had it: in the chain, the node answers "orphan" (its inputs are spent by that very transaction)
// and a rejection gets recorded; its inputs spent by another transaction, the same. Now:
//  - every send first asks the node, read-only, whether it holds the txId in its mempool → ALREADY_SUBMITTED (MEMPOOL);
//  - a checked send (`preflight`) that finds an input unlisted tells it apart: this transaction's outputs listed → it is
//    in the chain, ALREADY_SUBMITTED (IN_CHAIN); otherwise INPUTS_SPENT_UNATTRIBUTED (INT9: was INPUTS_SPENT). A plain
//    send does not judge unlisted inputs from the UTXO index, which lags behind the chain and the mempool (TX-BATCH-1,
//    TX-WAIT-CHAINED-SPEND-1): the node does. (INT9 · I-2: a plain send now refuses on POSITIVE evidence only —
//    tx-send-idempotent-3.)
// Nothing is sent or recorded in the refused cases.
// The stand-in node is the one of tx-send-idempotent-1 (answers like rusty-kaspa 2.1.0), with a scripted UTXO view.
// -----------------------------------------------------------------------------

const LOOPBACK = "http://127.0.0.1:16110";
const FROM = "kaspasim:qpumuen7l8wthtz45p3ftn58pvrs9xlumvkuu2xet8egzkcklqtes65ue9mw6";
const TO = "kaspasim:qrrqglu5g8kh6mfsg4qxa9wq0nv9cauwfwxw70984wkqnw2uwz0w27rvnw0sc";
const script = (address: string) => expectedScriptPublicKeyHex(address)!;
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
    createdAt: "2026-11-07T00:00:00.000Z",
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

/** A stand-in rusty-kaspa node: a mempool, the submit rules that matter here, and a UTXO view the test scripts. */
class FakeNode {
  mempool = new Set<string>();
  inChain = new Set<string>();
  submits: string[] = [];
  /** The UTXOs the node lists at an address (default: the plan's two inputs, at FROM). */
  utxosAt: (address: string) => any[] = (address) => (address === FROM ? UTXOS.map((u) => ({ ...u })) : []);
  async submit(transaction: unknown): Promise<{ transactionId: string }> {
    const { transactionId: txId } = await nodeNamesReceived(transaction);
    this.submits.push(txId);
    if (this.mempool.has(txId)) throw new Error(`Rejected transaction ${txId}: transaction ${txId} is already in the mempool`);
    if (this.inChain.has(txId)) throw new Error(`Rejected transaction ${txId}: transaction ${txId} is an orphan where orphan is disallowed`);
    this.mempool.add(txId);
    return { transactionId: txId };
  }
  call(method: string, params: any): any {
    switch (method) {
      case "getServerInfo":
        return { networkId: "simnet", serverVersion: "2.1.0", isSynced: true, hasUtxoIndex: true };
      case "getMempoolEntry": {
        if (!this.mempool.has(params.transactionId)) throw Object.assign(new Error("transaction not found"), { code: "RPC_NOT_FOUND" });
        return { mempoolEntry: { isOrphan: false, fee: "2000" } };
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

describe("TX-SEND-IDEMPOTENT-2 · a payment this workspace has no record of is not broadcast when the node already has it", () => {
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
    vi.spyOn(sdk.rpc, "getBlockDagInfo").mockResolvedValue({ networkId: "simnet", virtualDaaScore: 1_000_000n, tipHashes: ["0".repeat(64)], sink: "0".repeat(64) } as any);
    vi.spyOn(sdk.rpc, "getServerInfo").mockResolvedValue({ networkId: "simnet", serverVersion: "2.1.0", isSynced: true } as any);
    vi.spyOn(sdk.rpc, "call").mockImplementation(async (method: string, params: any) => node.call(method, params));
    vi.spyOn(sdk.rpc, "submitTransaction").mockImplementation(async (transaction: any) => node.submit(transaction));
    withClientUrl(sdk, LOOPBACK);
    return sdk;
  }

  const submissions = () => {
    const dir = path.join(ws, ".hardkas", "artifacts", "receipts");
    return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /txsubmission/i.test(f)) : [];
  };

  beforeEach(async () => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-tsi2-"));
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

  it("I2-0 · control · inputs listed unspent, nothing in the mempool: broadcast once, one submission", async () => {
    const sdk = await openSdk();
    const r = await outcome(sdk.tx.send(signed, LOOPBACK));
    expect(r.error, String(r.error?.message)).toBeUndefined();
    expect(node.submits).toEqual([official.txId]);
    expect(submissions()).toHaveLength(1);
  });

  it("I2-1 · already in the node's mempool (sent from elsewhere): ALREADY_SUBMITTED, state MEMPOOL; nothing sent or recorded", async () => {
    node.mempool.add(official.txId);
    const sdk = await openSdk();
    const r = await outcome(sdk.tx.send(signed, LOOPBACK));
    expect(r.error?.code, String(r.error?.message)).toBe("ALREADY_SUBMITTED");
    expect(r.error?.metadata).toMatchObject({ txId: official.txId, state: "MEMPOOL", recorded: false });
    expect(node.submits).toEqual([]);
    expect(submissions()).toHaveLength(0);
  });

  // The UTXO index lags behind the chain and the mempool (TX-BATCH-1, TX-WAIT-CHAINED-SPEND-1), so an unlisted input is
  // classified only by the checked send (`preflight: true`), which reads the inputs anyway; a plain send leaves it to the
  // node (I2-5).
  it("I2-2 · (preflight) already in the chain (its inputs gone, its outputs listed): ALREADY_SUBMITTED, state IN_CHAIN; nothing sent or recorded", async () => {
    node.inChain.add(official.txId);
    node.utxosAt = (address) =>
      address === TO
        ? [{ outpoint: { transactionId: official.txId, index: 0 }, address: TO, amountSompi: 300_000_000n, scriptPublicKey: script(TO), blockDaaScore: 1_000_001n, isCoinbase: false }]
        : withoutSpentInputs(address);
    const sdk = await openSdk();
    const r = await outcome(sdk.tx.send(signed, { url: LOOPBACK, preflight: true }));
    expect(r.error?.code, String(r.error?.message)).toBe("ALREADY_SUBMITTED");
    expect(r.error?.metadata).toMatchObject({ txId: official.txId, state: "IN_CHAIN", recorded: false });
    expect(node.submits).toEqual([]);
    expect(submissions()).toHaveLength(0);
  });

  // INT9 · I-2 (B6 review M-1): the node no longer listing an input does not say who spent it — another transaction,
  // this one with its outputs spent since, or an index that has not applied the input's creator yet. The refusal stands
  // (nothing is sent) under a code that claims no spender: INPUTS_SPENT_UNATTRIBUTED (it was INPUTS_SPENT, "spent by
  // another transaction", which nothing here proved).
  it("I2-3 · (preflight) its inputs no longer listed, nothing of this transaction listed, no creator in the mempool: INPUTS_SPENT_UNATTRIBUTED naming them, never 'spent by another transaction'; nothing sent or recorded", async () => {
    node.utxosAt = withoutSpentInputs;
    const sdk = await openSdk();
    const r = await outcome(sdk.tx.send(signed, { url: LOOPBACK, preflight: true }));
    expect(r.error?.code, String(r.error?.message)).toBe("INPUTS_SPENT_UNATTRIBUTED");
    expect(new Set(r.error?.metadata?.inputsSpent)).toEqual(spentInputs());
    expect(r.error?.metadata?.spentBy).toBe("unknown");
    expect(String(r.error?.message)).not.toMatch(/spent by another transaction/);
    expect(String(r.error?.message)).toMatch(/who spent/);
    expect(node.submits).toEqual([]);
    expect(submissions()).toHaveLength(0);
  });

  it("I2-5 · (plain send) unlisted inputs are not judged from the lagging index: the node judges — one broadcast, its answer recorded", async () => {
    node.inChain.add(official.txId);
    node.utxosAt = withoutSpentInputs;
    const sdk = await openSdk();
    await outcome(sdk.tx.send(signed, LOOPBACK));
    expect(node.submits).toEqual([official.txId]);
    expect(submissions()).toHaveLength(1);
  });

  // INT9 (B6 review M-6): I2-4 used to be a plain send, which never reaches the classification of unlisted inputs, so the
  // branch it named ("an input created by a transaction still in the mempool") had no test. Now I2-4a keeps what the
  // plain send does, and I2-4b is the checked send that reaches the branch: the creator is asked for in the mempool, and
  // because it is there the preflight's own refusal (INPUT_NOT_UNSPENT: a pending input cannot be verified) stands —
  // never INPUTS_SPENT_UNATTRIBUTED, since the input is pending, not spent.
  it("I2-4a · (plain send) an input created by a transaction still in the mempool (a chained spend): the node judges, the broadcast goes ahead", async () => {
    node.utxosAt = withoutSpentInputs;
    for (const k of spentInputs()) node.mempool.add(String(k).split(":")[0]!);
    const sdk = await openSdk();
    const r = await outcome(sdk.tx.send(signed, LOOPBACK));
    expect(r.error, String(r.error?.message)).toBeUndefined();
    expect(node.submits).toEqual([official.txId]);
    expect(submissions()).toHaveLength(1);
  });

  it("I2-4b · (preflight) the same chained spend reaches the creator branch: each creator is looked up in the mempool, the preflight's INPUT_NOT_UNSPENT stands (not 'spent'); nothing sent or recorded", async () => {
    node.utxosAt = withoutSpentInputs;
    const creators = [...spentInputs()].map((k) => String(k).split(":")[0]!);
    for (const c of creators) node.mempool.add(c);
    const sdk = await openSdk();
    const asked: string[] = [];
    const call = sdk.rpc.call.getMockImplementation();
    vi.spyOn(sdk.rpc, "call").mockImplementation(async (method: string, params: any) => {
      if (method === "getMempoolEntry") asked.push(String(params?.transactionId));
      return call(method, params);
    });
    const r = await outcome(sdk.tx.send(signed, { url: LOOPBACK, preflight: true }));
    expect(r.error?.code, String(r.error?.message)).toBe("INPUT_NOT_UNSPENT");
    // the branch ran: the creator of the first unlisted input was asked for (after the txId itself)
    expect(asked, `getMempoolEntry asked for: ${asked.join(", ")}`).toContain(creators[0]);
    expect(asked[0]).toBe(official.txId);
    expect(node.submits).toEqual([]);
    expect(submissions()).toHaveLength(0);
  });
});
