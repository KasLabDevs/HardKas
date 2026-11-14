import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { loadManagedKaspaWasmSync } from "@hardkas/core";
import { pskt } from "../../src/index.js";
import { NativePsktAdapter } from "../../src/pskt/adapters/native.js";
import { assertSignedPsktPayload, psktSignerPublicKey } from "../../src/pskt/signed-payload-check.js";

/*
 * Notes cross-check §2.3 item 4 (2026-11-14) · `pskt.signSession` recorded the adapter's output without reading it, and
 * the native extract accepted an empty signature script. A wallet extension returned an input it was asked to sign with
 * an empty signature and no error. Now signSession refuses a returned payload that is not the sent transaction
 * (PSKT_SIGNED_TRANSACTION_CHANGED), lacks the signer's non-empty Schnorr signature on an input asked for
 * (PSKT_SIGNATURE_MISSING) or cannot be read (PSKT_SIGNED_PAYLOAD_UNREADABLE); the native extract refuses an empty
 * signature script (PSKT_EXTRACTED_INPUT_UNSIGNED). The native binary is not loaded: a stand-in addon plays the signer;
 * its output format is the real addon's (probed: partialSigs { "<compressed pubkey>": { "schnorr": <64 bytes> } }, the
 * Rust round trip adding "covenant": null to outputs). The node is a stub.
 */

const k: any = loadManagedKaspaWasmSync();
const hex = (s: string) => createHash("sha256").update(s).digest("hex");
const KEY = hex("n1 pskt signer key");
const OTHER = hex("n1 pskt other key");
const pubOf = (key: string) => String(new k.PrivateKey(key).toPublicKey().toString());
const p2pkScriptOf = (key: string) => "0000" + String(k.payToAddressScript(new k.PrivateKey(key).toPublicKey().toAddress("testnet-10")).script);
const addressOf = (key: string, network: string) => String(new k.PrivateKey(key).toPublicKey().toAddress(network).toString());
const OUTPOINT = (n: number) => hex(`n1 outpoint ${n}`);
const SIG = { schnorr: "ab".repeat(64) };

const input = (n: number, extra: Record<string, unknown> = {}) => ({
  utxoEntry: { amount: 100_000_000, scriptPublicKey: p2pkScriptOf(KEY), blockDaaScore: 0, isCoinbase: false, covenantId: null },
  previousOutpoint: { transactionId: OUTPOINT(n), index: 0 },
  sequence: null,
  minTime: null,
  partialSigs: {},
  sighashType: 1,
  redeemScript: null,
  sigOpCount: 1,
  bip32Derivations: {},
  finalScriptSig: null,
  proprietaries: {},
  ...extra
});
const innerOf = (inputs: any[]) => ({
  global: { version: 1, txVersion: 0, fallbackLockTime: null, inputsModifiable: false, outputsModifiable: false, inputCount: 0, outputCount: 0, xpubs: {}, id: null, proprietaries: {}, payload: null },
  inputs,
  outputs: [{ amount: 90_000_000, scriptPublicKey: p2pkScriptOf(OTHER), redeemScript: null, bip32Derivations: {}, proprietaries: {} }]
});
/** A payload from the bundle's JSON TEXT (so a test can write a u64 a double cannot hold). */
const payloadOfText = (json: string) => {
  const data = Buffer.from("PSKB" + Buffer.from(json, "utf8").toString("hex"), "utf8").toString("base64");
  return { format: "pskt-binary-base64" as const, encoding: "base64" as const, data, payloadHash: createHash("sha256").update(Buffer.from(data, "base64")).digest("hex"), byteLength: Buffer.from(data, "base64").length };
};
const payloadOf = (bundle: any[]) => payloadOfText(JSON.stringify(bundle));
const bundleOf = (data: string) => JSON.parse(Buffer.from(Buffer.from(data, "base64").toString("utf8").slice(4), "hex").toString("utf8"));

/** The real signer's behaviour: the same PSKT, the key's signature added on each input asked for, outputs re-serialized. */
const honest = (bundle: any[], pub: string, indexes: number[]) => {
  for (const inner of bundle) {
    for (const i of indexes) inner.inputs[i].partialSigs = { ...inner.inputs[i].partialSigs, [pub]: SIG };
    for (const o of inner.outputs) o.covenant = null; // the Rust round trip writes it
  }
  return bundle;
};

