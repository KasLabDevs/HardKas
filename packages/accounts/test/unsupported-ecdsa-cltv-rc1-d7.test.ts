import { describe, it, expect, beforeAll, vi } from "vitest";
import { loadManagedKaspaWasmSync, systemRuntimeContext, asNetworkId } from "@hardkas/core";
import { createTxPlanArtifact, expectedScriptPublicKeyHex } from "@hardkas/artifacts";
import { TxPlanService } from "@hardkas/tx-builder";
import { KaspaWasmPrivateKeySigner } from "../src/kaspa-wasm-signer.js";
import { PrivateKeyAuthorizer } from "../src/authorizers.js";

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

// -----------------------------------------------------------------------------
// RC1 · D7 · out of this RC, said by the signer with a typed code instead of a half-made transaction:
//   * a spend FROM an ECDSA address (P2PK ECDSA, script `21 <33-byte key> ab`, address version 1): the accounts signer
//     signs Schnorr only. Before: an input at an ECDSA address found no authorizer and failed untyped
//     (MISSING_INPUT_AUTHORIZER, no code); with a signing authorizer supplied by the caller it was SIGNED WITH SCHNORR —
//     a transaction the node can only reject. Now: ECDSA_SPEND_NOT_SUPPORTED, before any key is resolved (no authorizer)
//     or before anything is signed (a signing authorizer). An unlocking script the caller makes itself (a
//     signature-script authorization) is used as given, as for a P2SH input: HardKAS signs nothing for it.
//   * an absolute lock time (CLTV, lockTime ≠ 0): every HardKAS builder writes lockTime 0. A plan that carries another
//     lock time was signed with 0 — silently another transaction than the plan. Now: LOCK_TIME_NOT_SUPPORTED.
// Paying TO an ECDSA address stays supported (V-04 against rusty-kaspad). Real pinned kaspa-wasm, no network.
// -----------------------------------------------------------------------------

const KEY_A = "1111".padStart(64, "0");
const KEY_B = "2222".padStart(64, "0");
let k: any;
let schnorrA: string;
let ecdsaA: string;
let bob: string;

beforeAll(() => {
  k = loadManagedKaspaWasmSync();
  const pub = new k.PrivateKey(KEY_A).toPublicKey();
  schnorrA = String(pub.toAddress("simnet").toString());
  ecdsaA = String(pub.toAddressECDSA("simnet").toString());
  bob = String(new k.PrivateKey(KEY_B).toKeypair().toAddress("simnet").toString());
});

/** A v0 payment planned by the real planner over `owner`'s UTXOs (the Schnorr address), then moved to `inputAddress`. */
async function plan(inputAddress: string, extra: Record<string, unknown> = {}) {
  const utxos = [300_000_000n, 250_000_000n].map((amountSompi, n) => ({
    outpoint: { transactionId: (n + 1).toString(16).padStart(64, "c"), index: n },
    address: schnorrA,
    amountSompi,
    scriptPublicKey: expectedScriptPublicKeyHex(schnorrA)!,
    blockDaaScore: 0n,
    isCoinbase: false
  }));
  const planned = await new TxPlanService({ getUtxos: async () => utxos }).planTransactionUpstream({ fromAddress: schnorrA, toAddress: bob, amountSompi: 100_000_000n, networkId: "simnet" } as any);
  const artifact: any = createTxPlanArtifact({
    ctx: systemRuntimeContext,
    networkId: asNetworkId("simnet") as any,
    mode: "localnet",
    from: { input: "alice", address: inputAddress, accountName: "alice" },
    to: { input: "bob", address: bob },
    amountSompi: 100_000_000n,
    plan: planned.plan
  } as any);
  if (inputAddress !== schnorrA) {
    for (const i of artifact.inputs) {
      i.address = inputAddress;
      i.scriptPublicKey = expectedScriptPublicKeyHex(inputAddress)!;
    }
  }
  return Object.assign(artifact, extra);
}

const signer = () => new KaspaWasmPrivateKeySigner({ account: { kind: "kaspa", name: "alice", network: "simnet", address: schnorrA, privateKey: KEY_A } as any });

