// Wave 2(d) · AUD-18 — the fee of a real submission is DERIVED from what the signed
// transaction consumes and produces, never copied from an estimate and never "0"
// by default. When the evidence does not allow the derivation, the submission says
// `insufficient-evidence` and why.
//
// Security review of 2(d): the derivation is only meaningful for THE transaction the
// plan authorized. Before any fee is called `derived`, the signed transaction must
// be shown to be that transaction — same inputs (1:1 by outpoint) and the same
// outputs in the same order (payment outputs, then change), each with the same
// amount and the destination script the plan's address denotes. A signed payload
// that parses but diverges is positive evidence of a plan→signed mismatch
// (`SIGNED_PLAN_MISMATCH`): `send` refuses it; nothing reinterprets the difference
// as fee.

export type SubmissionFeeEvidence =
  | {
      status: "derived";
      method: "inputs-minus-outputs";
      /** Σ amount of the consumed outpoints, taken from the plan's authenticated inputs. */
      inputsSompi: string;
      /** Σ amount of the outputs of the SIGNED transaction (payment + change). */
      outputsSompi: string;
      feeSompi: string;
      inputCount: number;
      outputCount: number;
      /** The plan whose inputs supplied the consumed amounts (the signed's authenticated parent). */
      planArtifactId: string;
    }
  | { status: "insufficient-evidence"; reason: string };

/** The outcome of checking a signed transaction against the plan that authorized it. */
export type SignedPlanCheck =
  | { ok: true; inputs: string[]; outputs: Array<{ amount: bigint; script?: string; address?: string }> }
  | { ok: false; kind: "insufficient"; reason: string }
  | { ok: false; kind: "mismatch"; code: "SIGNED_PLAN_MISMATCH"; reason: string };

const HEX64 = /^[0-9a-f]{64}$/;

const toBig = (v: unknown): bigint | undefined => {
  if (typeof v === "bigint") return v;
  if (typeof v === "number" && Number.isSafeInteger(v) && v >= 0) return BigInt(v);
  if (typeof v === "string" && /^\d+$/.test(v)) return BigInt(v);
  return undefined;
};

const outpointOf = (input: any): string | undefined => {
  const prev = input?.previousOutpoint ?? input?.previous_outpoint ?? (input?.transactionId !== undefined ? input : undefined);
  const txId = prev?.transactionId ?? prev?.txId;
  const index = prev?.index;
  if (typeof txId !== "string" || index === undefined || index === null) return undefined;
  return `${txId}:${Number(index)}`;
};

const scriptOf = (output: any): string | undefined => {
  const spk = output?.scriptPublicKey;
  const raw = typeof spk === "string" ? spk : spk?.scriptPublicKey ?? spk?.script;
  return typeof raw === "string" && /^[0-9a-fA-F]+$/.test(raw) ? raw.toLowerCase() : undefined;
};

// --- Kaspa addresses → standard scripts (no WASM; only what a plan address denotes) ---

const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

/** Decodes a Kaspa bech32-style address into its version byte and payload (checksum not verified here: the node does). */
export function decodeKaspaAddress(address: string): { prefix: string; version: number; payload: Uint8Array } | undefined {
  if (typeof address !== "string") return undefined;
  const sep = address.lastIndexOf(":");
  if (sep <= 0) return undefined;
  const prefix = address.slice(0, sep).toLowerCase();
  const data = address.slice(sep + 1).toLowerCase();
  if (data.length < 9) return undefined;
  const values: number[] = [];
  for (const ch of data) {
    const v = CHARSET.indexOf(ch);
    if (v < 0) return undefined;
    values.push(v);
  }
  const groups = values.slice(0, values.length - 8); // the last 8 characters are the checksum
  let acc = 0;
  let bits = 0;
  const out: number[] = [];
  for (const v of groups) {
    acc = ((acc << 5) | v) & 0x1fff;
    bits += 5;
    while (bits >= 8) {
      bits -= 8;
      out.push((acc >>> bits) & 0xff);
    }
  }
  if (bits >= 5 || ((acc << (8 - bits)) & 0xff) !== 0) return undefined;
  if (out.length < 2) return undefined;
  return { prefix, version: out[0]!, payload: Uint8Array.from(out.slice(1)) };
}

/**
 * The standard scriptPublicKey a Kaspa address denotes:
 * version 0 (Schnorr P2PK, 32 bytes) → `20 <key> ac`; version 1 (ECDSA P2PK, 33 bytes) →
 * `21 <key> ab`; version 8 (P2SH, 32 bytes) → `aa20 <hash> 87`. Undefined for anything else.
 */
export function expectedScriptPublicKeyHex(address: string): string | undefined {
  const decoded = decodeKaspaAddress(address);
  if (!decoded) return undefined;
  const hex = Array.from(decoded.payload, (b) => b.toString(16).padStart(2, "0")).join("");
  if (decoded.version === 0 && decoded.payload.length === 32) return `20${hex}ac`;
  if (decoded.version === 1 && decoded.payload.length === 33) return `21${hex}ab`;
  if (decoded.version === 8 && decoded.payload.length === 32) return `aa20${hex}87`;
  return undefined;
}

