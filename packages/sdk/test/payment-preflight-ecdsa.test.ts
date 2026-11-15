import { describe, it, expect, beforeAll } from "vitest";
import crypto from "node:crypto";
import { ecdsaCompressedPublicKey, kaspaSighashInputsFromWasm, loadManagedKaspaWasmSync, signKaspaInputEcdsa } from "@hardkas/core";
import { officialTxIdOf } from "@hardkas/kaspa-rpc";
import { parseWasmTxToRpc, type V1NodeUtxo, type V1PreflightNode } from "@hardkas/accounts";
import { PAYMENT_PREFLIGHT_GUARANTEE, PAYMENT_PREFLIGHT_GUARANTEE_ECDSA, preflightPaymentSend } from "../src/payment-preflight.js";

// -----------------------------------------------------------------------------
// ECDSA spends · the payment preflight verifies an ECDSA P2PK input (`21 <33-byte key> ab`) with ECDSA: it passes only
// with a valid low-S SIGHASH_ALL signature by the key its script commits to; a high-S twin, another key's signature, a
// byte off or a Schnorr signature is INPUT_SIGNATURE_INVALID; another sighash type stays PREFLIGHT_SIGNATURE_UNVERIFIABLE.
// Schnorr inputs are verified as before (payment-preflight-1.test.ts). In-memory node; kaspa-wasm builds the transaction.
// -----------------------------------------------------------------------------

const hash = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
let k: any;

beforeAll(() => {
  k = loadManagedKaspaWasmSync();
});

/** A payment with an ECDSA input (owner key `ecdsaKey`) and, when `withSchnorr`, a second Schnorr input. */
function payment(opts: { sign?: (tx: any, n: number, key: string) => string; withSchnorr?: boolean } = {}) {
  const ecdsaKey = hash("ppe ecdsa owner");
  const schnorrKey = hash("ppe schnorr owner");
  const ecdsaSpk = `21${ecdsaCompressedPublicKey(ecdsaKey)}ab`;
  const schnorrSpk = `20${String(new k.PrivateKey(schnorrKey).toPublicKey().toXOnlyPublicKey().toString())}ac`;
  const owners = [{ key: ecdsaKey, spk: ecdsaSpk, address: String(new k.PrivateKey(ecdsaKey).toPublicKey().toAddressECDSA("testnet-10").toString()), scheme: "ecdsa" }];
  if (opts.withSchnorr) owners.push({ key: schnorrKey, spk: schnorrSpk, address: String(new k.PrivateKey(schnorrKey).toPublicKey().toAddress("testnet-10").toString()), scheme: "schnorr" });
  const outpoints = owners.map((_, n) => ({ transactionId: hash(`ppe utxo ${n}`), index: n }));
  const amounts = owners.map((_, n) => BigInt(n + 2) * 100_000_000n);
  const tx = new k.Transaction({
    version: 0,
    inputs: outpoints.map((o, n) => ({
      previousOutpoint: o,
      signatureScript: "",
      sequence: 0n,
      sigOpCount: 1,
      utxo: { outpoint: o, amount: amounts[n]!, scriptPublicKey: new k.ScriptPublicKey(0, owners[n]!.spk), blockDaaScore: 10n, isCoinbase: false }
    })),
    outputs: [{ value: amounts.reduce((s, a) => s + a, 0n) - 10_000n, scriptPublicKey: new k.ScriptPublicKey(0, `20${"aa".repeat(32)}ac`) }],
    lockTime: 0n,
    subnetworkId: "0".repeat(40),
    gas: 0n,
    payload: ""
  });
  const view = kaspaSighashInputsFromWasm(tx.serializeToObject());
  const scripts = owners.map((o, n) =>
    opts.sign
      ? opts.sign(tx, n, o.key)
      : o.scheme === "ecdsa"
        ? "41" + signKaspaInputEcdsa({ tx: view.tx, inputIndex: n, utxo: view.utxos[n]!, privateKey: o.key })
        : String(k.createInputSignature(tx, n, new k.PrivateKey(o.key), k.SighashType.All))
  );
  const raw = JSON.stringify(parseWasmTxToRpc(tx.serializeToObject(), undefined, Object.fromEntries(scripts.map((s, n) => [n, { signatureScript: s }]))));
  const plan = { contentHash: hash("ppe plan"), inputs: outpoints.map((o, n) => ({ outpoint: o, amountSompi: amounts[n]!.toString(), address: owners[n]!.address, scriptPublicKey: `0000${owners[n]!.spk}` })) };
  const utxos = new Map<string, V1NodeUtxo>(outpoints.map((o, n) => [`${o.transactionId}:${o.index}`, { amountSompi: amounts[n]!, scriptPublicKey: `0000${owners[n]!.spk}`, blockDaaScore: 10n, isCoinbase: false }]));
  const node: V1PreflightNode = { networkId: "testnet-10", utxosByAddresses: async () => utxos, pendingSpentOutpoints: async () => new Set(), virtualDaaScore: async () => 5n };
  return { plan, raw, txId: officialTxIdOf(raw), node, view, ecdsaKey, scripts };
}

