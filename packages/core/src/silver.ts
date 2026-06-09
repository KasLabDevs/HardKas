import { blake2b } from "@noble/hashes/blake2.js";
import { HardkasError } from "./index.js";

/**
 * Creates a Kaspa standard P2SH locking script (BIP16-like but with Blake2b).
 * Version is always 0 for standard script hashes in Kaspa currently,
 * although future VM versions might use 8.
 *
 * @param redeemScriptHex The compiled script hex string
 */
export function createKaspaP2shBlake2bLock(redeemScriptHex: string) {
  // Hash the RAW binary bytes of the redeem script, NOT the JSON.
  const scriptBytes = Buffer.from(redeemScriptHex, "hex");
  const redeemScriptHashBytes = blake2b(scriptBytes, { dkLen: 32 });
  const redeemScriptHash = Buffer.from(redeemScriptHashBytes).toString("hex");

  // Format: aa20 <32-byte-hash> 87
  // aa = OP_BLAKE2B
  // 20 = OP_DATA_32
  // 87 = OP_EQUAL
  const lockingScriptHex = `aa20${redeemScriptHash}87`;

  return {
    scriptPublicKeyVersion: 0,
    lockingScriptHex,
    redeemScriptHash,
    redeemScriptHex
  };
}

/**
 * Calculates the correct OP_DATA_X prefix for pushing bytes.
 * @param byteCount Number of bytes to push
 */
function getPushDataPrefix(byteCount: number): string {
  if (byteCount < 0) {
    throw new HardkasError("SILVERSCRIPT_INVALID_PUSHDATA", "Negative byte count");
  }
  if (byteCount === 0) {
    return "00"; // OP_FALSE pushes empty byte array
  }
  if (byteCount <= 75) {
    return byteCount.toString(16).padStart(2, "0");
  }
  if (byteCount <= 255) {
    return `4c${byteCount.toString(16).padStart(2, "0")}`; // OP_DATA_1
  }
  if (byteCount <= 65535) {
    // Little endian length
    const hex = byteCount.toString(16).padStart(4, "0");
    const le = hex.substring(2, 4) + hex.substring(0, 2);
    return `4d${le}`; // OP_DATA_2
  }
  // Up to 4.29GB
  const hex = byteCount.toString(16).padStart(8, "0");
  const le = hex.substring(6, 8) + hex.substring(4, 6) + hex.substring(2, 4) + hex.substring(0, 2);
  return `4e${le}`; // OP_DATA_4
}

/**
 * Creates a valid Kaspa v2.0.0 signature script for a P2SH UTXO.
 * The signature script must be push-only. It pushes any arguments,
 * followed by the raw redeem script itself.
 *
 * @param args Array of hex strings representing the arguments to push
 * @param redeemScriptHex The compiled script hex string
 */
export function createPushOnlySignatureScript(args: string[], redeemScriptHex: string): string {
  if (!redeemScriptHex || redeemScriptHex.trim() === "") {
    throw new HardkasError("SILVERSCRIPT_INVALID_REDEEM_SCRIPT", "Redeem script cannot be empty");
  }

  // Ensure redeemScript is valid hex
  if (!/^[0-9a-fA-F]*$/.test(redeemScriptHex) || redeemScriptHex.length % 2 !== 0) {
    throw new HardkasError("SILVERSCRIPT_INVALID_REDEEM_SCRIPT", "Redeem script must be valid hex");
  }

  let signatureScript = "";

  for (const argHex of args) {
    if (!/^[0-9a-fA-F]*$/.test(argHex) || argHex.length % 2 !== 0) {
      throw new HardkasError("SILVERSCRIPT_SIGNATURE_SCRIPT_NOT_PUSH_ONLY", `Argument must be valid hex: ${argHex}`);
    }
    const byteCount = argHex.length / 2;
    const prefix = getPushDataPrefix(byteCount);
    signatureScript += prefix + argHex;
  }

  // Push the redeem script at the very end
  const redeemScriptByteCount = redeemScriptHex.length / 2;
  const redeemPrefix = getPushDataPrefix(redeemScriptByteCount);
  signatureScript += redeemPrefix + redeemScriptHex;

  return signatureScript;
}
