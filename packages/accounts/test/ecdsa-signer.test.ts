import { describe, it, expect, beforeAll, vi } from "vitest";
import {
  ecdsaCompressedPublicKey,
  kaspaSighashInputsFromWasm,
  loadManagedKaspaWasmSync,
  systemRuntimeContext,
  asNetworkId,
  verifyKaspaInputSignature,
  verifyKaspaInputSignatureEcdsa
} from "@hardkas/core";
import { createTxPlanArtifact, expectedScriptPublicKeyHex } from "@hardkas/artifacts";
import { TxPlanService } from "@hardkas/tx-builder";
import { KaspaWasmPrivateKeySigner } from "../src/kaspa-wasm-signer.js";
import { EcdsaPrivateKeyAuthorizer, PrivateKeyAuthorizer } from "../src/authorizers.js";
import { KeystoreManager } from "../src/keystore.js";
import { accountKeyScheme } from "../src/account-key-scheme.js";
import { createEmptyRealAccountStore, importRealDevAccount } from "../src/real-accounts.js";

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

// -----------------------------------------------------------------------------
// ECDSA spends · the accounts signer signs an ECDSA P2PK input (script `21 <33-byte key> ab`) with an ECDSA account's key
// (core signKaspaInputEcdsa: RFC 6979, low-S, rusty-kaspa's ECDSA sighash), decided by the UTXO's script; a key of the
// other scheme is refused before anything is signed. The keystore records the scheme in its authenticated metadata.
// Real pinned kaspa-wasm, no network (the node's verdict: cltv-ecdsa-node.simnet).
// -----------------------------------------------------------------------------

const KEY_A = "1111".padStart(64, "0");
const KEY_B = "2222".padStart(64, "0");
let k: any;
let schnorrA = "";
let ecdsaA = "";
let bob = "";

beforeAll(() => {
  k = loadManagedKaspaWasmSync();
  const pub = new k.PrivateKey(KEY_A).toPublicKey();
  schnorrA = String(pub.toAddress("simnet").toString());
  ecdsaA = String(pub.toAddressECDSA("simnet").toString());
  bob = String(new k.PrivateKey(KEY_B).toKeypair().toAddress("simnet").toString());
});

/** A v0 payment planned by the real planner over UTXOs at `addresses` (one each), with their own scripts. */
async function plan(addresses: string[], extra: Record<string, unknown> = {}) {
  const utxos = addresses.map((address, n) => ({
    outpoint: { transactionId: (n + 1).toString(16).padStart(64, "d"), index: n },
    address,
    amountSompi: 300_000_000n,
    scriptPublicKey: "0000" + expectedScriptPublicKeyHex(address)!,
    blockDaaScore: 0n,
    isCoinbase: false
  }));
  // the Generator plans from one address; a mixed plan is the planner's plan with its inputs re-pointed (an amount that
  // needs every UTXO)
  const amountSompi = addresses.length > 1 ? 400_000_000n : 100_000_000n;
  const planned = await new TxPlanService({ getUtxos: async () => utxos.map((u) => ({ ...u, address: addresses[0]! })) }).planTransactionUpstream({
    fromAddress: addresses[0]!,
    toAddress: bob,
    amountSompi,
    networkId: "simnet"
  } as any);
  const artifact: any = createTxPlanArtifact({
    ctx: systemRuntimeContext,
    networkId: asNetworkId("simnet") as any,
    mode: "localnet",
    from: { input: "alice", address: addresses[0]!, accountName: "alice" },
    to: { input: "bob", address: bob },
    amountSompi,
    plan: planned.plan
  } as any);
  for (const i of artifact.inputs) {
    const at = utxos.find((u) => u.outpoint.transactionId === i.outpoint.transactionId)!;
    i.address = at.address;
    i.scriptPublicKey = at.scriptPublicKey;
  }
  return Object.assign(artifact, extra);
}

const ecdsaAccount = (overrides: Record<string, unknown> = {}) =>
  ({ kind: "kaspa", name: "alice-ecdsa", network: "simnet", address: ecdsaA, privateKey: KEY_A, keyScheme: "ecdsa", ...overrides }) as any;
