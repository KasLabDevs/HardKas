import { describe, it, expect, beforeAll, vi } from "vitest";
import { loadManagedKaspaWasmSync, systemRuntimeContext, asNetworkId } from "@hardkas/core";
import { createTxPlanArtifact, expectedScriptPublicKeyHex, finalizeTxPlanIdentity } from "@hardkas/artifacts";
import { MAX_TX_IN_SEQUENCE_NUM, TxPlanService } from "@hardkas/tx-builder";
import { KaspaWasmPrivateKeySigner } from "../src/kaspa-wasm-signer.js";

/** The official kaspa-wasm id of a signed payload, rebuilt from its own fields (ids exclude signature scripts). */
function officialTxIdOf(payload: string): string {
  let tx: any = JSON.parse(payload);
  while (typeof tx === "string") tx = JSON.parse(tx);
  return String(
    new k.Transaction({
      version: Number(tx.version),
      inputs: tx.inputs.map((i: any) => ({
        previousOutpoint: { transactionId: i.previousOutpoint.transactionId, index: Number(i.previousOutpoint.index) },
        signatureScript: i.signatureScript,
        sequence: BigInt(i.sequence),
        sigOpCount: Number(i.sigOpCount)
      })),
      outputs: tx.outputs.map((o: any) => ({ value: BigInt(o.amount ?? o.value), scriptPublicKey: new k.ScriptPublicKey(Number(o.scriptPublicKey.version), o.scriptPublicKey.scriptPublicKey ?? o.scriptPublicKey.script) })),
      lockTime: BigInt(tx.lockTime),
      subnetworkId: tx.subnetworkId,
      gas: BigInt(tx.gas ?? 0),
      payload: tx.payload ?? ""
    }).id
  );
}

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

// -----------------------------------------------------------------------------
// CLTV · the accounts signer signs the typed lock time its plan authorizes: written into the transaction (covered by
// its id and its signature hash), every input at sequence 0 so consensus enforces it. A plan without one is signed
// exactly as before (lock time 0, same txid). Bare values and void locks are refused before any key is used.
// Real pinned kaspa-wasm, no network.
// -----------------------------------------------------------------------------

const KEY_A = "1111".padStart(64, "0");
const KEY_B = "2222".padStart(64, "0");
let k: any;
let alice: string;
let bob: string;

beforeAll(() => {
  k = loadManagedKaspaWasmSync();
  alice = String(new k.PrivateKey(KEY_A).toKeypair().toAddress("simnet").toString());
  bob = String(new k.PrivateKey(KEY_B).toKeypair().toAddress("simnet").toString());
});

async function plan(lockTime?: unknown, mutateInputs?: (inputs: any[]) => void) {
  const utxos = [300_000_000n, 250_000_000n].map((amountSompi, n) => ({
    outpoint: { transactionId: (n + 1).toString(16).padStart(64, "c"), index: n },
    address: alice,
    amountSompi,
    scriptPublicKey: expectedScriptPublicKeyHex(alice)!,
    blockDaaScore: 0n,
    isCoinbase: false
  }));
  const planned = await new TxPlanService({ getUtxos: async () => utxos }).planTransactionUpstream({ fromAddress: alice, toAddress: bob, amountSompi: 100_000_000n, networkId: "simnet" } as any);
  const artifact: any = createTxPlanArtifact({
    ctx: { ...systemRuntimeContext, clock: { now: () => 1_700_000_000_000 } },
    networkId: asNetworkId("simnet") as any,
    mode: "localnet",
    from: { input: "alice", address: alice, accountName: "alice" },
    to: { input: "bob", address: bob },
    amountSompi: 100_000_000n,
    plan: planned.plan
  } as any);
  mutateInputs?.(artifact.inputs);
  if (lockTime !== undefined) artifact.lockTime = lockTime;
  finalizeTxPlanIdentity(artifact);
  return artifact;
}

