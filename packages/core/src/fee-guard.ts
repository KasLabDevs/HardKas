import { HardkasError } from "./errors.js";

// TX-FEE-GUARD-1: the two fee notions HardKAS distinguishes, and their checks.
//  - A fee RATE is sompi per gram of mass (`--fee-rate`, `feeRate`): a positive integer that fits Kaspa's u64.
//  - A fee LIMIT is a TOTAL fee in sompi (`--max-fee`, `maxFeeSompi`, `networks[<net>].maxFeeSompi`): the most a
//    transaction may pay. There is no product-wide default: no limit is imposed unless the caller or the workspace sets
//    one. When several are set, the lowest applies.

const U64_MAX = (1n << 64n) - 1n;

/**
 * A fee rate as given by a caller (CLI text, number or bigint), validated: a positive integer within u64. Anything else
 * (0, negatives, decimals, text, empty) is refused with INVALID_FEE_RATE.
 */
export function parseFeeRate(input: unknown, context = "fee rate"): bigint {
  let value: bigint | undefined;
  if (typeof input === "bigint") value = input;
  else if (typeof input === "number" && Number.isSafeInteger(input)) value = BigInt(input);
  else if (typeof input === "string" && /^\+?\d+$/.test(input.trim())) value = BigInt(input.trim());
  if (value === undefined || value <= 0n || value > U64_MAX) {
    throw new HardkasError(
      "INVALID_FEE_RATE",
      `${context}: ${String(input)} is not a valid fee rate. It must be a whole number of sompi per gram of mass, at least 1 ` +
        `(a total fee limit is set separately, in sompi, with --max-fee / maxFeeSompi). Nothing was planned or sent.`,
      { metadata: { input: String(input) } }
    );
  }
  return value;
}

/** A total fee limit in sompi, validated: a positive integer within u64 (INVALID_MAX_FEE otherwise). */
export function parseMaxFeeSompi(input: unknown, context = "fee limit"): bigint {
  let value: bigint | undefined;
  if (typeof input === "bigint") value = input;
  else if (typeof input === "number" && Number.isSafeInteger(input)) value = BigInt(input);
  else if (typeof input === "string" && /^\+?\d+$/.test(input.trim())) value = BigInt(input.trim());
  if (value === undefined || value <= 0n || value > U64_MAX) {
    throw new HardkasError(
      "INVALID_MAX_FEE",
      `${context}: ${String(input)} is not a valid total fee limit. It must be a whole number of sompi, at least 1. ` +
        `Nothing was planned, signed or sent.`,
      { metadata: { input: String(input) } }
    );
  }
  return value;
}

/** The workspace's limit for a network (`networks[<network>].maxFeeSompi`), validated; undefined when none is set. */
export function networkMaxFeeSompi(config: unknown, network: string | undefined): bigint | undefined {
  if (!network) return undefined;
  const raw = (config as { networks?: Record<string, { maxFeeSompi?: unknown } | undefined> } | undefined)?.networks?.[network]?.maxFeeSompi;
  if (raw === undefined || raw === null) return undefined;
  return parseMaxFeeSompi(raw, `networks['${network}'].maxFeeSompi`);
}

export interface FeeLimit {
  readonly maxFeeSompi: bigint;
  /** Where the limit that applies comes from. */
  readonly source: "plan" | "network-config";
}

/** The limit in force: the lowest of the plan's own (`maxFeeSompi`) and the workspace's for the network. */
export function effectiveFeeLimit(input: { planMaxFeeSompi?: unknown; config?: unknown; network?: string | undefined }): FeeLimit | undefined {
  const plan = input.planMaxFeeSompi === undefined || input.planMaxFeeSompi === null ? undefined : parseMaxFeeSompi(input.planMaxFeeSompi, "the plan's maxFeeSompi");
  const net = networkMaxFeeSompi(input.config, input.network);
  if (plan === undefined && net === undefined) return undefined;
  if (net === undefined || (plan !== undefined && plan <= net)) return { maxFeeSompi: plan!, source: "plan" };
  return { maxFeeSompi: net, source: "network-config" };
}

/** FEE_EXCEEDS_MAX when `feeSompi` is above the limit; `stage` says where (plan, sign, send). */
export function assertFeeWithinLimit(feeSompi: bigint, limit: FeeLimit | undefined, stage: "plan" | "sign" | "send", network?: string): void {
  if (!limit) return;
  if (feeSompi > limit.maxFeeSompi) {
    throw new HardkasError(
      "FEE_EXCEEDS_MAX",
      `Refusing to ${stage}: the transaction pays a fee of ${feeSompi} sompi, above the limit of ${limit.maxFeeSompi} sompi ` +
        `(${limit.source === "plan" ? "the plan's maxFeeSompi" : `networks['${network ?? "?"}'].maxFeeSompi in the workspace config`}). ` +
        `Nothing was ${stage === "plan" ? "planned" : stage === "sign" ? "signed" : "sent"}.`,
      { metadata: { stage, feeSompi: feeSompi.toString(), maxFeeSompi: limit.maxFeeSompi.toString(), source: limit.source, ...(network ? { network } : {}) } }
    );
  }
}

/**
 * The fee a plan really pays: the sum of its inputs minus its outputs and change (what a signer signs), not the fee it
 * declares. Undefined when an amount is missing or not an integer (a plan that cannot be priced from its own fields).
 */
export function planPaysFeeSompi(plan: {
  inputs?: Array<{ amountSompi?: unknown }>;
  outputs?: Array<{ amountSompi?: unknown }>;
  change?: { amountSompi?: unknown } | undefined;
}): bigint | undefined {
  const big = (v: unknown): bigint | undefined => {
    if (typeof v === "bigint") return v;
    if (typeof v === "string" && /^\d+$/.test(v)) return BigInt(v);
    if (typeof v === "number" && Number.isSafeInteger(v) && v >= 0) return BigInt(v);
    return undefined;
  };
  if (!Array.isArray(plan?.inputs) || !Array.isArray(plan?.outputs) || plan.inputs.length === 0) return undefined;
  let total = 0n;
  for (const i of plan.inputs) {
    const a = big(i?.amountSompi);
    if (a === undefined) return undefined;
    total += a;
  }
  for (const o of plan.outputs) {
    const a = big(o?.amountSompi);
    if (a === undefined) return undefined;
    total -= a;
  }
  if (plan.change) {
    const a = big(plan.change.amountSompi);
    if (a === undefined) return undefined;
    total -= a;
  }
  return total;
}