const schnorrAccount = () => ({ kind: "kaspa", name: "alice", network: "simnet", address: schnorrA, privateKey: KEY_A }) as any;

async function settle(p: Promise<unknown>): Promise<{ ok: true; value: any } | { ok: false; code: unknown; message: string }> {
  try {
    return { ok: true, value: await p };
  } catch (e: any) {
    return { ok: false, code: e?.code, message: String(e?.message ?? e) };
  }
}

/** The signed payload as kaspa-wasm reads it, with each input's UTXO entry (from the plan), for the sighash. */
function sighashView(payload: string, planInputs: any[]) {
  let tx: any = JSON.parse(payload);
  while (typeof tx === "string") tx = JSON.parse(tx);
  const wtx = new k.Transaction({
    version: Number(tx.version),
    inputs: tx.inputs.map((i: any, n: number) => ({
      previousOutpoint: { transactionId: i.previousOutpoint.transactionId, index: Number(i.previousOutpoint.index) },
      signatureScript: i.signatureScript,
      sequence: BigInt(i.sequence),
      sigOpCount: Number(i.sigOpCount),
      utxo: {
        outpoint: { transactionId: i.previousOutpoint.transactionId, index: Number(i.previousOutpoint.index) },
        amount: BigInt(planInputs[n].amountSompi),
        scriptPublicKey: new k.ScriptPublicKey(0, String(planInputs[n].scriptPublicKey).slice(4)),
        blockDaaScore: 0n,
        isCoinbase: false
      }
    })),
    outputs: tx.outputs.map((o: any) => ({ value: BigInt(o.amount ?? o.value), scriptPublicKey: new k.ScriptPublicKey(Number(o.scriptPublicKey.version), o.scriptPublicKey.scriptPublicKey ?? o.scriptPublicKey.script) })),
    lockTime: BigInt(tx.lockTime),
    subnetworkId: tx.subnetworkId,
    gas: BigInt(tx.gas ?? 0),
    payload: tx.payload ?? ""
  });
  return { ...kaspaSighashInputsFromWasm(wtx.serializeToObject()), signed: tx };
}

