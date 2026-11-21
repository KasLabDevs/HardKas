import { NUMBER_MARK, canonicalJson, isSchnorrSignatureHex, parseJsonKeepingNumbers } from "./canonical-json.js";
import { walletRefusal } from "./errors.js";

/*
 * R3-C · what a browser wallet returned from `signPskt` (Kastle: `signTx`), checked against the unsigned transaction HardKAS sent it
 * (NOTES-CROSSCHECK §2.3 items 2–4). BROWSER-SAFE: no Node import. This is the structural half of the check, the one a
 * page can run; the cryptographic half (each signature valid for the expected key over HardKAS's own signature hash)
 * runs where HardKAS assembles and sends (wallet-payments.ts, covenants.ts), and repeats this one first.
 *
 *  - the payload is a transaction HardKAS can read: the SDK's (safe) JSON, as a string or an object
 *    (WALLET_SIGNED_PAYLOAD_UNREADABLE otherwise);
 *  - it is the transaction sent: the same version, lock time, subnetwork, gas, payload and storage mass; the same inputs
 *    (outpoint, sequence, sig-op count, compute budget, UTXO entry: amount, script, DAA score, coinbase flag, covenant id)
 *    and outputs (value, script, covenant binding), compared losslessly (a u64 exceeds a double), the SDK's two spellings of
 *    a number or a script alike, a Toccata field left out and the same field at its default alike (an older serializer
 *    does not write them); a field HardKAS does not know, set to anything but its default, is a change
 *    (WALLET_SIGNED_TRANSACTION_CHANGED);
 *  - every input HardKAS asked to be signed carries `41 <64-byte signature> 01` (one push of a Schnorr signature and
 *    SIGHASH_ALL), not empty, not zeroed (WALLET_SIGNATURE_MISSING: a wallet returned an empty one with no error); every
 *    other input's signature script is the one sent (WALLET_SIGNED_TRANSACTION_CHANGED).
 * Only then are the signatures handed on. Nothing here trusts the wallet's word for which key signed.
 */

const MAX_SIGNED_PAYLOAD_CHARS = 5 * 1024 * 1024;
const SIGNATURE_SCRIPT = /^41([0-9a-f]{128})01$/;

/** What a check of a wallet's signed transaction hands on: per asked input, its signature script and the 65-byte signature (signature ‖ SIGHASH_ALL). */
export interface WalletSignatureCheck {
  readonly signatureScripts: Readonly<Record<number, string>>;
  readonly signatures: Readonly<Record<number, string>>;
  /** The transaction id the returned payload states, when it states one (it must be the one sent). */
  readonly txId?: string | undefined;
}

/** Number fields of the SDK's serializable transaction: a decimal string and a number are the same value. */
const NUMERIC = new Set(["version", "index", "sequence", "sigOpCount", "computeBudget", "amount", "blockDaaScore", "value", "lockTime", "gas", "storageMass", "mass"]);
/**
 * Fields a serializer may leave out at their default (the SDK deserializes an absent one as that default): the Toccata
 * fields an older serializer does not write (compute budget, covenant id and binding, storage mass), and a zero lock time
 * or gas, an empty payload, a UTXO that is not a coinbase. Absent and default are the same; any other value is compared.
 */
const DEFAULTABLE = new Set(["computeBudget", "covenantId", "covenant", "storageMass", "lockTime", "gas", "payload", "isCoinbase"]);

const TX_FIELDS = ["version", "lockTime", "subnetworkId", "gas", "payload", "storageMass"];
const INPUT_FIELDS = ["transactionId", "index", "sequence", "sigOpCount", "computeBudget"];
const UTXO_FIELDS = ["amount", "scriptPublicKey", "blockDaaScore", "isCoinbase", "covenantId"];
const OUTPUT_FIELDS = ["value", "scriptPublicKey", "covenant"];
/** Fields that are not content: compared only when both sides state them. */
const TX_METADATA = new Set(["id", "inputs", "outputs", "mass"]);
const INPUT_METADATA = new Set(["signatureScript", "utxo", "previousOutpoint"]);
const UTXO_METADATA = new Set(["address", "outpoint"]);

const unreadable = (which: "sent" | "returned", why: string) =>
  walletRefusal(
    "WALLET_SIGNED_PAYLOAD_UNREADABLE",
    `The ${which} transaction is not one HardKAS can read (${why}), so what the wallet returned cannot be checked against what it was sent. Nothing was signed or sent.`
  );
