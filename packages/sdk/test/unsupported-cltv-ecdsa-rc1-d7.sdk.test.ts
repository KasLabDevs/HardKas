import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { loadManagedKaspaWasmSync } from "@hardkas/core";
import { officialTxIdOf } from "@hardkas/kaspa-rpc";
import { Hardkas } from "../src/index.js";
import { withClientUrl } from "./helpers/rpc-instance.js";
import { officialSignedPayload } from "./helpers/official-signed-payload.js";
import {
  calculateContentHash,
  CURRENT_HASH_VERSION,
  expectedScriptPublicKeyHex,
  createLineageTransition,
  checkSignedAgainstPlan,
  HardkasSchemas,
  HARDKAS_VERSION,
  ARTIFACT_VERSION
} from "@hardkas/artifacts";

vi.setConfig({ testTimeout: 60_000 });

// -----------------------------------------------------------------------------
// RC1 · D7 · what the SDK's public API does when a caller tries what this RC does not support:
//   * an absolute lock time (CLTV): `tx.plan({ lockTime })` was silently ignored (a plan with lock time 0 came back);
//     now LOCK_TIME_NOT_SUPPORTED before anything is read. A signed transaction bound to a plan (every plan is lock
//     time 0) whose payload carries another lock time is not the transaction the plan authorized: SIGNED_PLAN_MISMATCH
//     at send (it was sent). A transaction signed elsewhere and sent with allowUnplannedSignedTransaction is the
//     caller's: HardKAS does not evaluate lock times, the node judges it (documented, not tested here).
//   * a spend FROM an ECDSA address: `tx.plan` from one was planned (the failure came later, untyped, at the signer);
//     now ECDSA_SPEND_NOT_SUPPORTED before the node is asked for anything.
// Hermetic: every client call a stand-in.
// -----------------------------------------------------------------------------

const LOOPBACK = "ws://127.0.0.1:16110";
const FROM = "kaspasim:qpumuen7l8wthtz45p3ftn58pvrs9xlumvkuu2xet8egzkcklqtes65ue9mw6";
const TO = "kaspasim:qrrqglu5g8kh6mfsg4qxa9wq0nv9cauwfwxw70984wkqnw2uwz0w27rvnw0sc";
const script = (address: string) => expectedScriptPublicKeyHex(address)!;
const UTXOS = [
  { outpoint: { transactionId: "a".repeat(64), index: 0 }, address: FROM, amountSompi: 1_000_000_000n, scriptPublicKey: script(FROM), blockDaaScore: 1000n, isCoinbase: false }
];

const account = (address: string) => ({ name: address, kind: "external-wallet", network: "simnet", address }) as any;

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
    lineage: createLineageTransition(plan, HardkasSchemas.SignedTx)
  };
  s.contentHash = calculateContentHash(s, CURRENT_HASH_VERSION);
  s.lineage.artifactId = s.contentHash;
  s.signedId = `signed-${s.contentHash.slice(0, 16)}`;
  return s;
}