describe("ECDSA spends · the accounts signer", () => {
  it("E-1 an ECDSA account signs its ECDSA inputs with ECDSA: one 65-byte push, valid for the transaction and the key, deterministic", async () => {
    const p = await plan([ecdsaA]);
    const a = await settle(new KaspaWasmPrivateKeySigner({ account: ecdsaAccount() }).signTxPlan({ planArtifact: p } as any));
    const b = await settle(new KaspaWasmPrivateKeySigner({ account: ecdsaAccount() }).signTxPlan({ planArtifact: p } as any));
    expect(a.ok, (a as any).message).toBe(true);
    const view = sighashView((a as any).value.signedTransaction.payload, p.inputs);
    const pub = ecdsaCompressedPublicKey(KEY_A);
    view.signed.inputs.forEach((input: any, n: number) => {
      expect(input.signatureScript).toMatch(/^41[0-9a-f]{128}01$/);
      expect(verifyKaspaInputSignatureEcdsa({ tx: view.tx, inputIndex: n, utxo: view.utxos[n]!, publicKey: pub, signature: input.signatureScript.slice(2) })).toBe(true);
      // not a Schnorr signature of the same key
      expect(verifyKaspaInputSignature({ tx: view.tx, inputIndex: n, utxo: view.utxos[n]!, publicKey: pub.slice(2), signature: input.signatureScript.slice(2) })).toBe(false);
    });
    expect((b as any).value.signedTransaction.payload).toBe((a as any).value.signedTransaction.payload);
  });

  it("E-2 CHANGED (RC1 · D7 said ECDSA_SPEND_NOT_SUPPORTED): a Schnorr account, or a Schnorr authorizer, on an ECDSA input is INPUT_KEY_SCHEME_MISMATCH", async () => {
    const p = await plan([ecdsaA]);
    const noAccount = await settle(new KaspaWasmPrivateKeySigner({ account: schnorrAccount() }).signTxPlan({ planArtifact: p } as any));
    expect((noAccount as any).code).toBe("INPUT_KEY_SCHEME_MISMATCH");
    const schnorrAuth = Object.fromEntries(p.inputs.map((_: unknown, i: number) => [i, new PrivateKeyAuthorizer("alice", KEY_A)]));
    const wrong = await settle(new KaspaWasmPrivateKeySigner({ account: schnorrAccount() }).signTxPlan({ planArtifact: p, authorizers: schnorrAuth } as any));
    expect((wrong as any).code).toBe("INPUT_KEY_SCHEME_MISMATCH");
  });

  it("E-3 an ECDSA authorizer on a Schnorr input, and another key's ECDSA authorizer: refused (INPUT_KEY_SCHEME_MISMATCH, PRIVATE_KEY_DOES_NOT_CONTROL_INPUT)", async () => {
    const schnorrPlan = await plan([schnorrA]);
    const onSchnorr = await settle(
      new KaspaWasmPrivateKeySigner({}).signTxPlan({ planArtifact: schnorrPlan, authorizers: Object.fromEntries(schnorrPlan.inputs.map((_: unknown, i: number) => [i, new EcdsaPrivateKeyAuthorizer("alice", KEY_A)])) } as any)
    );
    expect((onSchnorr as any).code).toBe("INPUT_KEY_SCHEME_MISMATCH");
    const ecdsaPlan = await plan([ecdsaA]);
    const otherKey = await settle(
      new KaspaWasmPrivateKeySigner({}).signTxPlan({ planArtifact: ecdsaPlan, authorizers: Object.fromEntries(ecdsaPlan.inputs.map((_: unknown, i: number) => [i, new EcdsaPrivateKeyAuthorizer("bob", KEY_B)])) } as any)
    );
    expect((otherKey as any).code).toBe("PRIVATE_KEY_DOES_NOT_CONTROL_INPUT");
    expect(String((otherKey as any).message)).not.toContain(KEY_B);
  });

  it("E-4 mixed inputs: a Schnorr and an ECDSA input of one key, each signed with its own scheme", async () => {
    const p = await plan([schnorrA, ecdsaA]);
    expect(p.inputs.length).toBe(2);
    const authorizers: Record<number, any> = {};
    p.inputs.forEach((i: any, n: number) => (authorizers[n] = i.address === ecdsaA ? new EcdsaPrivateKeyAuthorizer("a", KEY_A) : new PrivateKeyAuthorizer("a", KEY_A)));
    const r = await settle(new KaspaWasmPrivateKeySigner({}).signTxPlan({ planArtifact: p, authorizers } as any));
    expect(r.ok, (r as any).message).toBe(true);
    const view = sighashView((r as any).value.signedTransaction.payload, p.inputs);
    const pub = ecdsaCompressedPublicKey(KEY_A);
    p.inputs.forEach((i: any, n: number) => {
      const sig = view.signed.inputs[n].signatureScript.slice(2);
      if (i.address === ecdsaA) expect(verifyKaspaInputSignatureEcdsa({ tx: view.tx, inputIndex: n, utxo: view.utxos[n]!, publicKey: pub, signature: sig }), `ecdsa ${n}`).toBe(true);
      else expect(verifyKaspaInputSignature({ tx: view.tx, inputIndex: n, utxo: view.utxos[n]!, publicKey: pub.slice(2), signature: sig }), `schnorr ${n}`).toBe(true);
    });
  });

  it("E-5 the account's scheme and address must agree (ACCOUNT_KEY_SCHEME_MISMATCH before any key); the script decides an input's scheme, its address only which account signs it", async () => {
    const p = await plan([ecdsaA]);
    const bad = await settle(new KaspaWasmPrivateKeySigner({ account: ecdsaAccount({ address: schnorrA }) }).signTxPlan({ planArtifact: p } as any));
    expect((bad as any).code).toBe("ACCOUNT_KEY_SCHEME_MISMATCH");
    expect(() => accountKeyScheme({ name: "x", address: ecdsaA })).toThrow(/ACCOUNT_KEY_SCHEME_MISMATCH/);
    expect(() => accountKeyScheme({ name: "x", address: schnorrA, keyScheme: "rsa" })).toThrow(/ACCOUNT_KEY_SCHEME_INVALID/);
    expect(accountKeyScheme({ name: "x", address: ecdsaA, keyScheme: "ecdsa" })).toBe("ecdsa");
    expect(accountKeyScheme({ name: "x", address: schnorrA })).toBe("schnorr");
    // an ECDSA script listed under the key's Schnorr address: the ECDSA account does not take it (not its address), and
    // the Schnorr account of the same key cannot sign an ECDSA script — refused either way, nothing signed
    const lying = await plan([ecdsaA]);
    lying.inputs[0].address = schnorrA;
    const byEcdsa = await settle(new KaspaWasmPrivateKeySigner({ account: ecdsaAccount() }).signTxPlan({ planArtifact: lying } as any));
    expect(byEcdsa.ok).toBe(false);
    expect((byEcdsa as any).message).toMatch(/MISSING_INPUT_AUTHORIZER/);
    const bySchnorr = await settle(new KaspaWasmPrivateKeySigner({ account: schnorrAccount() }).signTxPlan({ planArtifact: lying } as any));
    expect((bySchnorr as any).code).toBe("INPUT_KEY_SCHEME_MISMATCH");
  });

  it("E-6 still not supported: an ECDSA input in a v1 transaction (ECDSA_SPEND_NOT_SUPPORTED)", async () => {
    const p = await plan([ecdsaA], { txVersion: 1 });
    const r = await settle(new KaspaWasmPrivateKeySigner({ account: ecdsaAccount() }).signTxPlan({ planArtifact: p } as any));
    expect((r as any).code).toBe("ECDSA_SPEND_NOT_SUPPORTED");
  });
});

