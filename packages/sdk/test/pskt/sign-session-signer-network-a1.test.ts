import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { loadManagedKaspaWasmSync } from "@hardkas/core";
import { pskt } from "../../src/index.js";
import { NativePsktAdapter } from "../../src/pskt/adapters/native.js";

/*
 * A1 (rc2 audit) · `pskt.signSession` decided "not mainnet" from the session file's own `networkId`, with a raw key tied
 * to no network: a session labelled testnet-10 whose PSKT spends a mainnet UTXO of the signer's key was signed, and the
 * signature was valid on mainnet. Now the CALLER's network is required and must be the session's, and the caller's node
 * for it must list every input to be signed as unspent; anything else refuses before the native signer is called (fail
 * closed). The native binary is not loaded: a stand-in addon counts the sign calls; the node is a stub.
 */

const k: any = loadManagedKaspaWasmSync();
const hex = (s: string) => createHash("sha256").update(s).digest("hex");
const KEY = hex("a1 signer key");
const OTHER = hex("a1 other key");
const p2pkScriptOf = (key: string) => "0000" + String(k.payToAddressScript(new k.PrivateKey(key).toPublicKey().toAddress("testnet-10")).script);
const addressOf = (key: string, network: string) => String(new k.PrivateKey(key).toPublicKey().toAddress(network).toString());
const OUTPOINT = hex("a1 outpoint 0");

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
const input = (transactionId = OUTPOINT) => ({
  utxoEntry: { amount: 100_000_000, scriptPublicKey: p2pkScriptOf(KEY), blockDaaScore: 0, isCoinbase: false, covenantId: null },
  previousOutpoint: { transactionId, index: 0 },
  sequence: null,
  minTime: null,
  partialSigs: {},
  sighashType: 1,
  redeemScript: null,
  sigOpCount: null,
  bip32Derivations: {},
  finalScriptSig: null,
  proprietaries: {}
});

let adapterSeq = 0;
/** A native adapter over a stand-in addon, registered in the SDK registry, and a session bound to it. */
async function sessionFor(networkId: string, payload = payloadOf([input()])) {
  const calls = { sign: 0 };
  const adapter: any = new NativePsktAdapter(`a1-native-${++adapterSeq}`);
  adapter.addon = {
    psktProbe: () => JSON.stringify({ bridge_version: "0.0.0-test", rusty_kaspa_commit: "test", operations: { inspect: true, sign: true, combine: true, finalize: true, extract: true } }),
    psktSign: (data: string) => {
      calls.sign++;
      return JSON.stringify({ payloadBase64: data, outputPayloadHash: hex(data) });
    }
  };
  pskt.adapterRegistry.register(adapter);
  const caps = await adapter.probe();
  const base: any = {
    kind: "hardkas-portable-signing-session",
    schemaVersion: 1,
    revision: 0,
    planId: "plan-a1",
    networkId,
    unsignedTransactionId: "plan-a1",
    state: "created",
    payload,
    participants: [],
    requirements: [],
    attestations: [],
    runtimeBinding: { adapterId: adapter.id, adapterKind: adapter.kind, capabilitiesHash: pskt.computeCapabilitiesHash(caps), providerVersion: caps.providerVersion, providerHash: caps.providerHash },
    createdAt: new Date().toISOString()
  };
  base.sessionId = pskt.computeSessionId(base);
  base.integrityHash = pskt.computeIntegrityHash(base);
  return { session: base, calls };
}
const key = () => Uint8Array.from(Buffer.from(KEY, "hex"));
const request = () => ({ participantId: "p", keyMaterial: key(), inputIndexes: [0] });
/** A node of `network` that lists the given outpoints at the signer's address. */
function nodeListing(network: string, outpoints: string[], asked: string[] = []) {
  return {
    asked,
    async getUtxosByAddress(address: string) {
      asked.push(address);
      return address === addressOf(KEY, network) ? outpoints.map((transactionId) => ({ outpoint: { transactionId, index: 0 }, amountSompi: 100_000_000n })) : [];
    }
  };
}
async function codeOf(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
  } catch (e: any) {
    return e?.code ?? String(e?.message ?? e).split(":")[0];
  }
  return undefined;
}

