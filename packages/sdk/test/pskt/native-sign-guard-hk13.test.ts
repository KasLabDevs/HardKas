import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { loadManagedKaspaWasmSync } from "@hardkas/core";
import { NativePsktAdapter } from "../../src/pskt/adapters/native.js";

/*
 * HK-13 (counter-audit X3 §4, C TX-03): the native PSKT signer (`@hardkas/pskt-native`, in hold, reachable through
 * `pskt.registerNativeAdapter()`) signs each input with the sighash type the PSKT declares (SIGHASH_NONE /
 * ANYONECANPAY let a coordinator rewrite outputs after the signature), decides that the key controls an input from the
 * PSKT's own `bip32Derivations` (not from the UTXO's script), checks no network, and declares a trust profile it does not
 * have. The native binary is NOT loaded here: a stand-in addon records whether it was asked to sign; the adapter must
 * refuse BEFORE calling it. PSKTs are built in the native wire format (base64 of "PSKB" + hex of the bundle JSON).
 */

const k: any = loadManagedKaspaWasmSync();
const hex = (s: string) => createHash("sha256").update(s).digest("hex");
const KEY = hex("hk13 signer key");
const OTHER = hex("hk13 other key");
const p2pkScriptOf = (key: string) => "0000" + String(k.payToAddressScript(new k.PrivateKey(key).toPublicKey().toAddress("testnet-10")).script);
const compressedPubOf = (key: string) => String(new k.PrivateKey(key).toPublicKey().toString());

function input(opts: { sighashType?: number; script?: string; derivations?: string[]; withUtxo?: boolean; n?: number }) {
  return {
    ...(opts.withUtxo === false ? { utxoEntry: null } : { utxoEntry: { amount: 100_000_000, scriptPublicKey: opts.script ?? p2pkScriptOf(KEY), blockDaaScore: 0, isCoinbase: false, covenantId: null } }),
    previousOutpoint: { transactionId: hex(`hk13 outpoint ${opts.n ?? 0}`), index: 0 },
    sequence: null,
    minTime: null,
    partialSigs: {},
    sighashType: opts.sighashType ?? 1,
    redeemScript: null,
    sigOpCount: null,
    bip32Derivations: Object.fromEntries((opts.derivations ?? [compressedPubOf(KEY)]).map((pk) => [pk, null])),
    finalScriptSig: null,
    proprietaries: {}
  };
}
function payloadOf(inputs: any[]) {
  const bundle = [
    {
      global: { version: 1, txVersion: 0, fallbackLockTime: null, inputsModifiable: false, outputsModifiable: false, inputCount: 0, outputCount: 0, xpubs: {}, id: null, proprietaries: {}, payload: null },
      inputs,
      outputs: [{ amount: 90_000_000, scriptPublicKey: p2pkScriptOf(OTHER), redeemScript: null, bip32Derivations: {}, proprietaries: {} }]
    }
  ];
  const data = Buffer.from("PSKB" + Buffer.from(JSON.stringify(bundle), "utf8").toString("hex"), "utf8").toString("base64");
  return { format: "pskt-binary-base64" as const, encoding: "base64" as const, data, payloadHash: hex(data), byteLength: Buffer.from(data, "base64").length };
}

/** The adapter over a stand-in addon (the real `.node` is never loaded): counts the sign calls. */
function adapterWithStandIn() {
  const calls = { sign: 0 };
  const adapter: any = new NativePsktAdapter("hk13-native");
  adapter.addon = {
    psktProbe: () => JSON.stringify({ bridge_version: "0.0.0-test", rusty_kaspa_commit: "test", operations: { inspect: true, sign: true, combine: true, finalize: true, extract: true } }),
    psktSign: (data: string) => {
      calls.sign++;
      return JSON.stringify({ payloadBase64: data, outputPayloadHash: hex(data) });
    }
  };
  return { adapter, calls };
}
const key = () => Uint8Array.from(Buffer.from(KEY, "hex"));
async function codeOf(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
  } catch (e: any) {
    return e?.code ?? String(e?.message ?? e).split(":")[0];
  }
  return undefined;
}

