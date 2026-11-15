import { describe, it, expect, beforeAll } from "vitest";
import { secp256k1 } from "@noble/curves/secp256k1";
import {
  ecdsaCompressedPublicKey,
  kaspaEcdsaSignatureHash,
  kaspaSchnorrSignatureHash,
  kaspaSighashInputsFromWasm,
  loadManagedKaspaWasmSync,
  signKaspaInputEcdsa,
  verifyKaspaInputSignatureEcdsa
} from "../src/index.js";

// -----------------------------------------------------------------------------
// ECDSA spends · the ECDSA signature of a P2PK ECDSA input (script `21 <33-byte key> ab`), made with @noble/curves
// (RFC 6979, low-S) because kaspa-wasm 2.1.0 has no ECDSA input signer. The hash is rusty-kaspa's
// calc_ecdsa_signature_hash, cross-checked here against kaspa-wasm's own TransactionSigningHashECDSA; the node is the
// final judge (cltv-ecdsa-node.simnet). No network.
// -----------------------------------------------------------------------------

const KEY = "3a".repeat(32);
const OTHER = "4b".repeat(32);
const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
let k: any;
let tx: any;
let utxo: any;
let pub: string;

beforeAll(() => {
  k = loadManagedKaspaWasmSync();
  const key = new k.PrivateKey(KEY);
  const ecdsaAddress = String(key.toPublicKey().toAddressECDSA("simnet").toString());
  const spk = k.payToAddressScript(new k.Address(ecdsaAddress));
  const wtx = new k.Transaction({
    version: 0,
    inputs: [
      {
        previousOutpoint: { transactionId: "ab".repeat(32), index: 1 },
        signatureScript: "",
        sequence: 0n,
        sigOpCount: 1,
        utxo: { outpoint: { transactionId: "ab".repeat(32), index: 1 }, amount: 5_000_000_000n, scriptPublicKey: spk, blockDaaScore: 10n, isCoinbase: false }
      }
    ],
    outputs: [{ value: 4_999_000_000n, scriptPublicKey: k.payToAddressScript(new k.Address(String(new k.PrivateKey(OTHER).toKeypair().toAddress("simnet").toString()))) }],
    lockTime: 77n,
    subnetworkId: "0000000000000000000000000000000000000000",
    gas: 0n,
    payload: ""
  });
  wtx.finalize();
  const read = kaspaSighashInputsFromWasm(wtx.serializeToObject());
  tx = read.tx;
  utxo = read.utxos[0];
  pub = ecdsaCompressedPublicKey(KEY);
});

describe("ECDSA · the signature hash", () => {
  it("is SHA-256(SHA-256('TransactionSigningHashECDSA') ‖ the Schnorr sighash), as kaspa-wasm's TransactionSigningHashECDSA computes it", () => {
    const schnorr = Buffer.from(kaspaSchnorrSignatureHash(tx, 0, utxo)).toString("hex");
    const h = new k.TransactionSigningHashECDSA();
    h.update(schnorr);
    expect(Buffer.from(kaspaEcdsaSignatureHash(tx, 0, utxo)).toString("hex")).toBe(String(h.finalize()));
  });

  it("the UTXO's script is the 33-byte compressed key of the private key (kaspa-wasm's ECDSA address)", () => {
    expect(utxo.scriptPublicKey.script).toBe(`21${pub}ab`);
    expect(pub).toBe(String(new k.PrivateKey(KEY).toPublicKey().toString()).toLowerCase());
  });
});

describe("ECDSA · sign and verify", () => {
  it("deterministic (RFC 6979), low-S, 64 bytes + SIGHASH_ALL; verifies with the key, not with another", () => {
    const a = signKaspaInputEcdsa({ tx, inputIndex: 0, utxo, privateKey: KEY });
    const b = signKaspaInputEcdsa({ tx, inputIndex: 0, utxo, privateKey: KEY });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{128}01$/);
    const s = BigInt("0x" + a.slice(64, 128));
    expect(s <= N >> 1n).toBe(true);
    expect(verifyKaspaInputSignatureEcdsa({ tx, inputIndex: 0, utxo, publicKey: pub, signature: a })).toBe(true);
    expect(verifyKaspaInputSignatureEcdsa({ tx, inputIndex: 0, utxo, publicKey: ecdsaCompressedPublicKey(OTHER), signature: a })).toBe(false);
  });

  it("refuses a high-S twin of a valid signature, a byte off, another sighash type than allowed, and malformed input", () => {
    const good = signKaspaInputEcdsa({ tx, inputIndex: 0, utxo, privateKey: KEY });
    const r = good.slice(0, 64);
    const s = BigInt("0x" + good.slice(64, 128));
    const highS = r + (N - s).toString(16).padStart(64, "0") + "01";
    // the high-S twin is a valid ECDSA signature mathematically (noble, without the low-S rule), and still refused
    const msg = kaspaEcdsaSignatureHash(tx, 0, utxo);
    expect(secp256k1.verify(Buffer.from(highS.slice(0, 128), "hex"), msg, Buffer.from(pub, "hex"), { lowS: false, prehash: false })).toBe(true);
    expect(verifyKaspaInputSignatureEcdsa({ tx, inputIndex: 0, utxo, publicKey: pub, signature: highS })).toBe(false);
    const off = good.slice(0, 20) + (good[20] === "0" ? "1" : "0") + good.slice(21);
    expect(verifyKaspaInputSignatureEcdsa({ tx, inputIndex: 0, utxo, publicKey: pub, signature: off })).toBe(false);
    expect(verifyKaspaInputSignatureEcdsa({ tx, inputIndex: 0, utxo, publicKey: pub, signature: good.slice(0, 128) + "02" })).toBe(false);
    expect(verifyKaspaInputSignatureEcdsa({ tx, inputIndex: 0, utxo, publicKey: pub, signature: "zz" })).toBe(false);
    expect(verifyKaspaInputSignatureEcdsa({ tx, inputIndex: 0, utxo, publicKey: pub.slice(2), signature: good })).toBe(false);
  });

  it("the signature covers the lock time (another lock time, another hash)", () => {
    const other = { ...tx, lockTime: 78n };
    expect(Buffer.from(kaspaEcdsaSignatureHash(other, 0, utxo)).toString("hex")).not.toBe(Buffer.from(kaspaEcdsaSignatureHash(tx, 0, utxo)).toString("hex"));
  });

  it("a malformed private key is refused without echoing it", () => {
    let message = "";
    try {
      signKaspaInputEcdsa({ tx, inputIndex: 0, utxo, privateKey: "secret-not-hex" });
    } catch (e: any) {
      message = String(e?.message);
    }
    expect(message).toMatch(/32 bytes/);
    expect(message).not.toContain("secret-not-hex");
  });
});
