import { v1PlanError } from "./v1-plan.js";

/*
 * F1.8 · compute budgets. A v1 input commits a budget (u16); the node allows it budget × 10,000 + 9,999 script units, and
 * each unit adds 100 grams of compute mass. There is no official estimator (silverscript#243; PR #255 open), so a budget
 * is explicit, or a value certified against a node (measured at certification: never raised after a rejection). The
 * registry proposes only certified values, each with its evidence; anything else has no proposal and the plan states it.
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