let seq = 0;
/** A session over a native adapter whose stand-in addon signs with `behaviour` (the payload's bundle → the returned one). */
async function sessionWith(behaviour: (bundle: any[], pub: string, indexes: number[]) => any[] | string, inputs: any[] = [input(0)]) {
  const adapter: any = new NativePsktAdapter(`n1-signed-check-${++seq}`);
  adapter.addon = {
    psktProbe: () => JSON.stringify({ bridge_version: "0.0.0-test", rusty_kaspa_commit: "test", operations: { inspect: true, sign: true, combine: true, finalize: true, extract: true } }),
    psktSign: (data: string, keys: Uint8Array[], requestJson: string) => {
      const pub = String(new k.PrivateKey(Buffer.from(keys[0]!).toString("hex")).toPublicKey().toString());
      const out = behaviour(bundleOf(data), pub, JSON.parse(requestJson).inputIndexes);
      const payload = typeof out === "string" ? payloadOfText(out) : payloadOf(out);
      return JSON.stringify({ payloadBase64: payload.data, outputPayloadHash: payload.payloadHash });
    }
  };
  pskt.adapterRegistry.register(adapter);
  const caps = await adapter.probe();
  const base: any = {
    kind: "hardkas-portable-signing-session",
    schemaVersion: 1,
    revision: 0,
    planId: "plan-n1",
    networkId: "testnet-10",
    unsignedTransactionId: "plan-n1",
    state: "created",
    payload: payloadOf([innerOf(inputs)]),
    participants: [],
    requirements: [],
    attestations: [],
    runtimeBinding: { adapterId: adapter.id, adapterKind: adapter.kind, capabilitiesHash: pskt.computeCapabilitiesHash(caps), providerVersion: caps.providerVersion, providerHash: caps.providerHash },
    createdAt: new Date().toISOString()
  };
  base.sessionId = pskt.computeSessionId(base);
  base.integrityHash = pskt.computeIntegrityHash(base);
  return base;
}
const node = {
  async getUtxosByAddress(address: string) {
    return address === addressOf(KEY, "testnet-10") ? [0, 1, 2].map((n) => ({ outpoint: { transactionId: OUTPOINT(n), index: 0 }, amountSompi: 100_000_000n })) : [];
  }
};
const sign = (session: any, inputIndexes = [0]) =>
  pskt.signSession(session, { participantId: "p", keyMaterial: Uint8Array.from(Buffer.from(KEY, "hex")), inputIndexes }, { networkId: "testnet-10", node });
async function codeOf(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
  } catch (e: any) {
    return e?.code ?? String(e?.message ?? e).split(":")[0];
  }
  return undefined;
}

