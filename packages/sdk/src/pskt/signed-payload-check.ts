import { HardkasError, loadManagedKaspaWasmSync } from "@hardkas/core";
// R3-C · the lossless JSON reading, the canonical text and the signature shape, shared with the browser wallet check
// (wallets/signed-transaction-check.ts): one comparison for every "sent vs returned" check, not a copy
import { canonicalJson as canon, isSchnorrSignatureHex, parseJsonKeepingNumbers } from "../wallets/canonical-json.js";

/*
 * NOTES-CROSSCHECK §2.3 item 4 (2026-11-14) · `pskt.signSession` recorded whatever the adapter handed back. A signer
 * (a native addon, a wallet behind an adapter) can return an input it was asked to sign with no signature at all — a
 * wallet extension did, with no error — or a PSKT that is not the one it was sent. Before the signed payload is recorded,
 * HardKAS now reads it:
 *  - it is a PSKB bundle like the one sent (PSKT_SIGNED_PAYLOAD_UNREADABLE otherwise);
 *  - every PSKT in it describes the same transaction: the same inputs (outpoint, sequence, minimum time, sighash type,
 *    sig-op count, UTXO entry, redeem script, and any other field that is not signing metadata), the same outputs
 *    (amount, script, covenant), the same transaction version, fallback lock time and payload, hence the same lock time
 *    and output values (PSKT_SIGNED_TRANSACTION_CHANGED). Amounts and sequences are compared as written, losslessly
 *    (a u64 exceeds a double); a field absent and the same field null are the same (the Rust round trip writes nulls);
 *  - every input it asked to sign carries a non-empty 64-byte Schnorr signature by the signer's key
 *    (PSKT_SIGNATURE_MISSING); a partial signature that was there before is still there, unchanged, and no input it did
 *    not ask to sign gained or lost one (PSKT_SIGNED_TRANSACTION_CHANGED).
 * Only a payload that passes is recorded as the session's next revision.
 */

const MAX_PSKT_PAYLOAD_BYTES = 5 * 1024 * 1024;

const refuse = (code: string, message: string, metadata?: Record<string, unknown>) =>
  new HardkasError(code, `${message} The signed payload was not recorded.`, metadata ? { metadata } : undefined);

/** The PSKT bundle of a "pskt-binary-base64" payload (base64 of "PSKB" + hex of the bundle JSON), numbers kept. */
function bundleOf(payload: unknown, which: "sent" | "returned"): any[] {
  const p = payload as { format?: unknown; data?: unknown } | undefined;
  const fail = (why: string) =>
    refuse(
      "PSKT_SIGNED_PAYLOAD_UNREADABLE",
      `The ${which} payload is not a PSKB bundle HardKAS can read (${why}), so what the signer returned cannot be checked against what it was sent.`
    );
  if (p?.format !== "pskt-binary-base64" || typeof p.data !== "string" || p.data.length === 0 || p.data.length > MAX_PSKT_PAYLOAD_BYTES) {
    throw fail(`format '${String(p?.format)}'`);
  }
  let bundle: unknown;
  try {
    const text = Buffer.from(p.data, "base64").toString("utf8");
    if (!text.startsWith("PSKB")) throw new Error("missing PSKB prefix");
    const hexBody = text.slice(4);
    if (!/^(?:[0-9a-fA-F]{2})*$/.test(hexBody)) throw new Error("PSKB body is not hex");
    bundle = parseJsonKeepingNumbers(Buffer.from(hexBody, "hex").toString("utf8"));
  } catch (e: any) {
    throw fail(String(e?.message ?? e));
  }
  if (!Array.isArray(bundle) || bundle.length === 0 || bundle.some((inner) => !inner || !Array.isArray((inner as any).inputs))) {
    throw fail("no PSKT with inputs");
  }
  return bundle as any[];
}

/** Fields of a PSKT input / output that are signing metadata, not transaction content. */
const INPUT_METADATA = new Set(["partialSigs", "bip32Derivations", "finalScriptSig", "proprietaries", "unknowns"]);
const OUTPUT_METADATA = new Set(["bip32Derivations", "proprietaries", "unknowns", "redeemScript"]);

const without = (obj: unknown, skip: ReadonlySet<string>) =>
  Object.fromEntries(Object.entries((obj ?? {}) as Record<string, unknown>).filter(([k]) => !skip.has(k)));

/** The partial signatures of an input, keyed by the signer's public key (lower-case hex). */
function partialSigsOf(input: any): Map<string, unknown> {
  const sigs = input?.partialSigs;
  const map = new Map<string, unknown>();
  if (sigs && typeof sigs === "object" && !Array.isArray(sigs)) {
    for (const [k, v] of Object.entries(sigs)) if (v !== null && v !== undefined) map.set(k.toLowerCase(), v);
  }
  return map;
}

