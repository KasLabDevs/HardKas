import { kaspaSighashInputsFromWasm, verifyKaspaInputSignature } from "@hardkas/core";
import { parseSignedTransactionPayload } from "@hardkas/artifacts";
import { officialTransactionWithUtxos } from "@hardkas/kaspa-rpc";
import type { V1NodeUtxo, V1PreflightEvidence, V1PreflightNode } from "@hardkas/accounts";

/*
 * PAYMENT-PREFLIGHT-1 · the check a payment send runs when its caller asks for it (`tx.send(signed, { preflight: true })`,
 * `hardkas tx send --preflight`): read-only, right before the broadcast, under the transaction's lock. Without it a
 * payment send is unchanged. Nothing the plan or the signed artifact says about an input is taken on trust: the node is
 * asked, at the address the plan names for the input (a wrong address only makes the check fail), and every input must be
 *  - listed unspent by the node now, without a covenant id (a payment never spends a covenant's UTXO), with the amount
 *    and the script the plan states (the recorded fee is derived from the plan's amounts), and not spent by a
 *    transaction in the node's mempool;
 *  - a Schnorr P2PK output at the node, unlocked by one 65-byte push whose signature is valid (BIP340, SIGHASH_ALL) for
 *    the transaction being sent, built by the official kaspa-wasm exactly as the client sends it, with the node's UTXO
 *    entries; a v0 input also declares the one signature operation it runs.
 * What the check cannot verify (another script kind, another unlock form or sighash type) refuses the send: only the node
 * could verify it, and the caller asked for a verified send. The node's (F1.6) components are shared with the v1 send.
 * It is one node's view at one instant and no consensus validation: absence from its mempool proves nothing about the
 * network, and the node's own script execution decides acceptance.
 */

export const PAYMENT_PREFLIGHT_GUARANTEE =
  "observer-local: at the observation point the node listed every input unspent, as the plan states it (amount and script) and without a covenant id, " +
  "none was spent by a transaction in its mempool, and each input's Schnorr signature (SIGHASH_ALL) was verified for the transaction sent against the node's UTXO entry; " +
  "one node's view, not a consensus validation: absence from its mempool does not prove absence of a competing spend on the network, and the node's own script execution decides acceptance";

/** A Schnorr P2PK script public key as the node lists it: version 0, OP_DATA_32 <x-only key> OP_CHECKSIG. */
const SCHNORR_P2PK = /^0000(20([0-9a-f]{64})ac)$/;
/** The unlock of a Schnorr P2PK input: one 65-byte push, the 64-byte signature and its sighash type. */
const SIGNATURE_PUSH = /^41([0-9a-f]{128})([0-9a-f]{2})$/;
const HEX = /^(?:[0-9a-f]{2})+$/i;

function preflightError(code: string, message: string, detail?: Record<string, unknown>): Error {
  const err = new Error(`${code}: ${message}`);
  (err as any).code = code;
  if (detail) (err as any).detail = detail;
  return err;
}
const fail = preflightError;
const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

const toBig = (v: unknown): bigint | undefined => {
  if (typeof v === "bigint") return v;
  if (typeof v === "number" && Number.isSafeInteger(v) && v >= 0) return BigInt(v);
  if (typeof v === "string" && /^\d+$/.test(v)) return BigInt(v);
  return undefined;
};

/** The script a plan states for an input, as "<2-byte version><script>" hex (a bare script is version 0); undefined when it states none. */
function planScriptOf(spk: unknown): string | undefined {
  if (spk && typeof spk === "object") {
    const o = spk as { version?: unknown; scriptPublicKey?: unknown; script?: unknown };
    const script = String(o.scriptPublicKey ?? o.script ?? "");
    return HEX.test(script) ? Number(o.version ?? 0).toString(16).padStart(4, "0") + script.toLowerCase() : undefined;
  }
  if (typeof spk !== "string" || !HEX.test(spk)) return undefined;
  const s = spk.toLowerCase();
  return s.length === 72 && s.startsWith("0000") ? s : `0000${s}`;
}