describe("ECDSA spends · the key scheme in the keystore and the account store", () => {
  it("K-1 an ECDSA keystore records its scheme in the authenticated metadata and the payload; editing it does not open", async () => {
    const ks: any = await KeystoreManager.createEncryptedKeystore({ address: ecdsaA, privateKey: KEY_A, network: "simnet", keyScheme: "ecdsa" }, "password-ecdsa-1", {
      label: "e",
      network: "simnet",
      memory: 19_456,
      iterations: 2
    });
    expect(ks.metadata.keyScheme).toBe("ecdsa");
    const open = await KeystoreManager.decryptEncryptedKeystore(ks, "password-ecdsa-1");
    expect(open).toMatchObject({ success: true, payload: { keyScheme: "ecdsa", address: ecdsaA }, metadataAuthenticated: true });
    const stripped = { ...ks, metadata: { ...ks.metadata } };
    delete stripped.metadata.keyScheme;
    expect((await KeystoreManager.decryptEncryptedKeystore(stripped, "password-ecdsa-1")).success).toBe(false);
    const schnorr: any = await KeystoreManager.createEncryptedKeystore({ address: schnorrA, privateKey: KEY_A, network: "simnet" }, "password-ecdsa-1", { label: "s", network: "simnet", memory: 19_456, iterations: 2 });
    expect("keyScheme" in schnorr.metadata).toBe(false);
    expect((await KeystoreManager.decryptEncryptedKeystore({ ...schnorr, metadata: { ...schnorr.metadata, keyScheme: "ecdsa" } }, "password-ecdsa-1")).success).toBe(false);
    expect((await KeystoreManager.decryptEncryptedKeystore(schnorr, "password-ecdsa-1")).success).toBe(true);
  });

  it("K-2 the account store takes an ECDSA account only with its scheme; a Schnorr account is as before", () => {
    const store = createEmptyRealAccountStore();
    expect(() => importRealDevAccount(store, { name: "e", address: ecdsaA, network: "simnet" as any })).toThrow(/ACCOUNT_KEY_SCHEME_MISMATCH/);
    const next = importRealDevAccount(store, { name: "e", address: ecdsaA, network: "simnet" as any, keyScheme: "ecdsa" });
    expect(next.accounts[0]).toMatchObject({ name: "e", address: ecdsaA, keyScheme: "ecdsa" });
    const plain = importRealDevAccount(store, { name: "s", address: schnorrA, network: "simnet" as any });
    expect("keyScheme" in plain.accounts[0]!).toBe(false);
  });
});