describe("§2.3 item 4 · signSession reads what the signer returned before it records it", () => {
  it("control: the same PSKT with the key's Schnorr signature on the input asked for (outputs re-serialized with covenant: null) → recorded", async () => {
    const s = await sessionWith(honest);
    const signed = await sign(s);
    expect(signed.revision).toBe(1);
    const sigs = bundleOf(signed.payload.data)[0].inputs[0].partialSigs;
    expect(Object.keys(sigs)).toEqual([pubOf(KEY)]);
  });

  it("THE GAP: the input comes back without any signature (the adapter returned the PSKT as sent) → PSKT_SIGNATURE_MISSING", async () => {
    expect(await codeOf(sign(await sessionWith((b) => b)))).toBe("PSKT_SIGNATURE_MISSING");
  });

  for (const [name, sig] of [
    ["an empty signature", { schnorr: "" }],
    ["an all-zero signature", { schnorr: "00".repeat(64) }],
    ["a 32-byte signature", { schnorr: "ab".repeat(32) }],
    ["a bare string", "ab".repeat(64)],
    ["an ECDSA-tagged one", { ecdsa: "ab".repeat(64) }]
  ] as const) {
    it(`the signer's entry holds ${name} → PSKT_SIGNATURE_MISSING`, async () => {
      const s = await sessionWith((b, pub) => {
        b[0].inputs[0].partialSigs = { [pub]: sig };
        return b;
      });
      expect(await codeOf(sign(s))).toBe("PSKT_SIGNATURE_MISSING");
    });
  }

  it("a signature by another key only → PSKT_SIGNATURE_MISSING", async () => {
    const s = await sessionWith((b) => {
      b[0].inputs[0].partialSigs = { [pubOf(OTHER)]: SIG };
      return b;
    });
    expect(await codeOf(sign(s))).toBe("PSKT_SIGNATURE_MISSING");
  });

  it("two inputs asked for, one signed → PSKT_SIGNATURE_MISSING (names the other)", async () => {
    const s = await sessionWith((b, pub) => honest(b, pub, [0]), [input(0), input(1)]);
    let message = "";
    try {
      await sign(s, [0, 1]);
    } catch (e: any) {
      expect(e?.code).toBe("PSKT_SIGNATURE_MISSING");
      message = String(e?.message);
    }
    expect(message).toMatch(/input 1 was asked to be signed/);
  });

  const tamper: Array<[string, (b: any[]) => void]> = [
    ["an output amount", (b) => (b[0].outputs[0].amount = 89_999_999)],
    ["an output script", (b) => (b[0].outputs[0].scriptPublicKey = p2pkScriptOf(KEY))],
    ["an extra output", (b) => b[0].outputs.push({ amount: 1, scriptPublicKey: p2pkScriptOf(OTHER), redeemScript: null, bip32Derivations: {}, proprietaries: {} })],
    ["a covenant on an output", (b) => (b[0].outputs[0].covenant = { authorizingInput: 0, covenantId: "cd".repeat(32) })],
    ["the spent outpoint", (b) => (b[0].inputs[0].previousOutpoint.index = 1)],
    ["the UTXO amount", (b) => (b[0].inputs[0].utxoEntry.amount = 100_000_001)],
    ["the sequence", (b) => (b[0].inputs[0].sequence = 5)],
    ["the sighash type", (b) => (b[0].inputs[0].sighashType = 0x81)],
    ["the sig-op count", (b) => (b[0].inputs[0].sigOpCount = 2)],
    ["the lock time (an input's minTime)", (b) => (b[0].inputs[0].minTime = 1000)],
    ["the lock time (fallbackLockTime)", (b) => (b[0].global.fallbackLockTime = 1000)],
    ["the payload", (b) => (b[0].global.payload = "00")],
    ["the transaction version", (b) => (b[0].global.txVersion = 1)],
    ["an extra input", (b) => b[0].inputs.push(input(2))],
    ["a second PSKT in the bundle", (b) => b.push(innerOf([input(2)]))]
  ];
  for (const [what, change] of tamper) {
    it(`signed, but ${what} changed → PSKT_SIGNED_TRANSACTION_CHANGED`, async () => {
      const s = await sessionWith((b, pub, idx) => {
        honest(b, pub, idx);
        change(b);
        return b;
      });
      expect(await codeOf(sign(s))).toBe("PSKT_SIGNED_TRANSACTION_CHANGED");
    });
  }

  it("a signature added on an input not asked for, or another party's signature removed → PSKT_SIGNED_TRANSACTION_CHANGED", async () => {
    const extra = await sessionWith((b, pub) => honest(b, pub, [0, 1]), [input(0), input(1)]);
    expect(await codeOf(sign(extra, [0]))).toBe("PSKT_SIGNED_TRANSACTION_CHANGED");
    const theirs = { [pubOf(OTHER)]: { schnorr: "cd".repeat(64) } };
    const removed = await sessionWith((b, pub, idx) => {
      honest(b, pub, idx);
      delete b[0].inputs[0].partialSigs[pubOf(OTHER)];
      return b;
    }, [input(0, { partialSigs: theirs })]);
    expect(await codeOf(sign(removed))).toBe("PSKT_SIGNED_TRANSACTION_CHANGED");
    // control: kept as it was, plus the signer's
    const kept = await sessionWith(honest, [input(0, { partialSigs: theirs })]);
    expect((await sign(kept)).revision).toBe(1);
  });

  it("a u64 amount beyond 2^53 changed by one sompi is seen (compared as written, never through a double)", async () => {
    const big = "9007199254740993"; // 2^53 + 1: as a double it reads 9007199254740992
    const sentText = JSON.stringify([innerOf([input(0)])]).replace('"amount":90000000', `"amount":${big}`);
    const make = async (returnedAmount: string) => {
      const s = await sessionWith((b, pub, idx) => JSON.stringify(honest(b, pub, idx)).replace(/"amount":9007199254740992\b/, `"amount":${returnedAmount}`));
      s.payload = payloadOfText(sentText);
      s.integrityHash = pskt.computeIntegrityHash(s);
      return s;
    };
    expect(await codeOf(sign(await make("9007199254740992")))).toBe("PSKT_SIGNED_TRANSACTION_CHANGED");
    expect((await sign(await make(big))).revision).toBe(1);
  });

  it("a returned payload that is not a PSKB bundle, or whose bundle is not JSON → PSKT_SIGNED_PAYLOAD_UNREADABLE", async () => {
    const s = await sessionWith(honest);
    const registered: any = pskt.adapterRegistry.get(s.runtimeBinding.adapterId);
    registered.addon.psktSign = () => {
      const data = Buffer.from(JSON.stringify({ state: "signed" })).toString("base64");
      return JSON.stringify({ payloadBase64: data, outputPayloadHash: hex(data) });
    };
    expect(await codeOf(sign(s))).toBe("PSKT_SIGNED_PAYLOAD_UNREADABLE");
    expect(await codeOf(sign(await sessionWith(() => "not json")))).toBe("PSKT_SIGNED_PAYLOAD_UNREADABLE");
  });

  it("assertSignedPsktPayload without the signer's key: each input asked for must gain a well-formed signature", () => {
    const sent = payloadOf([innerOf([input(0)])]);
    const ok = payloadOf(honest([innerOf([input(0)])], pubOf(OTHER), [0]));
    expect(() => assertSignedPsktPayload(sent, ok, [0], undefined)).not.toThrow();
    expect(() => assertSignedPsktPayload(sent, sent, [0], undefined)).toThrow(/PSKT_SIGNATURE_MISSING|asked to be signed/);
    expect(psktSignerPublicKey(Uint8Array.from(Buffer.from(KEY, "hex")))).toBe(pubOf(KEY));
    expect(psktSignerPublicKey(new Uint8Array(31))).toBeUndefined();
    expect(psktSignerPublicKey(undefined)).toBeUndefined();
  });
});

