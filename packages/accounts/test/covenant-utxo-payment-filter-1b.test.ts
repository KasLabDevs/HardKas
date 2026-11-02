import { describe, it, expect, beforeAll, vi } from "vitest";
import { loadManagedKaspaWasmSync, systemRuntimeContext, asNetworkId } from "@hardkas/core";
import { createTxPlanArtifact, expectedScriptPublicKeyHex, finalizeTxPlanIdentity } from "@hardkas/artifacts";
import { TxPlanService } from "@hardkas/tx-builder";
import { signTxPlanArtifact } from "../src/signer.js";

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

// -----------------------------------------------------------------------------
// COVENANT-UTXO-PAYMENT-FILTER-1B (F1.0-bis, 2026-10-25), at the library signer. COVENANT-UTXO-PAYMENT-FILTER-1 refused a
// plan that spends a covenant's UTXO only when NO output carried a binding. But a payment plan is v0, and a v0
// transaction cannot carry a binding: the signer drops it and signs the covenant's UTXO away (probe 81). A v1 binding
// alone proves no valid transition either. The generic payment signer now refuses every input that declares a covenant
// id, whatever the outputs declare, before any key material is read. Real pinned kaspa-wasm, throwaway key, no network.
// -----------------------------------------------------------------------------

const KEY = "1111".padStart(64, "0");
const COVENANT_ID = "c0".repeat(32);
let k: any;
let alice: string;
let bob: string;

beforeAll(() => {
  k = loadManagedKaspaWasmSync();
  alice = new k.PrivateKey(KEY).toKeypair().toAddress("simnet").toString();
  bob = new k.PrivateKey("2222".padStart(64, "0")).toKeypair().toAddress("simnet").toString();
});

/** An ordinary payment planned by the real planner over one of alice's UTXOs (a v0 plan). */
async function plan(): Promise<any> {
  const utxos = [{ outpoint: { transactionId: "ab".repeat(32), index: 0 }, address: alice, amountSompi: 300_000_000n, scriptPublicKey: expectedScriptPublicKeyHex(alice)!, blockDaaScore: 0n, isCoinbase: false }];
  const planned = await new TxPlanService({ getUtxos: async () => utxos }).planTransactionUpstream({ fromAddress: alice, toAddress: bob, amountSompi: 100_000_000n, networkId: "simnet" } as any);
  return createTxPlanArtifact({
    ctx: systemRuntimeContext,
    networkId: asNetworkId("simnet") as any,
    mode: "localnet",
    from: { input: "alice", address: alice, accountName: "alice" },
    to: { input: "bob", address: bob },
    amountSompi: 100_000_000n,
    plan: planned.plan
  } as any);
}

/** The plan as if written by hand or by another tool: its input a covenant's UTXO, its identity sealed again. */
function edited(artifact: any, edit: { binding?: boolean; txVersion?: 0 | 1 }): any {
  const copy = JSON.parse(JSON.stringify(artifact));
  copy.inputs[0].covenantId = COVENANT_ID;
  if (edit.binding) copy.outputs[0].covenant = { covenantId: COVENANT_ID, authorizingInput: 0 };
  if (edit.txVersion !== undefined) copy.txVersion = edit.txVersion;
  delete copy.contentHash;
  delete copy.planId;
  return finalizeTxPlanIdentity(copy);
}

/** The signing account, with every read of key material recorded. */
function watchedAccount() {
  const reads: string[] = [];
  const KEY_FIELDS = new Set(["privateKey", "privateKeyEnv", "keystorePath", "keystoreKind", "mnemonic", "seed", "xprv"]);
  const account = new Proxy({ name: "alice", kind: "kaspa", network: "simnet", address: alice, privateKey: KEY } as any, {
    get(target, prop, receiver) {
      if (typeof prop === "string" && KEY_FIELDS.has(prop)) reads.push(prop);
      return Reflect.get(target, prop, receiver);
    }
  });
  return { account, reads };
}

const sign = (planArtifact: any, account: any) =>
  signTxPlanArtifact({ target: { mode: "localnet", domain: "kaspa-l1", network: "simnet" }, planArtifact, account });
const outcome = (p: Promise<any>) => p.then((signed) => ({ signed }), (error) => ({ error }));

describe("COVENANT-UTXO-PAYMENT-FILTER-1B · the payment signer refuses a covenant's UTXO whatever the outputs declare", () => {
  it("CB-A1 control: the ordinary payment plan is signed, and the account's key is read to sign it", async () => {
    const w = watchedAccount();
    const r: any = await outcome(sign(await plan(), w.account));
    expect(r.error, String(r.error)).toBeUndefined();
    expect(r.signed.status).toBe("signed");
    expect(w.reads.length).toBeGreaterThan(0);
  });

  it("CB-A2 a v0 plan whose covenant input comes with a binding on an output (probe 81) is refused, no key read", async () => {
    const w = watchedAccount();
    const r: any = await outcome(sign(edited(await plan(), { binding: true }), w.account));
    expect(r.error?.code, String(r.error ?? "signed: the binding was dropped and the covenant's UTXO spent")).toBe("COVENANT_UTXO_NOT_PAYMENT_INPUT");
    expect(w.reads).toEqual([]);
  });

  it("CB-A3 a v1 plan whose covenant input comes with a binding to its own id is refused, no key read", async () => {
    const w = watchedAccount();
    const r: any = await outcome(sign(edited(await plan(), { binding: true, txVersion: 1 }), w.account));
    expect(r.error?.code, String(r.error ?? "signed: a v1 binding passed for a validated transition")).toBe("COVENANT_UTXO_NOT_PAYMENT_INPUT");
    expect(w.reads).toEqual([]);
  });

  it("CB-A4 a plan whose covenant input comes with no binding stays refused (the COVENANT-UTXO-PAYMENT-FILTER-1 case)", async () => {
    const w = watchedAccount();
    const r: any = await outcome(sign(edited(await plan(), {}), w.account));
    expect(r.error?.code, String(r.error)).toBe("COVENANT_UTXO_NOT_PAYMENT_INPUT");
    expect(w.reads).toEqual([]);
  });
});