describe("HK-13 · the native PSKT signer refuses before the native code runs", () => {
  it("control: SIGHASH_ALL, the UTXO is the key's P2PK, testnet-10 → the native signer is called", async () => {
    const { adapter, calls } = adapterWithStandIn();
    await adapter.sign(payloadOf([input({})]), { participantId: "p", keyMaterial: key(), inputIndexes: [0], networkId: "testnet-10" } as any);
    expect(calls.sign).toBe(1);
  });

  for (const [name, type] of [
    ["SIGHASH_NONE", 2],
    ["SIGHASH_SINGLE", 4],
    ["SIGHASH_ALL|ANYONECANPAY", 0x81],
    ["SIGHASH_NONE|ANYONECANPAY", 0x82]
  ] as const) {
    it(`${name} on the signed input → PSKT_SIGHASH_NOT_ALLOWED, nothing signed`, async () => {
      const { adapter, calls } = adapterWithStandIn();
      expect(await codeOf(adapter.sign(payloadOf([input({ sighashType: type })]), { participantId: "p", keyMaterial: key(), inputIndexes: [0], networkId: "testnet-10" } as any))).toBe(
        "PSKT_SIGHASH_NOT_ALLOWED"
      );
      expect(calls.sign).toBe(0);
    });
  }

  it("a non-ALL sighash on ANOTHER input of the PSKT is refused too", async () => {
    const { adapter, calls } = adapterWithStandIn();
    const payload = payloadOf([input({}), input({ sighashType: 2, n: 1, script: p2pkScriptOf(OTHER), derivations: [compressedPubOf(OTHER)] })]);
    expect(await codeOf(adapter.sign(payload, { participantId: "p", keyMaterial: key(), inputIndexes: [0], networkId: "testnet-10" } as any))).toBe("PSKT_SIGHASH_NOT_ALLOWED");
    expect(calls.sign).toBe(0);
  });

  it("bip32Derivations names the key but the UTXO's script is another key's → PRIVATE_KEY_DOES_NOT_CONTROL_INPUT", async () => {
    const { adapter, calls } = adapterWithStandIn();
    const payload = payloadOf([input({ script: p2pkScriptOf(OTHER), derivations: [compressedPubOf(KEY)] })]);
    expect(await codeOf(adapter.sign(payload, { participantId: "p", keyMaterial: key(), inputIndexes: [0], networkId: "testnet-10" } as any))).toBe("PRIVATE_KEY_DOES_NOT_CONTROL_INPUT");
    expect(calls.sign).toBe(0);
  });

  it("the UTXO's script is the key's even with no bip32Derivations → signed (ownership is the script's)", async () => {
    const { adapter, calls } = adapterWithStandIn();
    await adapter.sign(payloadOf([input({ derivations: [] })]), { participantId: "p", keyMaterial: key(), inputIndexes: [0], networkId: "testnet-10" } as any);
    expect(calls.sign).toBe(1);
  });

  it("no UTXO entry, an out-of-range index, no network, mainnet → refused, nothing signed", async () => {
    const { adapter, calls } = adapterWithStandIn();
    expect(await codeOf(adapter.sign(payloadOf([input({ withUtxo: false })]), { participantId: "p", keyMaterial: key(), inputIndexes: [0], networkId: "testnet-10" } as any))).toBe("PSKT_MISSING_UTXO");
    expect(await codeOf(adapter.sign(payloadOf([input({})]), { participantId: "p", keyMaterial: key(), inputIndexes: [3], networkId: "testnet-10" } as any))).toBe("PSKT_SIGNING_INPUT_OUT_OF_RANGE");
    expect(await codeOf(adapter.sign(payloadOf([input({})]), { participantId: "p", keyMaterial: key(), inputIndexes: [0] } as any))).toBe("PSKT_NETWORK_REQUIRED");
    expect(await codeOf(adapter.sign(payloadOf([input({})]), { participantId: "p", keyMaterial: key(), inputIndexes: [0], networkId: "mainnet" } as any))).toBe("MAINNET_SIGNING_DISABLED");
    expect(await codeOf(adapter.sign({ ...payloadOf([]), data: Buffer.from("PSKA[]").toString("base64") }, { participantId: "p", keyMaterial: key(), inputIndexes: [0], networkId: "testnet-10" } as any))).toBe(
      "PSKT_PAYLOAD_MALFORMED"
    );
    expect(calls.sign).toBe(0);
  });

  it("the trust profile is honest: same process, no transport, nothing authenticated or verified", () => {
    const adapter = new NativePsktAdapter();
    expect(adapter.trustProfile).toMatchObject({ processBoundary: "same-process", transportEncrypted: false, adapterAuthenticated: false, verifiesUnsignedTxIdentity: false });
  });
});
