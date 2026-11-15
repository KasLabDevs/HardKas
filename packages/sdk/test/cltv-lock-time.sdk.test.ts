import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { officialTxIdOf } from "@hardkas/kaspa-rpc";
import { Hardkas } from "../src/index.js";
import { withClientUrl } from "./helpers/rpc-instance.js";
import { officialSignedPayload } from "./helpers/official-signed-payload.js";
import {
  calculateContentHash,
  CURRENT_HASH_VERSION,
  expectedScriptPublicKeyHex,
  createLineageTransition,
  checkArtifactIdentity,
  validateArtifactSchema,
  HardkasSchemas,
  HARDKAS_VERSION,
  ARTIFACT_VERSION
} from "@hardkas/artifacts";

vi.setConfig({ testTimeout: 60_000 });

// -----------------------------------------------------------------------------
// CLTV · lock times through the SDK's public API (hermetic: every client call a stand-in):
//   * tx.plan({ lockTime }) takes a typed value ({ daaScore } | { timestampMs }) and records it in the plan with the
//     node's virtual DAA score and past median time; a bare number or a wrong kind is LOCK_TIME_INVALID before
//     anything is read; the simulator and consolidations still refuse one (LOCK_TIME_NOT_SUPPORTED);
//   * tx.send binds the signed lock time to the plan's (SIGNED_PLAN_MISMATCH otherwise) and, before the broadcast,
//     refuses one the node has not passed (LOCK_TIME_NOT_REACHED): nothing sent, nothing recorded, the same transaction
//     sendable once the lock is reached.
// -----------------------------------------------------------------------------

const LOOPBACK = "ws://127.0.0.1:16110";
const FROM = "kaspasim:qpumuen7l8wthtz45p3ftn58pvrs9xlumvkuu2xet8egzkcklqtes65ue9mw6";
const TO = "kaspasim:qrrqglu5g8kh6mfsg4qxa9wq0nv9cauwfwxw70984wkqnw2uwz0w27rvnw0sc";
const script = (address: string) => expectedScriptPublicKeyHex(address)!;
const UTXOS = [
  { outpoint: { transactionId: "a".repeat(64), index: 0 }, address: FROM, amountSompi: 1_000_000_000n, scriptPublicKey: script(FROM), blockDaaScore: 1000n, isCoinbase: false }
];
const account = (address: string) => ({ name: address, kind: "external-wallet", network: "simnet", address }) as any;
const PMT = 1_767_225_600_000n;

function signedFromPlan(plan: any, payload: string, txId: string): any {
  const s: any = {
    schema: HardkasSchemas.SignedTx,
    schemaVersion: HardkasSchemas.ArtifactV1,
    hardkasVersion: HARDKAS_VERSION,
    version: ARTIFACT_VERSION,
    hashVersion: CURRENT_HASH_VERSION,
    createdAt: "2026-11-15T00:00:00.000Z",
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
    ...(plan.workflowId ? { workflowId: plan.workflowId } : {})
  };
  s.contentHash = calculateContentHash(s, CURRENT_HASH_VERSION);
  s.lineage.artifactId = s.contentHash;
  s.signedId = `signed-${s.contentHash.slice(0, 16)}`;
  return s;
}

/** The plan's transaction as a signer writes it, carrying `lockTime`, with its official id. */
function lockedPayload(plan: any, lockTime: string): { payload: string; txId: string } {
  const base = officialSignedPayload({
    inputs: plan.inputs.map((i: any) => ({ previousOutpoint: { transactionId: i.outpoint.transactionId, index: i.outpoint.index } })),
    outputs: [
      ...plan.outputs.map((o: any) => ({ amount: o.amountSompi, scriptPublicKey: { version: 0, scriptPublicKey: script(o.address) } })),
      ...(plan.change ? [{ amount: plan.change.amountSompi, scriptPublicKey: { version: 0, scriptPublicKey: script(plan.change.address) } }] : [])
    ]
  });
  const payload = JSON.stringify({ ...JSON.parse(base.payload), lockTime });
  return { payload, txId: officialTxIdOf(payload) };
}