/** Parses a signed payload into `{ inputs: outpoint keys, outputs: amounts (+script/address) }`, or explains why it cannot. */
export function parseSignedTransactionPayload(
  payload: unknown
): { ok: true; inputs: string[]; outputs: Array<{ amount: bigint; script?: string; address?: string }> } | { ok: false; reason: string } {
  let parsed: any = payload;
  if (typeof payload === "string") {
    try {
      parsed = JSON.parse(payload);
    } catch {
      return { ok: false, reason: "the signed payload is not a JSON transaction (opaque hex or unknown encoding)" };
    }
  }
  let depth = 0;
  while (typeof parsed === "string" && depth < 3) {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return { ok: false, reason: "the signed payload is not a JSON transaction" };
    }
    depth += 1;
  }
  const tx = parsed?.outputs ? parsed : parsed?.tx?.inner ?? parsed?.inner ?? parsed?.transaction;
  if (!tx || !Array.isArray(tx.inputs) || !Array.isArray(tx.outputs)) {
    return { ok: false, reason: "the signed payload carries no inputs/outputs arrays" };
  }
  const inputs: string[] = [];
  for (const i of tx.inputs) {
    const key = outpointOf(i);
    if (!key) return { ok: false, reason: "a signed input has no previous outpoint" };
    inputs.push(key);
  }
  const outputs: Array<{ amount: bigint; script?: string; address?: string }> = [];
  for (const o of tx.outputs) {
    const amount = toBig(o?.amount ?? o?.value ?? o?.amountSompi);
    if (amount === undefined) return { ok: false, reason: "a signed output has no integer amount" };
    const script = scriptOf(o);
    const address = typeof o?.verboseData?.scriptPublicKeyAddress === "string" ? o.verboseData.scriptPublicKeyAddress : typeof o?.address === "string" ? o.address : undefined;
    outputs.push({ amount, ...(script ? { script } : {}), ...(address ? { address } : {}) });
  }
  if (inputs.length === 0 || outputs.length === 0) return { ok: false, reason: "the signed transaction has no inputs or no outputs" };
  return { ok: true, inputs, outputs };
}

type PlanLike = {
  contentHash?: string;
  inputs?: Array<{ outpoint: { transactionId: string; index: number }; amountSompi: string | bigint }>;
  outputs?: Array<{ address: string; amountSompi: string | bigint }>;
  change?: { address: string; amountSompi: string | bigint } | undefined;
};

/**
 * Is the signed transaction THE transaction the plan authorized? Inputs must match
 * 1:1 by outpoint; outputs must be exactly the plan's payment outputs followed by its
 * change (same order, same amounts, same destination script). A payload that cannot
 * be parsed is `insufficient`; one that parses and differs is a `mismatch`.
 */
export function checkSignedAgainstPlan(
  signedTransaction: { format?: string; payload?: unknown } | undefined,
  plan: PlanLike | undefined
): SignedPlanCheck {
  const insufficient = (reason: string): SignedPlanCheck => ({ ok: false, kind: "insufficient", reason });
  const mismatch = (reason: string): SignedPlanCheck => ({ ok: false, kind: "mismatch", code: "SIGNED_PLAN_MISMATCH", reason });
  if (!plan || typeof plan.contentHash !== "string" || !HEX64.test(plan.contentHash)) {
    return insufficient("the signed transaction's plan (its authenticated parent) could not be resolved with a verified identity");
  }
  if (!signedTransaction || signedTransaction.payload === undefined) {
    return insufficient("the signed artifact carries no transaction payload");
  }
  const parsed = parseSignedTransactionPayload(signedTransaction.payload);
  if (!parsed.ok) return insufficient(parsed.reason);

  // Inputs: 1:1 by outpoint, both directions.
  const planInputs = new Map<string, bigint>();
  for (const pi of plan.inputs ?? []) {
    const amount = toBig(pi.amountSompi);
    if (amount === undefined) return insufficient("a plan input has no integer amount");
    planInputs.set(`${pi.outpoint.transactionId}:${Number(pi.outpoint.index)}`, amount);
  }
  if (planInputs.size === 0) return insufficient("the plan records no inputs, so the consumed amounts are unknown");
  const signedSet = new Set(parsed.inputs);
  if (signedSet.size !== parsed.inputs.length) return mismatch("the signed transaction repeats an input outpoint");
  for (const key of parsed.inputs) {
    if (!planInputs.has(key)) return mismatch(`signed input ${key} is not among the plan's inputs`);
  }
  for (const key of planInputs.keys()) {
    if (!signedSet.has(key)) return mismatch(`plan input ${key} is not spent by the signed transaction`);
  }

  // Outputs: the plan's payment outputs, then its change — exact order, amount and destination.
  const expected: Array<{ role: string; address: string; amount: bigint }> = [];
  (plan.outputs ?? []).forEach((o, i) => {
    const amount = toBig(o.amountSompi);
    if (amount !== undefined) expected.push({ role: `output[${i}]`, address: o.address, amount });
  });
  if (expected.length !== (plan.outputs ?? []).length) return insufficient("a plan output has no integer amount");
  if (plan.change) {
    const amount = toBig(plan.change.amountSompi);
    if (amount === undefined) return insufficient("the plan's change has no integer amount");
    expected.push({ role: "change", address: plan.change.address, amount });
  }
  if (parsed.outputs.length !== expected.length) {
    return mismatch(`the signed transaction has ${parsed.outputs.length} output(s) but the plan authorizes ${expected.length}`);
  }
  for (let i = 0; i < expected.length; i++) {
    const want = expected[i]!;
    const got = parsed.outputs[i]!;
    if (got.amount !== want.amount) {
      return mismatch(`${want.role}: the signed transaction pays ${got.amount} but the plan authorizes ${want.amount}`);
    }
    const wantScript = expectedScriptPublicKeyHex(want.address);
    if (wantScript !== undefined) {
      if (got.script !== undefined) {
        if (got.script !== wantScript) return mismatch(`${want.role}: the signed destination script differs from the plan's ${want.address}`);
      } else if (got.address !== undefined) {
        if (got.address.toLowerCase() !== want.address.toLowerCase()) return mismatch(`${want.role}: the signed destination ${got.address} differs from the plan's ${want.address}`);
      } else {
        return mismatch(`${want.role}: the signed output carries no destination script to compare with the plan's ${want.address}`);
      }
    } else if (got.address !== undefined) {
      if (got.address.toLowerCase() !== want.address.toLowerCase()) return mismatch(`${want.role}: the signed destination ${got.address} differs from the plan's ${want.address}`);
    } else {
      return mismatch(`${want.role}: the plan's destination ${want.address} is not a standard Kaspa address and the signed output carries no address to compare`);
    }
  }
  return { ok: true, inputs: parsed.inputs, outputs: parsed.outputs };
}

