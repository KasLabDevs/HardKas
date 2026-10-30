import { v1PlanError } from "./v1-plan.js";

/*
 * F1.8 · compute budgets. A v1 input commits a budget (u16); the node allows it budget × 10,000 + 9,999 script units, and
 * each unit adds 100 grams of compute mass. SilverScript has no estimator (silverscript#243; PR #255 open), so a budget
 * is explicit, or a value certified against a node (measured at certification: never raised after a rejection). The
 * registry proposes only certified values, each with its evidence; anything else has no proposal and the plan states it.
 * rusty-kaspa's own heuristic upper bound is available below, only when asked for (V1-ENGINE-2).
 */

export const V1_COMPUTE_UNITS_PER_BUDGET = 10_000n;
export const V1_COMPUTE_UNITS_BASE = 9_999n;

/** The script units an input with this budget may use (rusty-kaspa 2.1.0: budget × 10,000 + 9,999). */
export function v1ScriptUnitsAllowed(budget: number): bigint {
  return BigInt(checkComputeBudget(budget, "budget")) * V1_COMPUTE_UNITS_PER_BUDGET + V1_COMPUTE_UNITS_BASE;
}

/** The smallest budget whose allowance covers `usedUnits` (what a COMPUTE_BUDGET_INSUFFICIENT answer reports). */
export function v1BudgetForUnits(usedUnits: bigint): number {
  if (usedUnits <= V1_COMPUTE_UNITS_BASE) return 0;
  const budget = (usedUnits - V1_COMPUTE_UNITS_BASE + V1_COMPUTE_UNITS_PER_BUDGET - 1n) / V1_COMPUTE_UNITS_PER_BUDGET;
  if (budget > 0xffffn) throw v1PlanError("V1_PLAN_INVALID", `${usedUnits} script units need a budget above u16`);
  return Number(budget);
}

/** A budget is a u16 (V1_PLAN_INVALID otherwise). */
export function checkComputeBudget(budget: unknown, where = "computeBudget"): number {
  if (!Number.isInteger(budget) || (budget as number) < 0 || (budget as number) > 0xffff) {
    throw v1PlanError("V1_PLAN_INVALID", `${where} ${JSON.stringify(budget)} is not a u16`, { where });
  }
  return budget as number;
}

export interface V1CertifiedBudget {
  /** What it applies to: a P2PK Schnorr input, or a contract entry of one template. */
  readonly kind: "p2pk" | "contract";
  readonly templateHash?: string | undefined;
  readonly entry?: string | undefined;
  readonly budget: number;
  /** Where the value was measured (a node, its version, the evidence). */
  readonly evidence: string;
}

/**
 * Values certified against rusty-kaspad 2.1.0 simnet (the Silver corpus, fixtures/toccata-v2/silver). A P2PK input's
 * Schnorr check uses 100,000 units: budget 9 (allowance 99,999) is refused, 10 accepted. The Counter's covenant entry
 * ran within budget 0.
 */
export const V1_CERTIFIED_COMPUTE_BUDGETS: readonly V1CertifiedBudget[] = Object.freeze([
  {
    kind: "p2pk",
    budget: 10,
    evidence: "covenant-counter-transition genesis: budgets 0–9 refused (used=100000, limit=budget×10000+9999), 10 accepted; rusty-kaspad 2.1.0 simnet"
  },
  {
    kind: "contract",
    // the corpus Counter's template (compiled.template_hash of current.artifact.json, recomputed by verifySilverTemplate)
    templateHash: "12e80a77d386245a8a8db422137333918b3d6bbbb482e39f8e45302244e9bd95",
    entry: "__covenant_entrypoint_auth_bump",
    budget: 0,
    evidence: "covenant-counter-transition transition 7 → 12 accepted with budget 0; rusty-kaspad 2.1.0 simnet"
  }
]);

/** The certified budget for an input, if one exists (undefined: the plan states its budget explicitly). */
export function proposeComputeBudget(input: { readonly kind: "p2pk" | "p2sh" | "covenant"; readonly templateHash?: string; readonly entry?: string }): V1CertifiedBudget | undefined {
  if (input.kind === "p2pk") return V1_CERTIFIED_COMPUTE_BUDGETS.find((b) => b.kind === "p2pk");
  return V1_CERTIFIED_COMPUTE_BUDGETS.find((b) => b.kind === "contract" && b.templateHash === input.templateHash && b.entry === input.entry);
}

// ---------------------------------------------------------------------------------------------------------------------
// V1-ENGINE-2 · the upstream estimate, asked for explicitly (computeBudget: "estimate"), never a default.
// rusty-kaspa v2.1.0 crypto/txscript/src/lib.rs, estimate_script_units_upper_bound: the signature operations a static scan
// of the script finds × the units of one (100,000: Gram(1000) × SCRIPT_UNITS_PER_GRAM), plus 100 units per byte of the
// signature script and the script public key — "a heuristic to estimate how costly the script is going to be", in its
// own words. It can still fall short (a script pushing many large computed values): the node then refuses with
// COMPUTE_BUDGET_INSUFFICIENT, and nothing is raised or re-sent after it. One deviation, toward more budget: the
// from-stack signature checks (OpCheckSigFromStack[ECDSA]) count as signature operations, as the script engine charges
// them (check_schnorr_signature_with_msg_hash) while the upstream scan leaves them out. A script with OpZkPrecompile has
// no estimate here (its costs depend on tables HardKAS does not carry): its budget is explicit.
// ---------------------------------------------------------------------------------------------------------------------