/**
 * The check (codes: SIGNED_PLAN_MISMATCH, PREFLIGHT_PLAN_INCOMPLETE, PREFLIGHT_NODE_UNAVAILABLE,
 * PENDING_SPEND_EVIDENCE_UNAVAILABLE, COVENANT_UTXO_NOT_PAYMENT_INPUT, INPUT_NOT_UNSPENT, INPUT_DIFFERS_FROM_NODE,
 * INPUT_PENDING_SPEND, PREFLIGHT_SIGNATURE_UNVERIFIABLE, INPUT_SIG_OP_COUNT_INVALID, INPUT_SIGNATURE_INVALID). `plan` is the
 * signed transaction's plan, resolved with a verified identity and already checked against it (inputs 1:1); `txId` the
 * id it is sent under (EXPECTED-TXID-1). Nothing is sent and nothing recorded when it throws.
 */
export async function preflightPaymentSend(input: {
  readonly plan: Record<string, any>;
  readonly rawTransaction: unknown;
  readonly txId: string;
  readonly node: V1PreflightNode;
}): Promise<{ evidence: V1PreflightEvidence }> {
  const { plan, node } = input;
  const parsed = parseSignedTransactionPayload(input.rawTransaction);
  if (!parsed.ok) throw fail("PREFLIGHT_SIGNATURE_UNVERIFIABLE", `the signed payload cannot be read (${parsed.reason})`);
  const signed = parsed.inputs.map((k) => k.toLowerCase());
  const byKey = new Map<string, any>();
  for (const i of (plan.inputs ?? []) as any[]) byKey.set(`${String(i?.outpoint?.transactionId).toLowerCase()}:${Number(i?.outpoint?.index)}`, i);
  const planned = signed.map((key, n) => {
    const p = byKey.get(key);
    if (!p) throw fail("SIGNED_PLAN_MISMATCH", `signed input ${n} (${key}) is not among the plan's inputs`, { input: n });
    if (p.covenantId !== undefined && p.covenantId !== null && String(p.covenantId) !== "") {
      throw fail("COVENANT_UTXO_NOT_PAYMENT_INPUT", `the plan declares input ${n} (${key}) a covenant's UTXO (${String(p.covenantId)}); a payment never spends one`, { input: n });
    }
    const address = typeof p.address === "string" && p.address ? p.address : typeof plan.from?.address === "string" && plan.from.address ? plan.from.address : undefined;
    if (!address) throw fail("PREFLIGHT_PLAN_INCOMPLETE", `the plan names no address at which to look input ${n} (${key}) up at the node`, { input: n });
    const amount = toBig(p.amountSompi);
    if (amount === undefined) throw fail("PREFLIGHT_PLAN_INCOMPLETE", `the plan states no integer amount for input ${n} (${key})`, { input: n });
    return { key, address, amount, script: planScriptOf(p.scriptPublicKey) };
  });
  const addresses = [...new Set(planned.map((p) => p.address))];
  let observedAt: bigint | undefined;
  try {
    observedAt = await node.virtualDaaScore?.();
  } catch {
    observedAt = undefined;
  }
  let listed: ReadonlyMap<string, V1NodeUtxo>;
  try {
    listed = await node.utxosByAddresses(addresses);
  } catch (e) {
    throw fail("PREFLIGHT_NODE_UNAVAILABLE", `the node's UTXOs at ${addresses.join(", ")} could not be read (${messageOf(e)})`);
  }
  let pending: ReadonlySet<string>;
  try {
    pending = new Set([...(await node.pendingSpentOutpoints(addresses))].map((o) => o.toLowerCase()));
  } catch (e) {
    throw fail("PENDING_SPEND_EVIDENCE_UNAVAILABLE", `the node's mempool could not be read, so a pending spend of an input could not be excluded (${messageOf(e)})`);
  }
  const entries = planned.map((p, n) => {
    const u = listed.get(p.key);
    if (!u) throw fail("INPUT_NOT_UNSPENT", `input ${n} (${p.key}) is not listed unspent by the node at ${p.address}`, { input: n });
    if (u.covenantId !== undefined) {
      throw fail("COVENANT_UTXO_NOT_PAYMENT_INPUT", `input ${n} (${p.key}) is a covenant UTXO (${u.covenantId}) at the node; a payment never spends one`, { input: n });
    }
    if (u.amountSompi !== p.amount) throw fail("INPUT_DIFFERS_FROM_NODE", `input ${n}: amount ${p.amount} in the plan, ${u.amountSompi} at the node`, { input: n, field: "amount" });
    if (p.script !== undefined && p.script !== u.scriptPublicKey.toLowerCase()) {
      throw fail("INPUT_DIFFERS_FROM_NODE", `input ${n}: its script differs from the node's`, { input: n, field: "scriptPublicKey" });
    }
    if (pending.has(p.key)) throw fail("INPUT_PENDING_SPEND", `input ${n} (${p.key}) is being spent by a transaction in the node's mempool`, { input: n });
    const p2pk = SCHNORR_P2PK.exec(u.scriptPublicKey.toLowerCase());
    if (!p2pk) {
      throw fail("PREFLIGHT_SIGNATURE_UNVERIFIABLE", `input ${n} (${p.key}) spends a script that is not a Schnorr P2PK at the node; this check verifies Schnorr P2PK inputs only`, { input: n });
    }
    return { key: p.key, utxo: u, publicKey: p2pk[2]! };
  });
  let built: { id: string; serialized: any };
  let tx: ReturnType<typeof kaspaSighashInputsFromWasm>["tx"];
  try {
    built = officialTransactionWithUtxos(
      input.rawTransaction,
      entries.map((e) => ({ amount: e.utxo.amountSompi, scriptPublicKey: e.utxo.scriptPublicKey }))
    );
    tx = kaspaSighashInputsFromWasm(built.serialized).tx;
  } catch (e) {
    throw fail("PREFLIGHT_SIGNATURE_UNVERIFIABLE", `the transaction could not be rebuilt as the client sends it (${messageOf(e)})`);
  }
  if (built.id !== String(input.txId).toLowerCase()) {
    throw fail("PREFLIGHT_SIGNATURE_UNVERIFIABLE", `the transaction rebuilt with the node's UTXO entries is ${built.id}, not the transaction sent (${input.txId})`);
  }
  entries.forEach((e, n) => {
    const s = built.serialized.inputs[n];
    if (`${String(s?.transactionId).toLowerCase()}:${Number(s?.index)}` !== e.key) {
      throw fail("PREFLIGHT_SIGNATURE_UNVERIFIABLE", `input ${n} of the rebuilt transaction is not ${e.key}`, { input: n });
    }
    const unlock = SIGNATURE_PUSH.exec(String(s.signatureScript ?? "").toLowerCase());
    if (!unlock) throw fail("PREFLIGHT_SIGNATURE_UNVERIFIABLE", `input ${n} (${e.key}) is not unlocked by one 65-byte signature push`, { input: n });
    if (unlock[2] !== "01") {
      throw fail("PREFLIGHT_SIGNATURE_UNVERIFIABLE", `input ${n} (${e.key}) is signed with sighash type 0x${unlock[2]}; this check verifies SIGHASH_ALL only`, { input: n });
    }
    if (tx.version < 1 && (tx.inputs[n]?.sigOpCount ?? 0) < 1) {
      throw fail("INPUT_SIG_OP_COUNT_INVALID", `input ${n} (${e.key}) declares ${tx.inputs[n]?.sigOpCount ?? 0} signature operations; a Schnorr P2PK input runs one`, { input: n });
    }
    const valid = verifyKaspaInputSignature({
      tx,
      inputIndex: n,
      utxo: { amount: e.utxo.amountSompi, scriptPublicKey: { version: 0, script: e.utxo.scriptPublicKey.toLowerCase().slice(4) } },
      publicKey: e.publicKey,
      signature: unlock[1]! + unlock[2]!
    });
    if (!valid) {
      throw fail("INPUT_SIGNATURE_INVALID", `input ${n} (${e.key}): its signature is not valid (BIP340, SIGHASH_ALL) for the transaction sent and the UTXO the node lists`, { input: n });
    }
  });
  return {
    evidence: { ...(observedAt !== undefined ? { observedAtDaaScore: observedAt.toString() } : {}), inputs: entries.length, scope: "observer-local", guarantee: PAYMENT_PREFLIGHT_GUARANTEE }
  };
}
