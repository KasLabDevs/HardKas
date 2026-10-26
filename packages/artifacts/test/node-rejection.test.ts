import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { classifyNodeRejection, nodeRejectionOf, type NodeRejectionCode } from "../src/index.js";

// -----------------------------------------------------------------------------
// F1.6 · the node rejection classifier as product code. Vectors: every rejection text in the Silver corpus (real
// rusty-kaspad 2.1.0 answers, fixtures/toccata-v2/silver/*/evidence.json), each with the class this table assigns by
// hand — not computed by the code under test — including the P2SH cases the corpus recorded without a class. Then the
// rusty-kaspa 2.1.0 format strings of the rules a send meets (double spend, orphan, missing outpoint, fee, version) —
// these are upstream texts, not yet captured from a node (simnet capture is pending). 100 % of the vectors must match.
// -----------------------------------------------------------------------------

const repoRoot = path.resolve(__dirname, "../../..");
const CORPUS = path.join(repoRoot, "fixtures", "toccata-v2", "silver");

/** Every `nodeError` string in a corpus evidence file, with its JSON path. */
function nodeErrors(file: string): Array<{ where: string; message: string }> {
  const out: Array<{ where: string; message: string }> = [];
  const walk = (o: any, p: string) => {
    if (Array.isArray(o)) o.forEach((x, i) => walk(x, `${p}[${i}]`));
    else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) k === "nodeError" && typeof v === "string" ? out.push({ where: p, message: v }) : walk(v, `${p}.${k}`);
  };
  walk(JSON.parse(fs.readFileSync(file, "utf8")), "");
  return out;
}

// The class of each corpus rejection, by case and path (assigned by reading the text, independently of the classifier)
const EXPECTED: Record<string, Record<string, NodeRejectionCode>> = {
  "covenant-counter-transition": {
    ...Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`.genesis.computeBudgetCertification.attempts[${i}]`, "COMPUTE_BUDGET_INSUFFICIENT" as const])),
    ".transition.computeBudgetCertification.lowerBoundFromWrongState[0]": "SCRIPT_POLICY_REJECTED",
    ".controls.bindingInV0": "TX_VERSION_RULE_REJECTED",
    ".controls.insufficientComputeBudget": "COMPUTE_BUDGET_INSUFFICIENT",
    ".controls.successorWithoutBinding": "SCRIPT_POLICY_REJECTED",
    ".controls.wrongCovenantId": "COVENANT_RULE_REJECTED",
    ".controls.wrongState": "SCRIPT_POLICY_REJECTED"
  },
  "p2sh-escrow-refund": {
    ".controls.wrongSecondSigner": "SCRIPT_POLICY_REJECTED",
    ".controls.wrongAmount": "SCRIPT_POLICY_REJECTED"
  },
  "p2sh-signed-release": {
    ".negativeControls[0]": "SCRIPT_POLICY_REJECTED",
    ".negativeControls[1]": "SCRIPT_POLICY_REJECTED"
  },
  "p2sh-transfer-with-timeout": {
    ".transferBranch.beforeTimeout.rejectedWrongKey": "SCRIPT_POLICY_REJECTED",
    ".reclaimBranch.beforeThreshold.attempts[0]": "SEQUENCE_LOCK_REJECTED",
    ".reclaimBranch.beforeThreshold.attempts[1]": "LOCK_TIME_REJECTED",
    ".reclaimBranch.afterThreshold.attempts[0]": "SCRIPT_POLICY_REJECTED"
  }
};