describe("RC1 · D7 · lock times and ECDSA spends through the SDK's public API", () => {
  let ws: string;
  let sdk: Hardkas;
  let getUtxos: ReturnType<typeof vi.spyOn>;
  let submit: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-rc1-d7-"));
    fs.mkdirSync(path.join(ws, ".hardkas"));
    sdk = await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simnet" });
    const cfg: any = sdk.config.config;
    cfg.networks = { ...(cfg.networks ?? {}), simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: "ws://127.0.0.1:1" } };
    getUtxos = vi.spyOn(sdk.rpc, "getUtxosByAddress").mockImplementation(async () => UTXOS.map((u) => ({ ...u })) as any);
    vi.spyOn(sdk.rpc, "getMempoolEntriesByAddresses").mockResolvedValue({ entries: [] } as any);
    vi.spyOn(sdk.rpc, "getBlockDagInfo").mockResolvedValue({ networkId: "simnet", virtualDaaScore: 1_000_000n, tipHashes: ["s"], virtualParentHashes: ["s"], sink: "s" } as any);
    vi.spyOn(sdk.rpc, "getServerInfo").mockResolvedValue({ networkId: "simnet", serverVersion: "2.1.0", isSynced: true } as any);
    vi.spyOn(sdk.rpc, "getSinkBlueScore").mockResolvedValue({ blueScore: "5000" } as any);
    submit = vi.spyOn(sdk.rpc, "submitTransaction");
    withClientUrl(sdk, LOOPBACK);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(ws, { recursive: true, force: true });
  });

  it("D7-S1 tx.plan({ lockTime }) other than 0: LOCK_TIME_NOT_SUPPORTED before anything is read (it was ignored)", async () => {
    for (const lockTime of [5, 5n, "1700000000000"]) {
      const err: any = await sdk.tx.plan({ from: account(FROM), to: account(TO), amount: "1", lockTime } as any).catch((e) => e);
      expect(err?.code, String(lockTime)).toBe("LOCK_TIME_NOT_SUPPORTED");
      expect(String(err?.message)).toMatch(/lock time 0/);
    }
    expect(getUtxos, "nothing read").not.toHaveBeenCalled();
    // an explicit 0 is what every plan is
    const plan: any = await sdk.tx.plan({ from: account(FROM), to: account(TO), amount: "1", lockTime: 0 } as any);
    expect(plan.inputs.length).toBeGreaterThan(0);
  });

  it("D7-S2 tx.plan FROM an ECDSA address: ECDSA_SPEND_NOT_SUPPORTED, the node is not asked (it was planned)", async () => {
    const k: any = loadManagedKaspaWasmSync();
    const ecdsa = String(new k.PrivateKey("5555".padStart(64, "0")).toPublicKey().toAddressECDSA("simnet").toString());
    const err: any = await sdk.tx.plan({ from: account(ecdsa), to: account(TO), amount: "1" }).catch((e) => e);
    expect(err?.code).toBe("ECDSA_SPEND_NOT_SUPPORTED");
    expect(getUtxos).not.toHaveBeenCalled();
    // paying TO it is supported
    const plan: any = await sdk.tx.plan({ from: account(FROM), to: account(ecdsa), amount: "1" });
    expect(plan.outputs[0].address).toBe(ecdsa);
  });

  it("D7-S3 a signed payment bound to its plan whose payload carries lock time 5: SIGNED_PLAN_MISMATCH, nothing sent (it was sent)", async () => {
    const plan: any = await sdk.tx.plan({ from: account(FROM), to: account(TO), amount: "3", feeRate: 1000n });
    await sdk.artifacts.write(plan);
    const base = officialSignedPayload({
      inputs: plan.inputs.map((i: any) => ({ previousOutpoint: { transactionId: i.outpoint.transactionId, index: i.outpoint.index } })),
      outputs: [
        ...plan.outputs.map((o: any) => ({ amount: o.amountSompi, scriptPublicKey: { version: 0, scriptPublicKey: script(o.address) } })),
        ...(plan.change ? [{ amount: plan.change.amountSompi, scriptPublicKey: { version: 0, scriptPublicKey: script(plan.change.address) } }] : [])
      ]
    });
    const locked = JSON.stringify({ ...JSON.parse(base.payload), lockTime: "5" });
    const lockedId = officialTxIdOf(locked);
    expect(lockedId, "the lock time is covered by the id").not.toBe(base.txId);
    expect(checkSignedAgainstPlan({ format: "hex", payload: base.payload }, plan)).toMatchObject({ ok: true });
    expect(checkSignedAgainstPlan({ format: "hex", payload: locked }, plan)).toMatchObject({ ok: false, kind: "mismatch", code: "SIGNED_PLAN_MISMATCH" });
    const signed = signedFromPlan(plan, locked, lockedId);
    await sdk.artifacts.write(signed);
    submit.mockImplementation((async () => ({ transactionId: lockedId })) as any);
    const err: any = await sdk.tx.send(signed, LOOPBACK).catch((e) => e);
    expect(err?.code).toBe("SIGNED_PLAN_MISMATCH");
    expect(String(err?.message)).toMatch(/lock time/);
    expect(submit).not.toHaveBeenCalled();
  });
});