describe("A1 · pskt.signSession signs only for the caller's own network, on inputs its node lists", () => {
  it("control: caller network = session network, its node lists the input → the native signer is called once", async () => {
    const { session, calls } = await sessionFor("testnet-10");
    const node = nodeListing("testnet-10", [OUTPOINT]);
    const signed = await pskt.signSession(session, request(), { networkId: "testnet-10", node });
    expect(calls.sign).toBe(1);
    expect(signed.revision).toBe(1);
    expect(node.asked).toEqual([addressOf(KEY, "testnet-10")]);
  });

  it("no caller network (the old two-argument call) → PSKT_SIGNER_NETWORK_REQUIRED, nothing signed", async () => {
    const { session, calls } = await sessionFor("testnet-10");
    expect(await codeOf(pskt.signSession(session, request()))).toBe("PSKT_SIGNER_NETWORK_REQUIRED");
    expect(await codeOf(pskt.signSession(session, request(), { node: nodeListing("testnet-10", [OUTPOINT]) }))).toBe("PSKT_SIGNER_NETWORK_REQUIRED");
    expect(calls.sign).toBe(0);
  });

  it("the session declares another network than the caller's → PSKT_NETWORK_MISMATCH, the node is not asked", async () => {
    const { session, calls } = await sessionFor("testnet-10");
    const node = nodeListing("simnet", [OUTPOINT]);
    expect(await codeOf(pskt.signSession(session, request(), { networkId: "simnet", node }))).toBe("PSKT_NETWORK_MISMATCH");
    expect({ signs: calls.sign, asked: node.asked.length }).toEqual({ signs: 0, asked: 0 });
  });

  it("mainnet on either side → MAINNET_SIGNING_DISABLED first, the node is not asked", async () => {
    const a = await sessionFor("mainnet");
    const node = nodeListing("testnet-10", [OUTPOINT]);
    expect(await codeOf(pskt.signSession(a.session, request(), { networkId: "testnet-10", node }))).toBe("MAINNET_SIGNING_DISABLED");
    const b = await sessionFor("testnet-10");
    expect(await codeOf(pskt.signSession(b.session, request(), { networkId: "kaspa-mainnet", node }))).toBe("MAINNET_SIGNING_DISABLED");
    expect({ signs: a.calls.sign + b.calls.sign, asked: node.asked.length }).toEqual({ signs: 0, asked: 0 });
  });

  it("THE ATTACK: a session labelled testnet-10 spending an outpoint the testnet-10 node does not list (a mainnet UTXO) → PSKT_INPUT_NOT_ON_NETWORK", async () => {
    const mainnetUtxo = hex("a mainnet utxo of the signer's key");
    const { session, calls } = await sessionFor("testnet-10", payloadOf([input(mainnetUtxo)]));
    expect(await codeOf(pskt.signSession(session, request(), { networkId: "testnet-10", node: nodeListing("testnet-10", [OUTPOINT]) }))).toBe(
      "PSKT_INPUT_NOT_ON_NETWORK"
    );
    expect(calls.sign).toBe(0);
  });

  it("no node, or a node that cannot be asked → PSKT_INPUTS_UNVERIFIED (fail closed), and the node's URL credentials never show", async () => {
    const { session, calls } = await sessionFor("testnet-10");
    expect(await codeOf(pskt.signSession(session, request(), { networkId: "testnet-10" }))).toBe("PSKT_INPUTS_UNVERIFIED");
    const down = {
      async getUtxosByAddress(): Promise<never> {
        throw new Error("Cannot connect to Kaspa RPC at wss://alice:s3cret@node.example/?api_key=K3Y");
      }
    };
    let message = "";
    try {
      await pskt.signSession(session, request(), { networkId: "testnet-10", node: down });
    } catch (e: any) {
      message = String(e?.message);
      expect(e?.code).toBe("PSKT_INPUTS_UNVERIFIED");
    }
    expect(message).not.toMatch(/s3cret|K3Y/);
    expect(calls.sign).toBe(0);
  });

  it("a payload whose inputs cannot be read → PSKT_INPUTS_UNVERIFIED; a covenant UTXO on the node → COVENANT_UTXO_NOT_PAYMENT_INPUT", async () => {
    const bad = await sessionFor("testnet-10", { ...payloadOf([]), data: Buffer.from("not a pskb").toString("base64") });
    expect(await codeOf(pskt.signSession(bad.session, request(), { networkId: "testnet-10", node: nodeListing("testnet-10", [OUTPOINT]) }))).toBe("PSKT_INPUTS_UNVERIFIED");
    const cov = await sessionFor("testnet-10");
    const covenantNode = {
      async getUtxosByAddress() {
        return [{ outpoint: { transactionId: OUTPOINT, index: 0 }, covenantId: "ab".repeat(32) }];
      }
    };
    expect(await codeOf(pskt.signSession(cov.session, request(), { networkId: "testnet-10", node: covenantNode }))).toBe("COVENANT_UTXO_NOT_PAYMENT_INPUT");
    expect(bad.calls.sign + cov.calls.sign).toBe(0);
  });

  it("assertSessionSignable runs the same checks without a key", async () => {
    const { session } = await sessionFor("simnet");
    await expect(pskt.assertSessionSignable(session, [0], { networkId: "simnet", node: nodeListing("simnet", [OUTPOINT]) })).resolves.toBeUndefined();
    expect(await codeOf(pskt.assertSessionSignable(session, [0], { networkId: "simnet", node: nodeListing("simnet", []) }))).toBe("PSKT_INPUT_NOT_ON_NETWORK");
  });
});