const TX = "3b93691ca6ea47a6601e12559b6195a8c38bb1821b596cc6cd2ad4d3e2f6b917";
const OTHER = "d".repeat(64);
// rusty-kaspa v2.1.0 format strings (mining/errors/src/mempool.rs, consensus/core/src/errors/tx.rs), wrapped as the RPC does
const UPSTREAM: Array<[string, NodeRejectionCode]> = [
  [`Rejected transaction ${TX}: output ${"c".repeat(64)}:0 already spent by transaction ${OTHER} in the mempool`, "INPUT_ALREADY_SPENT"],
  [`Rejected transaction ${TX}: at least one outpoint of the transaction is lacking a matching UTXO entry`, "INPUT_ALREADY_SPENT"],
  [`Rejected transaction ${TX}: at least one outpoint of the transaction is impossible to have a matching UTXO entry`, "INPUT_ALREADY_SPENT"],
  [`Rejected transaction ${TX}: outpoints corresponding to some transaction inputs are missing from current utxo context`, "INPUT_ALREADY_SPENT"],
  [`Rejected transaction ${TX}: transaction ${TX} is an orphan where orphan is disallowed`, "ORPHAN_REJECTED"],
  [`Rejected transaction ${TX}: orphan transaction ${TX} is double spending an input from already existing orphan ${OTHER}`, "ORPHAN_REJECTED"],
  [`Rejected transaction ${TX}: transaction ${TX} is not standard: transaction has 1000 fees which is under the required amount of 71900 for compute mass 719`, "FEE_BELOW_NODE_MINIMUM"],
  [`Rejected transaction ${TX}: transaction input #0 has a sig op count field with value 1 in version 1 transaction`, "TX_VERSION_RULE_REJECTED"],
  [`Rejected transaction ${TX}: transaction input #0 has a compute budget field with value 10 in version 0 transaction`, "TX_VERSION_RULE_REJECTED"],
  [`Rejected transaction ${TX}: transaction ${TX} is not standard: transaction version 2 is not in the valid range of 0-1`, "TX_VERSION_RULE_REJECTED"],
  [`Rejected transaction ${TX}: transaction input #0 is not finalized`, "LOCK_TIME_REJECTED"],
  [`Rejected transaction ${TX}: failed to verify empty signature script. Inner error: script returned early`, "SCRIPT_POLICY_REJECTED"],
  [`Rejected transaction ${TX}: transaction ${TX} is not standard: transaction output #0: non-standard script form`, "SCRIPT_POLICY_REJECTED"],
  [`Rejected transaction ${TX}: calculated contextual mass (including storage mass) 4083 is not equal to the committed mass field 1083`, "NODE_REJECTED_UNCLASSIFIED"],
  [`Rejected transaction ${TX}: something no rule knows`, "NODE_REJECTED_UNCLASSIFIED"]
];

describe("F1.6 · classifyNodeRejection (product)", () => {
  it("NR-1 every rejection text of the Silver corpus gets the class assigned to it (100 %), the P2SH cases included", () => {
    let total = 0;
    for (const [c, table] of Object.entries(EXPECTED)) {
      const found = nodeErrors(path.join(CORPUS, c, "evidence.json"));
      expect(found.map((f) => f.where).sort(), c).toEqual(Object.keys(table).sort());
      for (const { where, message } of found) {
        expect(classifyNodeRejection(message).code, `${c}${where}: ${message}`).toBe(table[where]);
        total++;
      }
    }
    expect(total).toBe(24);
  });

  it("NR-2 the ten 'script units exceeded' answers of the genesis certification give the exact units used and the limit", () => {
    const attempts = nodeErrors(path.join(CORPUS, "covenant-counter-transition", "evidence.json")).filter((f) => f.where.startsWith(".genesis.computeBudgetCertification.attempts"));
    expect(attempts).toHaveLength(10);
    attempts.forEach(({ message }, i) => {
      expect(classifyNodeRejection(message)).toEqual({ code: "COMPUTE_BUDGET_INSUFFICIENT", retriable: false, usedUnits: "100000", limitUnits: String((i + 1) * 10000 - 1) });
    });
  });

  it("NR-3 the rusty-kaspa 2.1.0 texts a send meets (upstream format strings) get their class; nothing is retriable", () => {
    for (const [message, code] of UPSTREAM) {
      const r = classifyNodeRejection(message);
      expect(r.code, message).toBe(code);
      expect(r.retriable).toBe(false);
    }
  });

  it("NR-4 only a recorded rejection has a class: accepted, 'already in the mempool / accepted', a lost answer have none", () => {
    expect(nodeRejectionOf({ accepted: true, transactionId: TX })).toBeUndefined();
    expect(nodeRejectionOf({ accepted: false, error: `Rejected transaction ${TX}: transaction ${TX} is already in the mempool` })).toBeUndefined();
    expect(nodeRejectionOf({ accepted: false, error: `Rejected transaction ${TX}: transaction ${TX} was already accepted by the consensus` })).toBeUndefined();
    expect(nodeRejectionOf({ accepted: false, error: "RPC request timed out after 30000ms (socket hang up)" })).toBeUndefined();
    expect(nodeRejectionOf({ accepted: false, error: UPSTREAM[0]![0] })?.code).toBe("INPUT_ALREADY_SPENT");
    expect(nodeRejectionOf({ accepted: false })?.code).toBe("NODE_REJECTED_UNCLASSIFIED");
  });
});
