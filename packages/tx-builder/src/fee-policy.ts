import { HardkasError, effectiveFeeLimit, parseFeeRate, parseMaxFeeSompi } from "@hardkas/core";

/*
 * FEE-POLICY-1 (HK-09 / CA-TX-01 / CA-TX-03 / TX-05) · how HardKAS prices a v0 transaction, against rusty-kaspa v2.1.0:
 *
 * - The relay MINIMUM is 100 sompi per gram (mining/src/mempool/config.rs DEFAULT_MINIMUM_RELAY_TRANSACTION_FEE =
 *   100_000 sompi/kg; wallet/core/src/tx/mass.rs MINIMUM_RELAY_TRANSACTION_FEE), charged on the larger of the compute
 *   mass and the normalized transient mass (check_transaction_standard.rs: `fee_mass = compute_mass.max(normalized_
 *   transient_mass)`). The storage mass (KIP-9) has NO relay-fee floor. The kaspa-wasm Generator charges exactly this
 *   minimum when it is given no fee rate (generator.rs `calc_transaction_fees`: min relay fee of the compute mass).
 * - A fee RATE above the minimum buys mempool PRIORITY, which the mempool measures as fee / max(compute, transient,
 *   storage) normalized (consensus/core/src/tx.rs `calculated_feerate`); the node's fee estimate is in that unit. The
 *   Generator prices a given `feeRate` the same way (rate × max(compute, storage)).
 *
 * HardKAS therefore hands the Generator a fee rate ONLY when it is above the relay minimum. A rate at or below the
 * minimum (the default, the floor, the toolkit's old 1/2/5) is "pay the minimum": the Generator's own minimum on the
 * compute mass, never the floor rate multiplied by the storage mass (CA-TX-03: a 0.2 KAS payment paid 5,000,000 sompi
 * instead of the 203,600 the relay requires).
 *
 * A rate read from a node is untrusted: above `maxFeeRate` (default 10,000 sompi/g = 100 × the minimum; workspace
 * `networks[<net>].maxFeeRate`) it is refused with FEE_RATE_ABOVE_BOUND. A transaction's total fee is always within a
 * limit: the caller's or the workspace's (`maxFeeSompi`, the lower one), else the default of 10,000,000 sompi (0.1 KAS),
 * the minimum relay fee of a transaction at the wallet's maximum standard mass (100,000 g): every transaction that pays
 * the minimum fits under it; paying more than that needs an explicit limit.
 */

/** Relay minimum, sompi per gram (rusty-kaspa v2.1.0 DEFAULT_MINIMUM_RELAY_TRANSACTION_FEE / 1000). */
export const MINIMUM_RELAY_FEE_RATE_SOMPI_PER_GRAM = 100n;
/** The wallet's maximum standard transaction mass (wallet/core/src/tx/mass.rs MAXIMUM_STANDARD_TRANSACTION_MASS). */
export const WALLET_MAXIMUM_STANDARD_TRANSACTION_MASS = 100_000n;
/** Default upper bound on a fee rate read from a node: 100 × the relay minimum. */
export const DEFAULT_MAX_FEE_RATE_SOMPI_PER_GRAM = 10_000n;
/** Default total fee limit: the minimum relay fee of a transaction at the wallet's maximum standard mass (0.1 KAS). */
export const DEFAULT_MAX_FEE_SOMPI = WALLET_MAXIMUM_STANDARD_TRANSACTION_MASS * MINIMUM_RELAY_FEE_RATE_SOMPI_PER_GRAM;

/**
 * The fee rate the Generator is given for a requested rate: none at or below the relay minimum (it then charges the
 * minimum on the compute mass), the rate itself above it (priority, priced as the mempool ranks it).
 */
export function generatorFeeRate(feeRate: bigint | undefined): number | undefined {
  if (feeRate === undefined || feeRate <= MINIMUM_RELAY_FEE_RATE_SOMPI_PER_GRAM) return undefined;
  return Number(feeRate);
}