describe("§2.3 item 4 · the native extract refuses an unsigned input", () => {
  const extractWith = (signatureScripts: string[]) => {
    const adapter: any = new NativePsktAdapter(`n1-extract-${++seq}`);
    adapter.addon = {
      psktProbe: () => JSON.stringify({ bridge_version: "0.0.0-test", rusty_kaspa_commit: "test", operations: { inspect: true, sign: true, combine: true, finalize: true, extract: true } }),
      psktExtract: () =>
        JSON.stringify({
          transactionJson: JSON.stringify({
            version: 0,
            mass: "0",
            lock_time: "0",
            inputs: signatureScripts.map((s, n) => ({ previous_outpoint: { transaction_id: OUTPOINT(n), index: 0 }, signature_script: s, sequence: "0", sig_op_count: 1 })),
            outputs: [{ value: "90000000", script_public_key: { version: 0, script: p2pkScriptOf(OTHER).slice(4) } }],
            payload: "",
            subnetwork_id: "00".repeat(20)
          }),
          transactionId: "ef".repeat(32),
          transactionVersion: 0,
          networkId: "testnet-10",
          sourcePayloadHash: "00".repeat(32)
        })
    };
    return adapter.extract(payloadOf([innerOf([input(0)])]), "testnet-10");
  };

  it("control: every input carries a signature script → extracted", async () => {
    const r = await extractWith(["41" + "ab".repeat(64) + "01"]);
    expect(r.transactionId).toBe("ef".repeat(32));
  });

  it("an empty signature script (or a malformed one) → PSKT_EXTRACTED_INPUT_UNSIGNED, naming the inputs", async () => {
    let caught: any;
    try {
      await extractWith(["41" + "ab".repeat(64) + "01", "", "xyz"]);
    } catch (e) {
      caught = e;
    }
    expect(caught?.code).toBe("PSKT_EXTRACTED_INPUT_UNSIGNED");
    expect(caught?.metadata?.inputs).toEqual([1, 2]);
  });
});