async function settle(p: Promise<unknown>): Promise<{ ok: true; value: any } | { ok: false; code: unknown; message: string }> {
  try {
    return { ok: true, value: await p };
  } catch (e: any) {
    return { ok: false, code: e?.code, message: String(e?.message ?? e) };
  }
}

describe("RC1 · D7 · the accounts signer does not spend from ECDSA and does not sign a lock time, and says so", () => {
  it("D7-E1 an input at an ECDSA address (script 21…ab): ECDSA_SPEND_NOT_SUPPORTED, typed, naming the input", async () => {
    const p = await plan(ecdsaA);
    expect(p.inputs[0].scriptPublicKey).toMatch(/^21(02|03)[0-9a-f]{64}ab$/);
    const r = await settle(signer().signTxPlan({ planArtifact: p } as any));
    expect(r.ok).toBe(false);
    expect((r as any).code).toBe("ECDSA_SPEND_NOT_SUPPORTED");
    expect((r as any).message).toMatch(/input 0/);
    expect((r as any).message).toMatch(/Schnorr/);
  });

  it("D7-E2 even with an authorizer supplied for it, an ECDSA input is never signed (it was signed with Schnorr)", async () => {
    const p = await plan(ecdsaA);
    const authorizers = Object.fromEntries(p.inputs.map((_: unknown, i: number) => [i, new PrivateKeyAuthorizer("alice", KEY_A)]));
    const r = await settle(signer().signTxPlan({ planArtifact: p, authorizers } as any));
    expect(r.ok).toBe(false);
    expect((r as any).code).toBe("ECDSA_SPEND_NOT_SUPPORTED");
  });

  it("D7-E4 an unlocking script the caller supplies for an ECDSA input (a signature-script authorization) is used as given: HardKAS signs nothing for it (as for a P2SH input without a contract, L1-12)", async () => {
    const p = await plan(ecdsaA);
    const authorizers = Object.fromEntries(p.inputs.map((_: unknown, i: number) => [i, { authorize: async () => ({ kind: "signature-script", signatureScript: "51" }) }]));
    const r = await settle(signer().signTxPlan({ planArtifact: p, authorizers } as any));
    expect(r.ok, (r as any).message).toBe(true);
    let tx: any = JSON.parse((r as any).value.signedTransaction.payload);
    while (typeof tx === "string") tx = JSON.parse(tx);
    expect(tx.inputs.map((i: any) => i.signatureScript)).toEqual(p.inputs.map(() => "51"));
  });

  it("D7-E3 the script decides even when the input names no address (the plan's sender is the ECDSA address)", async () => {
    const p = await plan(ecdsaA);
    for (const i of p.inputs) delete i.address;
    const r = await settle(signer().signTxPlan({ planArtifact: p } as any));
    expect((r as any).code).toBe("ECDSA_SPEND_NOT_SUPPORTED");
  });

  it("D7-L1 a plan carrying a lock time other than 0: LOCK_TIME_NOT_SUPPORTED (it was signed with lock time 0)", async () => {
    for (const lockTime of [5, "5", "1700000000000"]) {
      const r = await settle(signer().signTxPlan({ planArtifact: await plan(schnorrA, { lockTime }) } as any));
      expect(r.ok, String(lockTime)).toBe(false);
      expect((r as any).code, String(lockTime)).toBe("LOCK_TIME_NOT_SUPPORTED");
    }
  });

  it("D7-C control · a Schnorr payment signs, with lock time 0 in the signed payload (an explicit 0 is accepted)", async () => {
    for (const extra of [{}, { lockTime: 0 }, { lockTime: "0" }]) {
      const r = await settle(signer().signTxPlan({ planArtifact: await plan(schnorrA, extra) } as any));
      expect(r.ok, JSON.stringify((r as any).message ?? "")).toBe(true);
      let tx: any = JSON.parse((r as any).value.signedTransaction.payload);
      while (typeof tx === "string") tx = JSON.parse(tx);
      expect(String(tx.lockTime)).toBe("0");
      expect(Number(tx.version)).toBe(0);
    }
  });
});