/** The bound on a node-supplied fee rate: the caller's, else the workspace's `networks[<net>].maxFeeRate`, else the default. */
export function resolveMaxFeeRate(input: { override?: unknown; config?: unknown; network?: string | undefined } = {}): bigint {
  if (input.override !== undefined && input.override !== null) return parseFeeRate(input.override, "maxFeeRate");
  const raw = input.network
    ? (input.config as { networks?: Record<string, { maxFeeRate?: unknown } | undefined> } | undefined)?.networks?.[input.network]?.maxFeeRate
    : undefined;
  if (raw !== undefined && raw !== null) return parseFeeRate(raw, `networks['${input.network}'].maxFeeRate`);
  return DEFAULT_MAX_FEE_RATE_SOMPI_PER_GRAM;
}

/** FEE_RATE_ABOVE_BOUND when a node-supplied rate is above the bound. Nothing is planned. */
export function assertFeeRateWithinBound(rate: bigint, maxFeeRate: bigint, source: string): void {
  if (rate > maxFeeRate) {
    throw new HardkasError(
      "FEE_RATE_ABOVE_BOUND",
      `${source} gave a fee rate of ${rate} sompi/gram, above the bound of ${maxFeeRate} sompi/gram ` +
        `(networks[<net>].maxFeeRate, default ${DEFAULT_MAX_FEE_RATE_SOMPI_PER_GRAM}). A node's estimate is not trusted beyond it; ` +
        `pass an explicit fee rate or raise the bound. Nothing was planned.`,
      { metadata: { feeRate: rate.toString(), maxFeeRate: maxFeeRate.toString() } }
    );
  }
}

export interface FeeLimitInForce {
  readonly maxFeeSompi: bigint;
  /** Where the limit comes from: the plan's own, the workspace's for the network, or HardKAS's default. */
  readonly source: "plan" | "network-config" | "default";
}

/** The fee limit in force: the lower of the plan's and the workspace's (`effectiveFeeLimit`), else DEFAULT_MAX_FEE_SOMPI. */
export function feeLimitInForce(input: { planMaxFeeSompi?: unknown; config?: unknown; network?: string | undefined }): FeeLimitInForce {
  const configured = effectiveFeeLimit(input);
  return configured ?? { maxFeeSompi: DEFAULT_MAX_FEE_SOMPI, source: "default" };
}

/** FEE_EXCEEDS_MAX when `feeSompi` is above the limit in force; `stage` says where (plan, sign, send). */
export function assertFeeWithinLimitInForce(feeSompi: bigint, limit: FeeLimitInForce, stage: "plan" | "sign" | "send", network?: string): void {
  if (feeSompi <= limit.maxFeeSompi) return;
  const where =
    limit.source === "plan"
      ? "the plan's maxFeeSompi"
      : limit.source === "network-config"
        ? `networks['${network ?? "?"}'].maxFeeSompi in the workspace config`
        : `HardKAS's default limit (${DEFAULT_MAX_FEE_SOMPI} sompi, the minimum fee of a maximum-mass standard transaction); set maxFeeSompi / --max-fee or networks['${network ?? "<net>"}'].maxFeeSompi to allow more`;
  throw new HardkasError(
    "FEE_EXCEEDS_MAX",
    `Refusing to ${stage}: the transaction pays a fee of ${feeSompi} sompi, above the limit of ${limit.maxFeeSompi} sompi (${where}). ` +
      `Nothing was ${stage === "plan" ? "planned" : stage === "sign" ? "signed" : "sent"}.`,
    { metadata: { stage, feeSompi: feeSompi.toString(), maxFeeSompi: limit.maxFeeSompi.toString(), source: limit.source, ...(network ? { network } : {}) } }
  );
}

/** A caller's total fee limit, validated (INVALID_MAX_FEE), or undefined. */
export function optionalMaxFeeSompi(input: unknown, context: string): bigint | undefined {
  return input === undefined || input === null ? undefined : parseMaxFeeSompi(input, context);
}
