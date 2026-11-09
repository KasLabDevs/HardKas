import { schnorr } from "@noble/curves/secp256k1";
import { kaspaSchnorrSignatureHash, SIGHASH_ALL, type KaspaSighashTransaction, type KaspaSighashUtxo } from "@hardkas/core";

/*
 * The Kaspa signature hash (rusty-kaspa v2.1.0 consensus/core/src/hashing/sighash.rs) comes from @hardkas/core, which
 * checks it against the upstream vectors (core/test/kaspa-sighash.test.ts) and kaspa-wasm (accounts/test/v1-draft.test.ts,
 * simulator/test/differential-wasm.test.ts). SIM-17: the simulator used to
 * carry a copy of it (232 identical lines); only the simulator's additions (signing with a dev key, hex) live here.
 */
export {
  SIGHASH_ALL,
  SIGHASH_NONE,
  SIGHASH_SINGLE,
  SIGHASH_ANYONE_CAN_PAY,
  KaspaHasher,
  kaspaSchnorrSignatureHash,
  kaspaSighashInputsFromWasm,
  verifyKaspaInputSignature,
  type KaspaSighashScript,
  type KaspaSighashTransaction,
  type KaspaSighashUtxo
} from "@hardkas/core";

/** consensus/core/src/hashing/sighash_type.rs `ALLOWED_SIG_HASH_TYPES_VALUES`. */
export const ALLOWED_SIGHASH_TYPES: ReadonlySet<number> = new Set([0x01, 0x02, 0x04, 0x81, 0x82, 0x84]);

// -- Simulator additions: signing + hex helpers -------------------------------

export function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += bytes[i]!.toString(16).padStart(2, "0");
  return out;
}

/** Alias kept for the simulator API. */
export const calcKaspaSchnorrSignatureHash = kaspaSchnorrSignatureHash;

/**
 * Signs input `inputIndex` with a 32-byte private key (hex). Returns 65 bytes hex: the BIP340 signature and its sighash
 * type, which is what a P2PK signature script pushes.
 */
export function signKaspaInput(tx: KaspaSighashTransaction, inputIndex: number, utxo: KaspaSighashUtxo, privateKeyHex: string, hashType: number = SIGHASH_ALL): string {
  const msg = kaspaSchnorrSignatureHash(tx, inputIndex, utxo, hashType);
  const sig = schnorr.sign(msg, Uint8Array.from(Buffer.from(privateKeyHex, "hex")));
  return bytesToHex(sig) + hashType.toString(16).padStart(2, "0");
}