/** A partial signature as the native signer writes it: { "schnorr": <64 bytes hex> }, not empty, not all zeros. */
function isSchnorrSignature(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length !== 1 || entries[0]![0].toLowerCase() !== "schnorr") return false;
  return isSchnorrSignatureHex(entries[0]![1]);
}

/**
 * The compressed public key (hex) of a 32-byte signing key, as a PSKT keys its partial signatures; undefined for anything
 * else (the adapter refuses such a key itself). Called before the adapter runs: the native adapter zeroes the key after.
 */
export function psktSignerPublicKey(keyMaterial: Uint8Array | undefined): string | undefined {
  if (!(keyMaterial instanceof Uint8Array) || keyMaterial.length !== 32) return undefined;
  try {
    const k: any = loadManagedKaspaWasmSync();
    return String(new k.PrivateKey(Buffer.from(keyMaterial).toString("hex")).toPublicKey().toString()).toLowerCase();
  } catch {
    return undefined;
  }
}

/**
 * Refuses (typed) a signed payload that is not the payload sent plus the signatures asked for (see the header).
 * `signerPublicKey`: the compressed key of the signer (psktSignerPublicKey); without it, each input asked for must have
 * gained at least one well-formed signature.
 */
export function assertSignedPsktPayload(
  sent: unknown,
  returned: unknown,
  inputIndexes: readonly number[],
  signerPublicKey: string | undefined
): void {
  const before = bundleOf(sent, "sent");
  const after = bundleOf(returned, "returned");
  const changed = (where: string, what: string) =>
    refuse(
      "PSKT_SIGNED_TRANSACTION_CHANGED",
      `The signer returned a different transaction from the one it was sent: ${where} ${what}. A signature over it would not be a signature of the session's transaction.`,
      { where }
    );
  if (after.length !== before.length) throw changed("the bundle", `holds ${after.length} PSKT(s), ${before.length} were sent`);
  const asked = new Set(inputIndexes);
  const signer = signerPublicKey?.toLowerCase();
  for (const [n, b] of before.entries()) {
    const a = after[n]!;
    const bg = b.global ?? {};
    const ag = a.global ?? {};
    for (const field of ["txVersion", "fallbackLockTime", "payload"]) {
      if (canon(bg[field]) !== canon(ag[field])) throw changed(`PSKT ${n}`, `has another ${field}`);
    }
    const bOut: any[] = Array.isArray(b.outputs) ? b.outputs : [];
    const aOut: any[] = Array.isArray(a.outputs) ? a.outputs : [];
    if (aOut.length !== bOut.length) throw changed(`PSKT ${n}`, `has ${aOut.length} output(s), ${bOut.length} were sent`);
    for (const [j, o] of bOut.entries()) {
      if (canon(without(o, OUTPUT_METADATA)) !== canon(without(aOut[j], OUTPUT_METADATA))) {
        throw changed(`PSKT ${n} output ${j}`, "has another amount, script or covenant");
      }
    }
    const bIn: any[] = b.inputs;
    const aIn: any[] = a.inputs;
    if (aIn.length !== bIn.length) throw changed(`PSKT ${n}`, `has ${aIn.length} input(s), ${bIn.length} were sent`);
    for (const [i, input] of bIn.entries()) {
      if (canon(without(input, INPUT_METADATA)) !== canon(without(aIn[i], INPUT_METADATA))) {
        throw changed(`PSKT ${n} input ${i}`, "spends another outpoint or UTXO, or has another sequence, minimum time, sighash type or sig-op count");
      }
      const sigsBefore = partialSigsOf(input);
      const sigsAfter = partialSigsOf(aIn[i]);
      for (const [pk, sig] of sigsBefore) {
        if (!sigsAfter.has(pk) || canon(sigsAfter.get(pk)) !== canon(sig)) {
          throw changed(`PSKT ${n} input ${i}`, `lost or changed the partial signature of ${pk} it carried`);
        }
      }
      if (!asked.has(i)) {
        if (sigsAfter.size !== sigsBefore.size) throw changed(`PSKT ${n} input ${i}`, "gained a signature though it was not asked to be signed");
        continue;
      }
      const ok =
        signer !== undefined
          ? isSchnorrSignature(sigsAfter.get(signer))
          : [...sigsAfter].some(([pk, sig]) => !sigsBefore.has(pk) && isSchnorrSignature(sig));
      if (!ok) {
        throw refuse(
          "PSKT_SIGNATURE_MISSING",
          `PSKT ${n} input ${i} was asked to be signed but came back without a signature${signer ? ` by ${signer}` : ""} ` +
            "(a non-empty 64-byte Schnorr signature): a transaction finalized from it would not be accepted.",
          { pskt: n, input: i }
        );
      }
    }
  }
}
