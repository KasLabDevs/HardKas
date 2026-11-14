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
  | "SCRIPT_LOCK_UNSATISFIED"
  | "STORAGE_MASS_ABOVE_LIMIT"
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
  /** SCRIPT_LOCK_UNSATISFIED ("… N > M"): the value the script requires (N) and the transaction's own field (M), as reported. */
  readonly lockRequired?: string;
  readonly lockDeclared?: string;
  /** STORAGE_MASS_ABOVE_LIMIT: the storage mass the node computed and its limit, as it reports them. */
  readonly storageMass?: string;
  readonly storageMassLimit?: string;
  /** What to change, for the classes where the text alone says it (SCRIPT_LOCK_UNSATISFIED, STORAGE_MASS_ABOVE_LIMIT). */
  readonly hint?: string;
}

// First match wins. The order matters where one text holds two: a compute budget or a script lock failure is reported
// inside "failed to verify the signature script: …", so both are tried before the script class.
const RULES: ReadonlyArray<readonly [NodeRejectionCode, RegExp]> = [
  // txscript: "script units exceeded the amount committed in the input: used=…, limit=…"
  ["COMPUTE_BUDGET_INSUFFICIENT", /script units exceeded the amount committed/i],
  // txscript TxScriptError::UnsatisfiedLockTime, "Unsatisfied lock time: …" (opcodes OpCheckLockTimeVerify and
  // OpCheckSequenceVerify: "locktime requirement not satisfied -- locktime is greater than the transaction locktime: N > M",
  // "mismatched locktime types …", "transaction input is finalized", "… sequence locktime disabled bit set …"). The script
  // compared its value with the transaction's own field (the lock time for CLTV, the input's sequence for CSV): waiting
  // never changes the answer. Real text: fixtures/toccata-v2/silver/p2sh-transfer-with-timeout (a CSV spend with sequence 0).
  ["SCRIPT_LOCK_UNSATISFIED", /unsatisfied lock ?time|locktime requirement not satisfied/i],
  // TxRuleError::NotFinalized: the transaction's lock time is not reached yet (a later send can pass)
  ["LOCK_TIME_REJECTED", /input #\d+ is not finalized/i],
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
  // RuleError::RejectStorageMass / NonStandardError::RejectStorageMass, "transaction storage mass of N is larger than max
  // allowed size of L" (mining/src/mempool/check_transaction_limits.rs: L is the block's storage limit; before Toccata the
  // standard cap). Not the transient mass ("transaction transient (storage) mass of …"), not the committed-mass mismatch.
  ["STORAGE_MASS_ABOVE_LIMIT", /transaction storage mass of \d+ is larger than max allowed size of \d+/i],
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
    if (code === "SCRIPT_LOCK_UNSATISFIED") {
      const lock = /locktime requirement not satisfied[^:]*:\s*(\d+)\s*>\s*(\d+)/i.exec(text);
      const required = lock?.[1];
      return {
        code,
        retriable: false,
        ...(lock ? { lockRequired: required!, lockDeclared: lock[2]! } : {}),
        // HardKAS signs lock time 0 (LOCK_TIME_NOT_SUPPORTED otherwise), so on its own spends this is the relative lock
        hint:
          "the redeem script's time lock (CheckSequenceVerify or CheckLockTimeVerify) is above the transaction's own field. HardKAS " +
          "signs lock time 0, so on a HardKAS spend it is a relative lock (CheckSequenceVerify) and the field is the input's " +
          `sequence: declare it${required !== undefined ? ` at least ${required}` : ""} (silver spend --sequence). This transaction ` +
          "never passes, at any time: build a new one."
      };
    }
    if (code === "STORAGE_MASS_ABOVE_LIMIT") {
      const mass = /storage mass of (\d+) is larger than max allowed size of (\d+)/i.exec(text);
      return {
        code,
        retriable: false,
        ...(mass ? { storageMass: mass[1]!, storageMassLimit: mass[2]! } : {}),
        hint:
          "the storage mass (KIP-9) grows as 10^12 / amount for every output, so a small output dominates it: raise the smallest " +
          "output or merge it into another one, then build a new transaction."
      };
    }
    return { code, retriable: false };
  }
  return { code: "NODE_REJECTED_UNCLASSIFIED", retriable: false };
}

/** The class of a recorded submit result, only when that result is the node's rejection (submitOutcomeOf: rejected). */
export function nodeRejectionOf(submitResult: { accepted?: unknown; error?: unknown; transactionId?: unknown; [key: string]: unknown } | null | undefined): NodeRejection | undefined {
  if (submitOutcomeOf(submitResult) !== "rejected") return undefined;
  const error = submitResult?.error;
  return typeof error === "string" && error.length > 0 ? classifyNodeRejection(error) : { code: "NODE_REJECTED_UNCLASSIFIED", retriable: false };
}
