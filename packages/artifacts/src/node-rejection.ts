import { submitOutcomeOf } from "./tx-status.js";

/*
 * F1.6 · the class of a node rejection, as a product code. Decided from the node's own text: rusty-kaspa 2.1.0 wraps
 * every mempool and consensus rule in the RPC error "Rejected transaction <txId>: <reason>". Every class is final: none
 * is retried, and nothing is rebuilt or re-sent because of it. Only the class is read from the text (and, for a compute
 * budget, the units the node reports); the wording itself may change between releases, so a text no rule knows is
 * NODE_REJECTED_UNCLASSIFIED, never a guess.
 *
 * An answer in which the node says it ALREADY HOLDS the transaction ("already in the mempool", "already accepted by the
 * consensus") is not a rejection (submitOutcomeOf: unknown), so it has no class here.
 */

export const NODE_REJECTION_AUTHORITY =
  "rusty-kaspa v2.1.0: consensus/core/src/errors/tx.rs (TxRuleError), mining/errors/src/mempool.rs (RuleError, NonStandardError) and the script engine's errors inside 'failed to verify the signature script'";

export type NodeRejectionCode =
  | "COMPUTE_BUDGET_INSUFFICIENT"
  | "TX_VERSION_RULE_REJECTED"
  | "COVENANT_RULE_REJECTED"
  | "FEE_BELOW_NODE_MINIMUM"
  | "SCRIPT_POLICY_REJECTED"
  | "SEQUENCE_LOCK_REJECTED"
  | "LOCK_TIME_REJECTED"
  | "INPUT_ALREADY_SPENT"
  | "ORPHAN_REJECTED"
  | "NODE_REJECTED_UNCLASSIFIED";

export interface NodeRejection {
  readonly code: NodeRejectionCode;
  /** A rejection is final for the transaction: never retried, rebuilt or re-sent. */
  readonly retriable: false;
  /** COMPUTE_BUDGET_INSUFFICIENT: the script units the node counted and the limit the input committed, as it reports them. */
  readonly usedUnits?: string;
  readonly limitUnits?: string;
}

// First match wins. The order matters where one text holds two: a compute budget or a lock time failure is reported
// inside "failed to verify the signature script: …", so both are tried before the script class.
const RULES: ReadonlyArray<readonly [NodeRejectionCode, RegExp]> = [
  // txscript: "script units exceeded the amount committed in the input: used=…, limit=…"
  ["COMPUTE_BUDGET_INSUFFICIENT", /script units exceeded the amount committed/i],
  // txscript "Unsatisfied lock time: locktime requirement not satisfied …"; TxRuleError::NotFinalized
  ["LOCK_TIME_REJECTED", /unsatisfied lock ?time|locktime requirement not satisfied|input #\d+ is not finalized/i],
  // TxRuleError::SequenceLockConditionsAreNotMet
  ["SEQUENCE_LOCK_REJECTED", /sequence locks? conditions? (?:was|were) not met/i],
  // TxRuleError::CovenantBindingInV0, SigopCountInV1, ComputeBudgetInV0, UnknownTxVersion; NonStandardError::RejectVersion
  [
    "TX_VERSION_RULE_REJECTED",
    /has covenant field but transaction version is \d+|has a sig op count field with value \d+ in version \d+ transaction|has a compute budget field with value \d+ in version \d+ transaction|transaction version \d+ is (?:unknown|not in the valid range)/i
  ],
  // TxRuleError::CovenantsError ("covenants error: …", e.g. the genesis hashing of a covenant id)
  ["COVENANT_RULE_REJECTED", /covenants error/i],
  // NonStandardError::RejectInsufficientComputeFee / RejectInsufficientTransientFee
  ["FEE_BELOW_NODE_MINIMUM", /fees which is under the required amount/i],
  // RuleError::RejectDoubleSpendInMempool, RejectMissingOutpoint, RejectImpossibleOutpoint; TxRuleError::MissingTxOutpoints
  [
    "INPUT_ALREADY_SPENT",
    /already spent by transaction|lacking a matching UTXO entry|impossible to have a matching UTXO entry|missing from current utxo context/i
  ],
  // RuleError::RejectDisallowedOrphan, RejectDoubleSpendOrphan, RejectOrphanPoolIsFull. An input already spent in the
  // chain reaches the mempool as a missing outpoint: with orphans disallowed (HardKAS never allows them) it is this class.
  ["ORPHAN_REJECTED", /is an orphan where orphan is disallowed|orphan transaction [0-9a-f]+ is double spending|orphan pool .*reached the maximum/i],
  // TxRuleError::SignatureInvalid / SignatureEmpty; NonStandardError script forms, signature script size, sig op count
  [
    "SCRIPT_POLICY_REJECTED",
    /failed to verify (?:the|empty) signature script|non-standard script form|signature script size of \d+ bytes is larger|signature script is above \d+ bytes|signature operations which is more than/i
  ]
];

/** The class of a node's rejection text. Any text no rule knows is NODE_REJECTED_UNCLASSIFIED. */
export function classifyNodeRejection(message: string): NodeRejection {
  const text = String(message ?? "");
  for (const [code, rule] of RULES) {
    if (!rule.test(text)) continue;
    if (code === "COMPUTE_BUDGET_INSUFFICIENT") {
      const units = /used\s*=\s*(\d+)\s*,\s*limit\s*=\s*(\d+)/i.exec(text);
      return { code, retriable: false, ...(units ? { usedUnits: units[1]!, limitUnits: units[2]! } : {}) };
    }
    return { code, retriable: false };
  }
  return { code: "NODE_REJECTED_UNCLASSIFIED", retriable: false };
}

/** The class of a recorded submit result, only when that result is the node's rejection (submitOutcomeOf: rejected). */
export function nodeRejectionOf(submitResult: { accepted?: unknown; error?: unknown } | null | undefined): NodeRejection | undefined {
  if (submitOutcomeOf(submitResult) !== "rejected") return undefined;
  const error = submitResult?.error;
  return typeof error === "string" && error.length > 0 ? classifyNodeRejection(error) : { code: "NODE_REJECTED_UNCLASSIFIED", retriable: false };
}