const check = async (f: ReturnType<typeof payment>, raw = f.raw) => {
  try {
    return { result: await preflightPaymentSend({ plan: f.plan, rawTransaction: raw, txId: f.txId, node: f.node }), error: undefined as any };
  } catch (error: any) {
    return { result: undefined as any, error };
  }
};

const withScript = (raw: string, n: number, script: string) => {
  const tx = JSON.parse(raw);
  tx.inputs[n].signatureScript = script;
  return JSON.stringify(tx);
};

describe("ECDSA spends · the payment preflight", () => {
  it("PE-1 a valid low-S ECDSA signature by the script's key passes; the evidence says both schemes were verified", async () => {
    const r = await check(payment());
    expect(r.error, String(r.error?.message)).toBeUndefined();
    expect(r.result.evidence).toEqual({ observedAtDaaScore: "5", inputs: 1, scope: "observer-local", guarantee: PAYMENT_PREFLIGHT_GUARANTEE_ECDSA });
    expect(PAYMENT_PREFLIGHT_GUARANTEE_ECDSA).not.toBe(PAYMENT_PREFLIGHT_GUARANTEE);
  });

  it("PE-2 mixed: a Schnorr and an ECDSA input, each verified with its scheme, pass", async () => {
    const r = await check(payment({ withSchnorr: true }));
    expect(r.error, String(r.error?.message)).toBeUndefined();
    expect(r.result.evidence.inputs).toBe(2);
  });

  it("PE-3 the high-S twin, a byte off, another key's ECDSA signature, a Schnorr signature: INPUT_SIGNATURE_INVALID naming the input", async () => {
    const f = payment();
    const good = f.scripts[0]!;
    const s = BigInt("0x" + good.slice(66, 130));
    const highS = good.slice(0, 66) + (N - s).toString(16).padStart(64, "0") + good.slice(130);
    const offByOne = good.slice(0, 20) + (good[20] === "0" ? "1" : "0") + good.slice(21);
    const otherKey = "41" + signKaspaInputEcdsa({ tx: f.view.tx, inputIndex: 0, utxo: f.view.utxos[0]!, privateKey: hash("ppe intruder") });
    const schnorr = payment({ sign: (tx, n, key) => String(k.createInputSignature(tx, n, new k.PrivateKey(key), k.SighashType.All)) }).scripts[0]!;
    for (const [name, script] of [["high-S", highS], ["byte off", offByOne], ["other key", otherKey], ["schnorr", schnorr]] as const) {
      const r = await check(f, withScript(f.raw, 0, script));
      expect(r.error?.code, name).toBe("INPUT_SIGNATURE_INVALID");
      expect(r.error?.detail, name).toEqual({ input: 0 });
      expect(String(r.error?.message), name).toMatch(/ECDSA, low-S/);
    }
  });

  it("PE-4 an ECDSA signature with another sighash type than ALL: PREFLIGHT_SIGNATURE_UNVERIFIABLE (fail closed, as for Schnorr)", async () => {
    const f = payment();
    const single = "41" + signKaspaInputEcdsa({ tx: f.view.tx, inputIndex: 0, utxo: f.view.utxos[0]!, privateKey: f.ecdsaKey, hashType: 0x04 });
    const r = await check(f, withScript(f.raw, 0, single));
    expect(r.error?.code).toBe("PREFLIGHT_SIGNATURE_UNVERIFIABLE");
    expect(String(r.error?.message)).toMatch(/SIGHASH_ALL only/);
  });
});
