import { HardkasError, assertMainnetTransactionsDisabled, loadManagedKaspaWasmSync } from "@hardkas/core";

/*
 * HK-13 · what HardKAS checks BEFORE the native PSKT signer (`@hardkas/pskt-native`, in hold, untouched) is called.
 * rusty-kaspa v2.1.0 wallet/pskt hands each input's `sighash_type` to the signer and leaves the policy to the caller;
 * the native bridge signs with whatever type the PSKT declares and decides key control from the PSKT's own
 * `bip32Derivations`. A PSKT comes from a third party (`deserializeSession`), so HardKAS's policy is:
 *  - every input of the PSKT declares SIGHASH_ALL (1): with NONE / SINGLE / ANYONECANPAY a coordinator can rewrite the
 *    outputs or add inputs after the signature (PSKT_SIGHASH_NOT_ALLOWED);
 *  - each input to sign carries its UTXO entry (PSKT_MISSING_UTXO) and that UTXO's script IS the key's P2PK (Schnorr,
 *    `0000 20 <x-only> ac`): ownership is decided by the script, never by `bip32Derivations`
 *    (PRIVATE_KEY_DOES_NOT_CONTROL_INPUT);
 *  - the network is known (PSKT_NETWORK_REQUIRED) and is not mainnet (MAINNET_SIGNING_DISABLED);
 *  - indexes are integers within the PSKT (PSKT_SIGNING_INPUT_OUT_OF_RANGE), the key is 32 bytes.
 * Pure: decodes the native wire format (base64 of "PSKB" + hex of the bundle JSON) without loading the `.node`.
 */

export const SIGHASH_ALL = 1;
const MAX_PSKT_PAYLOAD_BYTES = 5 * 1024 * 1024;

const refuse = (code: string, message: string, metadata?: Record<string, unknown>) =>
  new HardkasError(code, `${message} Nothing was signed.`, metadata ? { metadata } : undefined);

/** The bundle (array of PSKT inners) a native payload carries; PSKT_PAYLOAD_MALFORMED when it is not one. */
export function decodeNativePsktBundle(payloadBase64: string): any[] {
  if (typeof payloadBase64 !== "string" || payloadBase64.length === 0 || payloadBase64.length > MAX_PSKT_PAYLOAD_BYTES) {
    throw refuse("PSKT_PAYLOAD_MALFORMED", "The PSKT payload is empty or larger than 5 MB.");
  }
  let bundle: unknown;
  try {
    const text = Buffer.from(payloadBase64, "base64").toString("utf8");
    if (!text.startsWith("PSKB")) throw new Error("missing PSKB prefix");
    const hexBody = text.slice(4);
    if (!/^(?:[0-9a-fA-F]{2})*$/.test(hexBody)) throw new Error("PSKB body is not hex");
    bundle = JSON.parse(Buffer.from(hexBody, "hex").toString("utf8"));
  } catch (e: any) {
    throw refuse("PSKT_PAYLOAD_MALFORMED", `The PSKT payload is not a PSKB bundle (${e?.message ?? e}).`);
  }
  if (!Array.isArray(bundle) || bundle.length === 0 || bundle.some((inner) => !inner || !Array.isArray((inner as any).inputs))) {
    throw refuse("PSKT_PAYLOAD_MALFORMED", "The PSKB bundle holds no PSKT with inputs.");
  }
  return bundle as any[];
}

/** The key's P2PK (Schnorr) script as a UTXO entry carries it: "<2-byte version><script>" hex. */
function ownP2pkScriptHex(privateKey: Uint8Array): string {
  if (!(privateKey instanceof Uint8Array) || privateKey.length !== 32) {
    throw refuse("PSKT_SIGNING_KEY_INVALID", "The signing key must be 32 bytes.");
  }
  const k: any = loadManagedKaspaWasmSync();
  const key = new k.PrivateKey(Buffer.from(privateKey).toString("hex"));
  // the script of a P2PK address does not depend on the network prefix
  const spk = k.payToAddressScript(key.toPublicKey().toAddress("testnet-10"));
  return (Number(spk.version).toString(16).padStart(4, "0") + String(spk.script)).toLowerCase();
}

export interface NativePsktSignPreflightInput {
  readonly payloadBase64: string;
  readonly inputIndexes: readonly number[];
  readonly privateKey: Uint8Array;
  readonly networkId: string | undefined;
}

/** Refuses (typed) anything the native signer must not sign; returns what was checked. */
export function preflightNativePsktSign(input: NativePsktSignPreflightInput): { readonly inners: number; readonly inputs: readonly number[] } {
  if (typeof input.networkId !== "string" || input.networkId.trim() === "") {
    throw refuse("PSKT_NETWORK_REQUIRED", "The native PSKT signer needs the session's network (a PSKT does not say it).");
  }
  assertMainnetTransactionsDisabled("sign", [input.networkId], "native PSKT signer");
  const indexes = input.inputIndexes;
  if (!Array.isArray(indexes) || indexes.length === 0) {
    throw refuse("PSKT_SIGNING_INPUTS_REQUIRED", "inputIndexes cannot be empty.");
  }
  if (new Set(indexes).size !== indexes.length || indexes.some((i) => !Number.isSafeInteger(i) || i < 0)) {
    throw refuse("PSKT_SIGNING_INPUT_OUT_OF_RANGE", `inputIndexes ${JSON.stringify(indexes)} must be distinct non-negative integers.`);
  }
  const bundle = decodeNativePsktBundle(input.payloadBase64);
  const own = ownP2pkScriptHex(input.privateKey);
  for (const [n, inner] of bundle.entries()) {
    const inputs: any[] = inner.inputs;
    for (const [i, entry] of inputs.entries()) {
      const type = Number(entry?.sighashType);
      if (type !== SIGHASH_ALL) {
        throw refuse(
          "PSKT_SIGHASH_NOT_ALLOWED",
          `PSKT ${n} input ${i} declares sighash type ${String(entry?.sighashType)}; HardKAS signs PSKT inputs with SIGHASH_ALL only (any other type lets the coordinator change the outputs or inputs after the signature).`,
          { pskt: n, input: i, sighashType: entry?.sighashType }
        );
      }
    }
    for (const i of indexes) {
      if (i >= inputs.length) {
        throw refuse("PSKT_SIGNING_INPUT_OUT_OF_RANGE", `PSKT ${n} has ${inputs.length} input(s); input ${i} does not exist.`);
      }
      const utxo = inputs[i]?.utxoEntry;
      if (!utxo || typeof utxo.scriptPublicKey !== "string") {
        throw refuse("PSKT_MISSING_UTXO", `PSKT ${n} input ${i} carries no UTXO entry: what it spends cannot be checked.`);
      }
      if (utxo.covenantId !== undefined && utxo.covenantId !== null) {
        throw refuse("COVENANT_UTXO_NOT_PAYMENT_INPUT", `PSKT ${n} input ${i} spends a covenant's UTXO; the PSKT signer signs payments only.`);
      }
      if (String(utxo.scriptPublicKey).toLowerCase() !== own) {
        throw refuse(
          "PRIVATE_KEY_DOES_NOT_CONTROL_INPUT",
          `PSKT ${n} input ${i} is locked to script ${String(utxo.scriptPublicKey)}, not to this key's P2PK script: ownership is decided by the UTXO's script, not by the PSKT's bip32Derivations.`,
          { pskt: n, input: i }
        );
      }
    }
  }
  return { inners: bundle.length, inputs: [...indexes] };
}