const signer = () => new KaspaWasmPrivateKeySigner({ account: { kind: "kaspa", name: "alice", network: "simnet", address: alice, privateKey: KEY_A } as any });

async function settle(p: Promise<unknown>): Promise<{ ok: true; value: any } | { ok: false; code: unknown; message: string }> {
  try {
    return { ok: true, value: await p };
  } catch (e: any) {
    return { ok: false, code: e?.code, message: String(e?.message ?? e) };
  }
}

const txOf = (r: any) => {
  let tx: any = JSON.parse(r.value.signedTransaction.payload);
  while (typeof tx === "string") tx = JSON.parse(tx);
  return tx;
};

describe("CLTV · the accounts signer and the plan's lock time", () => {
  it("L-1 a DAA-score lock is written into the signed transaction; its id is the official id of that payload and differs from the unlocked one", async () => {
    const unlocked = await settle(signer().signTxPlan({ planArtifact: await plan() } as any));
    const locked = await settle(signer().signTxPlan({ planArtifact: await plan({ daaScore: "123456" }) } as any));
    expect(unlocked.ok && locked.ok, JSON.stringify([unlocked, locked].map((r: any) => r.message))).toBe(true);
    const a = txOf(unlocked);
    const b = txOf(locked);
    expect(String(a.lockTime)).toBe("0");
    expect(String(b.lockTime)).toBe("123456");
    expect(b.inputs.map((i: any) => String(i.sequence))).toEqual(b.inputs.map(() => "0"));
    expect((locked as any).value.txId).not.toBe((unlocked as any).value.txId);
    expect(officialTxIdOf((locked as any).value.signedTransaction.payload)).toBe((locked as any).value.txId);
    expect(officialTxIdOf((unlocked as any).value.signedTransaction.payload)).toBe((unlocked as any).value.txId);
    // the signature covers the lock time: the same inputs signed under another lock time carry another signature
    expect(b.inputs[0].signatureScript).not.toBe(a.inputs[0].signatureScript);
  });

  it("L-2 a time lock (ms) is written too", async () => {
    const r = await settle(signer().signTxPlan({ planArtifact: await plan({ timestampMs: "1767225600000", observedAt: { pastMedianTimeMs: "1700000000000" } }) } as any));
    expect(r.ok, (r as any).message).toBe(true);
    expect(String(txOf(r).lockTime)).toBe("1767225600000");
  });

  it("L-3 CHANGED (RC1 · D7 said LOCK_TIME_NOT_SUPPORTED): a bare lock time is LOCK_TIME_INVALID before any key; a wrong kind too", async () => {
    for (const lockTime of [5, "5", "1700000000000", { daaScore: "600000000000" }, { timestampMs: "5" }]) {
      const r = await settle(signer().signTxPlan({ planArtifact: await plan(lockTime) } as any));
      expect(r.ok, JSON.stringify(lockTime)).toBe(false);
      expect((r as any).code, JSON.stringify(lockTime)).toBe("LOCK_TIME_INVALID");
    }
  });

  it("L-4 a lock with an input the plan states at the maximum sequence is void: LOCK_TIME_VOID_SEQUENCE, nothing signed", async () => {
    const r = await settle(
      signer().signTxPlan({ planArtifact: await plan({ daaScore: "10" }, (inputs) => (inputs[0].sequence = MAX_TX_IN_SEQUENCE_NUM.toString())) } as any)
    );
    expect((r as any).code).toBe("LOCK_TIME_VOID_SEQUENCE");
  });

  it("L-5 control · no lock time, or a bare 0: signed exactly as before (lock time 0, the same txid)", async () => {
    const ids = new Set<string>();
    for (const extra of [undefined, 0, "0"]) {
      const r = await settle(signer().signTxPlan({ planArtifact: await plan(extra) } as any));
      expect(r.ok).toBe(true);
      expect(String(txOf(r).lockTime)).toBe("0");
      ids.add((r as any).value.txId);
    }
    expect(ids.size).toBe(1);
  });
});