const OP_PUSHDATA1 = 0x4c;
const OP_PUSHDATA2 = 0x4d;
const OP_PUSHDATA4 = 0x4e;
const OP_TRUE = 0x51;
const OP_16 = 0x60;
const OP_EQUAL = 0x87;
const OP_BLAKE2B = 0xaa;
const OP_ZK_PRECOMPILE = 0xa6;
const SIG_OPS = new Set([0xab, 0xac, 0xad, 0xd7, 0xd8]); // CheckSigECDSA, CheckSig, CheckSigVerify, CheckSigFromStack[ECDSA]
const MULTISIG_OPS = new Set([0xa9, 0xae, 0xaf]); // CheckMultiSigECDSA, CheckMultiSig, CheckMultiSigVerify
const MAX_PUB_KEYS_PER_MULTISIG = 20;
const SCRIPT_UNITS_PER_SIG_OP = 100_000n;
const SCRIPT_UNITS_PER_SCRIPT_BYTE = 100n;

interface ScriptOp {
  readonly op: number;
  readonly data?: Uint8Array | undefined;
}

/** The opcodes of a script, until its end or the first one that does not parse (as parse_script stops there). */
function parseScript(script: Uint8Array): { ops: ScriptOp[]; complete: boolean } {
  const ops: ScriptOp[] = [];
  let i = 0;
  while (i < script.length) {
    const op = script[i++]!;
    let len = 0;
    if (op >= 0x01 && op <= 0x4b) len = op;
    else if (op === OP_PUSHDATA1 || op === OP_PUSHDATA2 || op === OP_PUSHDATA4) {
      const n = op === OP_PUSHDATA1 ? 1 : op === OP_PUSHDATA2 ? 2 : 4;
      if (i + n > script.length) return { ops, complete: false };
      len = 0;
      for (let b = n - 1; b >= 0; b--) len = len * 256 + script[i + b]!;
      i += n;
    } else {
      ops.push({ op });
      continue;
    }
    if (i + len > script.length) return { ops, complete: false };
    ops.push({ op, data: script.subarray(i, i + len) });
    i += len;
  }
  return { ops, complete: true };
}

/** get_sig_op_count_by_opcodes, with the from-stack checks counted (see above). */
function sigOpsOf(ops: readonly ScriptOp[]): number {
  let n = 0;
  ops.forEach((o, i) => {
    if (SIG_OPS.has(o.op)) n += 1;
    else if (MULTISIG_OPS.has(o.op)) {
      const prev = i > 0 ? ops[i - 1]!.op : undefined;
      n += prev !== undefined && prev >= OP_TRUE && prev <= OP_16 ? prev - OP_TRUE + 1 : MAX_PUB_KEYS_PER_MULTISIG;
    }
  });
  return n;
}

const isP2sh = (script: Uint8Array) => script.length === 35 && script[0] === OP_BLAKE2B && script[1] === 0x20 && script[34] === OP_EQUAL;

export interface V1BudgetEstimate {
  readonly budget: number;
  readonly units: bigint;
  readonly sigOps: number;
  readonly source: "rusty-kaspa estimate_script_units_upper_bound";
}

/**
 * The upstream estimate of an input's script units and the smallest budget covering it. `signatureScriptHex` is the
 * input's final signature script (signatures have a fixed size: placeholders give the exact one); `scriptPublicKeyHex`
 * the output it spends, version-prefixed ("0000…") as HardKAS plans carry it.
 */
export function estimateV1ComputeBudget(input: { readonly signatureScriptHex: string; readonly scriptPublicKeyHex: string }): V1BudgetEstimate {
  const hexOk = (h: string) => /^(?:[0-9a-f]{2})*$/i.test(h);
  if (!hexOk(input.signatureScriptHex) || !hexOk(input.scriptPublicKeyHex) || input.scriptPublicKeyHex.length < 4) {
    throw v1PlanError("V1_PLAN_INVALID", "a budget estimate needs the signature script and the version-prefixed script public key, in hex");
  }
  const sigScript = Uint8Array.from(Buffer.from(input.signatureScriptHex, "hex"));
  const spk = Uint8Array.from(Buffer.from(input.scriptPublicKeyHex.slice(4), "hex"));
  let scanned: readonly ScriptOp[];
  if (!isP2sh(spk)) scanned = parseScript(spk).ops;
  else {
    const sig = parseScript(sigScript);
    // P2SH: the redeem script is the last push of a fully parsed, non-empty signature script (otherwise upstream counts 0)
    scanned = sig.complete && sig.ops.length > 0 && sig.ops[sig.ops.length - 1]!.data !== undefined ? parseScript(sig.ops[sig.ops.length - 1]!.data!).ops : [];
  }
  if (scanned.some((o) => o.op === OP_ZK_PRECOMPILE)) {
    throw v1PlanError("V1_COMPUTE_BUDGET_REQUIRED", "this script uses OpZkPrecompile, whose cost HardKAS does not estimate: give its compute budget explicitly");
  }
  const sigOps = sigOpsOf(scanned);
  const units = BigInt(sigOps) * SCRIPT_UNITS_PER_SIG_OP + BigInt(sigScript.length + spk.length) * SCRIPT_UNITS_PER_SCRIPT_BYTE;
  return { budget: v1BudgetForUnits(units), units, sigOps, source: "rusty-kaspa estimate_script_units_upper_bound" };
}