const changed = (where: string, what: string) =>
  walletRefusal(
    "WALLET_SIGNED_TRANSACTION_CHANGED",
    `The wallet returned a different transaction from the one HardKAS asked it to sign: ${where} ${what}. A signature over it is not a signature of HardKAS's transaction. Nothing was signed or sent.`,
    { where }
  );

/** A JSON value whose numbers are kept as their literal text (a string payload), or a JS value re-read the same way. */
function readTransaction(payload: unknown, which: "sent" | "returned"): any {
  let value: unknown = payload;
  for (let depth = 0; depth < 3; depth++) {
    if (typeof value === "string") {
      if (value.length === 0 || value.length > MAX_SIGNED_PAYLOAD_CHARS) throw unreadable(which, value.length === 0 ? "it is empty" : "it is larger than 5 MB");
      try {
        value = parseJsonKeepingNumbers(value);
      } catch (e: any) {
        throw unreadable(which, `not JSON: ${String(e?.message ?? e)}`);
      }
      continue;
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const o = value as Record<string, unknown>;
      if (Array.isArray(o.inputs) && Array.isArray(o.outputs)) break;
      if (typeof o.txJsonString === "string") {
        value = o.txJsonString;
        continue;
      }
    }
    break;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw unreadable(which, "no transaction object");
  if (!Array.isArray((value as any).inputs) || !Array.isArray((value as any).outputs)) throw unreadable(which, "no inputs and outputs");
  // a JS object (not text) is re-read through JSON, numbers kept as text where they still are exact
  return typeof payload === "string" ? value : parseJsonKeepingNumbers(JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
}

/** A number field as one canonical number, whichever spelling (decimal string, number, kept literal). */
function numeric(v: unknown): unknown {
  if (typeof v === "string" && v.startsWith(NUMBER_MARK)) return v;
  if (typeof v === "string" && /^-?\d+$/.test(v)) return NUMBER_MARK + v;
  if (typeof v === "number" && Number.isFinite(v)) return NUMBER_MARK + String(v);
  if (typeof v === "bigint") return NUMBER_MARK + v.toString();
  return v;
}

/** A script public key as one hex text ("vvvv" version ‖ script), whichever spelling (the safe JSON's, or { version, script }). */
function scriptText(v: unknown): unknown {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    const script = o.script ?? o.scriptPublicKey;
    const version = typeof o.version === "string" && o.version.startsWith(NUMBER_MARK) ? Number(o.version.slice(NUMBER_MARK.length)) : Number(o.version ?? 0);
    if (typeof script === "string" && Number.isInteger(version)) return version.toString(16).padStart(4, "0") + script.toLowerCase();
  }
  return typeof v === "string" ? v.toLowerCase() : v;
}

function isDefault(v: unknown): boolean {
  if (v === null || v === undefined || v === "" || v === false) return true;
  if (typeof v === "string" && v.startsWith(NUMBER_MARK)) return /^-?0+$/.test(v.slice(NUMBER_MARK.length));
  return false;
}

/** The content fields of one level, normalized; fields it does not know are reported (set to anything but a default). */
function project(obj: any, fields: readonly string[], metadata: ReadonlySet<string>): { content: Record<string, unknown>; unknown: string[] } {
  const content: Record<string, unknown> = {};
  for (const f of fields) {
    let v = obj?.[f];
    if (f === "storageMass" && (v === undefined || v === null)) v = obj?.mass; // the SDK's deprecated spelling
    if (NUMERIC.has(f)) v = numeric(v);
    if (f === "scriptPublicKey") v = scriptText(v);
    if (DEFAULTABLE.has(f) && isDefault(v)) continue;
    if (v === undefined || v === null) continue;
    content[f] = v;
  }
  const unknown = Object.entries((obj ?? {}) as Record<string, unknown>)
    .filter(([k, v]) => !fields.includes(k) && !metadata.has(k) && !isDefault(NUMERIC.has(k) ? numeric(v) : v))
    .map(([k]) => k);
  return { content, unknown };
}

const scriptOf = (input: any): string => (typeof input?.signatureScript === "string" ? input.signatureScript.toLowerCase() : "");

/** A transaction's stated id (64 hex), lower-cased. */
const idOf = (tx: any): string | undefined => (typeof tx?.id === "string" && /^[0-9a-fA-F]{64}$/.test(tx.id) ? tx.id.toLowerCase() : undefined);

/**
 * Refuses (typed) a wallet's signed transaction that is not the one sent plus the signatures asked for (see the header);
 * returns, per asked input, the signature script and the 65-byte signature.
 */
export function checkWalletSignedTransaction(sentTxJson: string, returned: unknown, inputIndexes: readonly number[]): WalletSignatureCheck {
  const sent = readTransaction(sentTxJson, "sent");
  const back = readTransaction(returned, "returned");
  const top = (tx: any) => project(tx, TX_FIELDS, TX_METADATA);
  const [s, b] = [top(sent), top(back)];
  if (b.unknown.length > 0) throw changed("the transaction", `carries field(s) HardKAS did not send: ${b.unknown.join(", ")}`);
  for (const f of TX_FIELDS) {
    if (canonicalJson(s.content[f]) !== canonicalJson(b.content[f])) throw changed("the transaction", `has another ${f}`);
  }
  const sentId = idOf(sent);
  const backId = idOf(back);
  if (sentId !== undefined && backId !== undefined && sentId !== backId) throw changed("the transaction", `has id ${backId}, HardKAS's is ${sentId}`);

  const sOut: any[] = sent.outputs;
  const bOut: any[] = back.outputs;
  if (bOut.length !== sOut.length) throw changed("the transaction", `has ${bOut.length} output(s), ${sOut.length} were sent`);
  for (const [j, o] of sOut.entries()) {
    const ps = project(o, OUTPUT_FIELDS, new Set());
    const pb = project(bOut[j], OUTPUT_FIELDS, new Set());
    if (pb.unknown.length > 0) throw changed(`output ${j}`, `carries field(s) HardKAS did not send: ${pb.unknown.join(", ")}`);
    if (canonicalJson(ps.content) !== canonicalJson(pb.content)) throw changed(`output ${j}`, "has another value, script or covenant binding");
  }

  const sIn: any[] = sent.inputs;
  const bIn: any[] = back.inputs;
  if (bIn.length !== sIn.length) throw changed("the transaction", `has ${bIn.length} input(s), ${sIn.length} were sent`);
  const asked = new Set(inputIndexes);
  for (const i of asked) {
    if (!Number.isInteger(i) || i < 0 || i >= sIn.length) throw changed("the request", `asks for input ${i}, which the transaction does not have`);
  }
  const signatureScripts: Record<number, string> = {};
  const signatures: Record<number, string> = {};
  for (const [i, input] of sIn.entries()) {
    const ps = project(input, INPUT_FIELDS, INPUT_METADATA);
    const pb = project(bIn[i], INPUT_FIELDS, INPUT_METADATA);
    if (pb.unknown.length > 0) throw changed(`input ${i}`, `carries field(s) HardKAS did not send: ${pb.unknown.join(", ")}`);
    if (canonicalJson(ps.content) !== canonicalJson(pb.content)) throw changed(`input ${i}`, "spends another outpoint, or has another sequence, sig-op count or compute budget");
    const us = project(input?.utxo, UTXO_FIELDS, UTXO_METADATA);
    const ub = project(bIn[i]?.utxo, UTXO_FIELDS, UTXO_METADATA);
    if (ub.unknown.length > 0) throw changed(`input ${i}'s UTXO entry`, `carries field(s) HardKAS did not send: ${ub.unknown.join(", ")}`);
    if (canonicalJson(us.content) !== canonicalJson(ub.content)) throw changed(`input ${i}'s UTXO entry`, "has another amount, script, DAA score, coinbase flag or covenant id");
    const sa = input?.utxo?.address;
    const ba = bIn[i]?.utxo?.address;
    if (typeof sa === "string" && typeof ba === "string" && sa.toLowerCase() !== ba.toLowerCase()) throw changed(`input ${i}'s UTXO entry`, `names address ${ba}, HardKAS's is ${sa}`);

    const script = scriptOf(bIn[i]);
    if (!asked.has(i)) {
      if (script !== scriptOf(input)) throw changed(`input ${i}`, "gained or changed a signature script though it was not asked to be signed");
      continue;
    }
    const m = SIGNATURE_SCRIPT.exec(script);
    if (!m || !isSchnorrSignatureHex(m[1])) {
      const what =
        script.length === 0
          ? "an empty signature script"
          : /^41[0-9a-f]{130}$/.test(script)
            ? `a signature whose sighash byte is 0x${script.slice(-2)}, not SIGHASH_ALL (01)`
            : `a signature script of ${script.length / 2} byte(s) that is not 41 <64-byte signature> 01`;
      throw walletRefusal(
        "WALLET_SIGNATURE_MISSING",
        `Input ${i} was asked to be signed but came back with ${what}: a transaction finalized from it would not be accepted. Nothing was signed or sent.`,
        { input: i }
      );
    }
    signatureScripts[i] = script;
    signatures[i] = script.slice(2);
  }
  return { signatureScripts, signatures, ...(backId ?? sentId ? { txId: backId ?? sentId } : {}) };
}