describe("CLTV · lock times through sdk.tx.plan and sdk.tx.send", () => {
  let ws: string;
  let sdk: Hardkas;
  let getUtxos: ReturnType<typeof vi.spyOn>;
  let submit: ReturnType<typeof vi.spyOn>;
  let dag: { virtualDaaScore: bigint; pastMedianTime?: bigint };

  beforeEach(async () => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-cltv-sdk-"));
    fs.mkdirSync(path.join(ws, ".hardkas"));
    sdk = await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simnet" });
    const cfg: any = sdk.config.config;
    cfg.networks = { ...(cfg.networks ?? {}), simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: "ws://127.0.0.1:1" } };
    dag = { virtualDaaScore: 1_000_000n, pastMedianTime: PMT };
    const dagAnswer = () => ({ networkId: "simnet", network: "simnet", virtualDaaScore: dag.virtualDaaScore, ...(dag.pastMedianTime !== undefined ? { pastMedianTime: dag.pastMedianTime } : {}), tipHashes: ["s"], virtualParentHashes: ["s"], sink: "s" });
    getUtxos = vi.spyOn(sdk.rpc, "getUtxosByAddress").mockImplementation(async () => UTXOS.map((u) => ({ ...u })) as any);
    vi.spyOn(sdk.rpc, "getMempoolEntriesByAddresses").mockResolvedValue({ entries: [] } as any);
    // the typed getBlockDagInfo of the SDK's client drops the past median time; the raw call keeps it
    vi.spyOn(sdk.rpc, "getBlockDagInfo").mockImplementation(async () => ({ ...dagAnswer(), pastMedianTime: undefined }) as any);
    vi.spyOn(sdk.rpc as any, "call").mockImplementation((async (method: string) => {
      if (method === "getBlockDagInfo") return dagAnswer();
      throw new Error(`stand-in: ${method} not served`);
    }) as any);
    vi.spyOn(sdk.rpc, "getServerInfo").mockResolvedValue({ networkId: "simnet", serverVersion: "2.1.0", isSynced: true } as any);
    vi.spyOn(sdk.rpc, "getSinkBlueScore").mockResolvedValue({ blueScore: "5000" } as any);
    submit = vi.spyOn(sdk.rpc, "submitTransaction");
    withClientUrl(sdk, LOOPBACK);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(ws, { recursive: true, force: true });
  });

  const submissions = () => {
    const dir = path.join(ws, ".hardkas", "artifacts", "receipts");
    return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /txsubmission/i.test(f)) : [];
  };

  it("C-S1 CHANGED (RC1 · D7 said LOCK_TIME_NOT_SUPPORTED): a bare or ill-kinded lock time is LOCK_TIME_INVALID before anything is read", async () => {
    for (const lockTime of [5, 5n, "1700000000000", { daaScore: 600_000_000_000n }, { timestampMs: 5n }, { daaScore: 0n }, { daaScore: 1n, timestampMs: PMT }]) {
      const err: any = await sdk.tx.plan({ from: account(FROM), to: account(TO), amount: "1", lockTime } as any).catch((e) => e);
      expect(err?.code, String(lockTime)).toBe("LOCK_TIME_INVALID");
    }
    expect(getUtxos, "nothing read").not.toHaveBeenCalled();
  });

  it("C-S2 a typed DAA-score lock is recorded in the plan with the node's position; the plan verifies; without one nothing is written", async () => {
    const plan: any = await sdk.tx.plan({ from: account(FROM), to: account(TO), amount: "1", lockTime: { daaScore: 1_000_500n } });
    expect(plan.lockTime).toEqual({ daaScore: "1000500", observedAt: { virtualDaaScore: "1000000", pastMedianTimeMs: PMT.toString() } });
    expect(checkArtifactIdentity(plan)).toMatchObject({ ok: true });
    expect(validateArtifactSchema(plan).status).toBe("VALID");
    const plain: any = await sdk.tx.plan({ from: account(FROM), to: account(TO), amount: "1" });
    expect("lockTime" in plain).toBe(false);
    const zero: any = await sdk.tx.plan({ from: account(FROM), to: account(TO), amount: "1", lockTime: 0 } as any);
    expect("lockTime" in zero).toBe(false);
  });

  it("C-S3 still not supported: a consolidation (amount 'all') with a lock time — LOCK_TIME_NOT_SUPPORTED", async () => {
    const err: any = await sdk.tx.plan({ from: account(FROM), to: account(TO), amount: "all", lockTime: { daaScore: 5n } }).catch((e) => e);
    expect(err?.code).toBe("LOCK_TIME_NOT_SUPPORTED");
  });

  it("C-S4 send: before the node passes the lock — LOCK_TIME_NOT_REACHED (equal is not final), nothing sent or recorded; once passed, the same transaction is sent once", async () => {
    const plan: any = await sdk.tx.plan({ from: account(FROM), to: account(TO), amount: "3", feeRate: 1000n, lockTime: { daaScore: 1_000_500n } });
    await sdk.artifacts.write(plan);
    const { payload, txId } = lockedPayload(plan, "1000500");
    const signed = signedFromPlan(plan, payload, txId);
    await sdk.artifacts.write(signed);
    submit.mockImplementation((async () => ({ transactionId: txId })) as any);

    for (const at of [1_000_000n, 1_000_500n]) {
      dag.virtualDaaScore = at;
      const err: any = await sdk.tx.send(signed, LOOPBACK).catch((e) => e);
      expect(err?.code, String(at)).toBe("LOCK_TIME_NOT_REACHED");
      expect(String(err?.message)).toMatch(/Nothing was sent or recorded/);
      expect(err?.metadata).toMatchObject({ lockTime: "1000500", kind: "daaScore", reference: at.toString() });
    }
    expect(submit, "nothing sent").not.toHaveBeenCalled();
    expect(submissions(), "nothing recorded").toEqual([]);

    dag.virtualDaaScore = 1_000_501n;
    const sent: any = await sdk.tx.send(signed, LOOPBACK);
    expect(sent.submitted).toBe(true);
    expect(sent.txId).toBe(txId);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submissions().length).toBe(1);
  });

  it("C-S5 a time lock is checked against the past median time; a node that does not report it: LOCK_TIME_UNVERIFIABLE", async () => {
    const lock = PMT + 60_000n;
    const plan: any = await sdk.tx.plan({ from: account(FROM), to: account(TO), amount: "2", feeRate: 1000n, lockTime: { timestampMs: lock } });
    await sdk.artifacts.write(plan);
    const { payload, txId } = lockedPayload(plan, lock.toString());
    const signed = signedFromPlan(plan, payload, txId);
    await sdk.artifacts.write(signed);
    submit.mockImplementation((async () => ({ transactionId: txId })) as any);
    expect(((await sdk.tx.send(signed, LOOPBACK).catch((e) => e)) as any)?.code).toBe("LOCK_TIME_NOT_REACHED");
    dag.pastMedianTime = undefined;
    expect(((await sdk.tx.send(signed, LOOPBACK).catch((e) => e)) as any)?.code).toBe("LOCK_TIME_UNVERIFIABLE");
    expect(submit).not.toHaveBeenCalled();
    dag.pastMedianTime = lock + 1n;
    expect(((await sdk.tx.send(signed, LOOPBACK)) as any).submitted).toBe(true);
  });

  it("C-S6 a signed lock time the plan does not authorize stays SIGNED_PLAN_MISMATCH (another lock, or none), nothing sent", async () => {
    const plan: any = await sdk.tx.plan({ from: account(FROM), to: account(TO), amount: "3", feeRate: 1000n, lockTime: { daaScore: 900_000n } });
    await sdk.artifacts.write(plan);
    for (const lt of ["900001", "0"]) {
      const { payload, txId } = lockedPayload(plan, lt);
      const signed = signedFromPlan(plan, payload, txId);
      await sdk.artifacts.write(signed);
      const err: any = await sdk.tx.send(signed, LOOPBACK).catch((e) => e);
      expect(err?.code, lt).toBe("SIGNED_PLAN_MISMATCH");
      expect(String(err?.message)).toMatch(/lock time/);
    }
    expect(submit).not.toHaveBeenCalled();
  });

  it("C-S7 a lock already passed is sent at once (lock 900000, the node at 1000000)", async () => {
    const plan: any = await sdk.tx.plan({ from: account(FROM), to: account(TO), amount: "3", feeRate: 1000n, lockTime: { daaScore: 900_000n } });
    await sdk.artifacts.write(plan);
    const { payload, txId } = lockedPayload(plan, "900000");
    const signed = signedFromPlan(plan, payload, txId);
    await sdk.artifacts.write(signed);
    submit.mockImplementation((async () => ({ transactionId: txId })) as any);
    expect(((await sdk.tx.send(signed, LOOPBACK)) as any).submitted).toBe(true);
  });
});