/**
 * fee = Σ(consumed) − Σ(produced), ONLY for a signed transaction shown to be the one the
 * plan authorized (`checkSignedAgainstPlan`). A mismatch is not priced: the caller must
 * refuse the send. Unparseable/missing evidence yields `insufficient-evidence`.
 */
export function deriveSubmissionFee(input: {
  signedTransaction: { format?: string; payload?: unknown } | undefined;
  plan: PlanLike | undefined;
}): SubmissionFeeEvidence | { status: "mismatch"; code: "SIGNED_PLAN_MISMATCH"; reason: string } {
  const check = checkSignedAgainstPlan(input.signedTransaction, input.plan);
  if (!check.ok) {
    return check.kind === "mismatch"
      ? { status: "mismatch", code: "SIGNED_PLAN_MISMATCH", reason: check.reason }
      : { status: "insufficient-evidence", reason: check.reason };
  }
  const planInputs = new Map<string, bigint>();
  for (const pi of input.plan!.inputs ?? []) planInputs.set(`${pi.outpoint.transactionId}:${Number(pi.outpoint.index)}`, toBig(pi.amountSompi)!);
  const inputsSompi = check.inputs.reduce((s, key) => s + planInputs.get(key)!, 0n);
  const outputsSompi = check.outputs.reduce((s, o) => s + o.amount, 0n);
  if (outputsSompi > inputsSompi) return { status: "insufficient-evidence", reason: `outputs (${outputsSompi}) exceed the consumed inputs (${inputsSompi}); the amounts are inconsistent` };
  return {
    status: "derived",
    method: "inputs-minus-outputs",
    inputsSompi: inputsSompi.toString(),
    outputsSompi: outputsSompi.toString(),
    feeSompi: (inputsSompi - outputsSompi).toString(),
    inputCount: check.inputs.length,
    outputCount: check.outputs.length,
    planArtifactId: input.plan!.contentHash!
  };
}

/** Pure arithmetic coherence of a recorded fee (the verifier's check). */
export function checkSubmissionFeeCoherence(fee: unknown): { ok: true } | { ok: false; message: string } {
  const f: any = fee;
  if (f === undefined || f === null) return { ok: true };
  if (f.status === "insufficient-evidence") {
    return typeof f.reason === "string" && f.reason.length > 0 ? { ok: true } : { ok: false, message: "an insufficient-evidence fee must state its reason" };
  }
  if (f.status !== "derived") return { ok: false, message: `unknown fee status ${JSON.stringify(f.status)}` };
  const i = toBig(f.inputsSompi);
  const o = toBig(f.outputsSompi);
  const fee_ = toBig(f.feeSompi);
  if (i === undefined || o === undefined || fee_ === undefined) return { ok: false, message: "a derived fee needs integer inputsSompi, outputsSompi and feeSompi" };
  if (i - o !== fee_) return { ok: false, message: `feeSompi ${fee_} is not inputsSompi − outputsSompi (${i - o})` };
  if (f.method !== "inputs-minus-outputs") return { ok: false, message: `unknown fee derivation method ${JSON.stringify(f.method)}` };
  if (typeof f.planArtifactId !== "string" || !HEX64.test(f.planArtifactId)) return { ok: false, message: "a derived fee names the plan by its 64-hex artifactId" };
  return { ok: true };
}
