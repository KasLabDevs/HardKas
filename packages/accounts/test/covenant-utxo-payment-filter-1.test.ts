import { describe, it, expect, beforeAll, vi } from "vitest";
import { loadManagedKaspaWasmSync, systemRuntimeContext, asNetworkId } from "@hardkas/core";
import { createTxPlanArtifact, expectedScriptPublicKeyHex, calculateContentHash, CURRENT_HASH_VERSION } from "@hardkas/artifacts";
import { TxPlanService } from "@hardkas/tx-builder";
import { signTxPlanArtifact } from "../src/signer.js";

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

// -----------------------------------------------------------------------------
// COVENANT-UTXO-PAYMENT-FILTER-1 (2026-10-25), at the signer. A payment plan that names a covenant's UTXO as an input
// and continues no covenant (no output carries a binding) would end that covenant once signed and sent. HardKAS
// planners never select such a UTXO; a plan that names one anyway (written by hand or by another tool) is not signed,
// before any key is used. Since COVENANT-UTXO-PAYMENT-FILTER-1B (F1.0-bis) that holds whatever its outputs declare: a
// payment transaction cannot carry a covenant binding, and a binding alone proves no valid transition (CA-3). Real
// pinned kaspa-wasm, throwaway key, no network.
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

/** An ordinary payment planned by the real planner over one of alice's UTXOs. */
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

/** The same plan as if its input were a covenant's UTXO, its identity sealed again (a well-formed artifact). */
function namingCovenantInput(artifact: any, continuesIt = false): any {
  const copy = JSON.parse(JSON.stringify(artifact));
  copy.inputs[0].covenantId = COVENANT_ID;
  if (continuesIt) copy.outputs[0].covenant = { covenantId: COVENANT_ID, authorizingInput: 0 };
  delete copy.contentHash;
  copy.contentHash = calculateContentHash(copy, copy.hashVersion ?? CURRENT_HASH_VERSION);
  return copy;
}

const sign = (planArtifact: any) =>
  signTxPlanArtifact({
    target: { mode: "localnet", domain: "kaspa-l1", network: "simnet" },
    planArtifact,
    account: { name: "alice", kind: "kaspa", network: "simnet", address: alice, privateKey: KEY } as any
  });

describe("COVENANT-UTXO-PAYMENT-FILTER-1 · the signer refuses a payment that would end a covenant", () => {
  it("CA-1 control: the ordinary payment plan is signed", async () => {
    const signed: any = await sign(await plan());
    expect(signed.status).toBe("signed");
  });

  it("CA-2 a payment plan whose input is a covenant's UTXO is not signed (COVENANT_UTXO_NOT_PAYMENT_INPUT)", async () => {
    await expect(sign(namingCovenantInput(await plan()))).rejects.toMatchObject({ code: "COVENANT_UTXO_NOT_PAYMENT_INPUT" });
  });

  it("CA-3 a plan whose covenant input comes with an output bound to it is refused too (F1.0-bis: a binding proves nothing)", async () => {
    await expect(sign(namingCovenantInput(await plan(), true))).rejects.toMatchObject({ code: "COVENANT_UTXO_NOT_PAYMENT_INPUT" });
  });
});
