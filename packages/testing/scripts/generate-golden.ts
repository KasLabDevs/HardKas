import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const goldenDir = path.resolve(process.cwd(), "src/fixtures/golden");

if (!fs.existsSync(goldenDir)) {
  fs.mkdirSync(goldenDir, { recursive: true });
}

// Helper to write JSON cleanly
function writeGolden(name: string, data: any) {
  fs.writeFileSync(path.join(goldenDir, name), JSON.stringify(data, null, 2), "utf-8");
}

const COMMON_HASH = crypto.createHash("sha256").update("hardkas-golden").digest("hex");
const COMMON_VOLATILE_TS = "2026-05-27T00:00:00.000Z";

// 1. local-workflow-basic.json (matches WorkflowSchema)
writeGolden("local-workflow-basic.json", {
  schema: "hardkas.workflow.v1",
  schemaVersion: "hardkas.artifact.v1",
  hardkasVersion: "1.0.0-alpha",
  version: "1.0.0-alpha",
  networkId: "simnet",
  mode: "simulated",
  workflowId: "wf-golden-basic",
  status: "completed",
  createdAt: COMMON_VOLATILE_TS,
  contentHash: COMMON_HASH,
  steps: [
    {
      type: "plan",
      status: "success"
    }
  ],
  producedArtifacts: ["plan-golden"]
});

// 2. local-workflow-with-warning.json
writeGolden("local-workflow-with-warning.json", {
  schema: "hardkas.workflow.v1",
  schemaVersion: "hardkas.artifact.v1",
  hardkasVersion: "1.0.0-alpha",
  version: "1.0.0-alpha",
  networkId: "simnet",
  mode: "simulated",
  workflowId: "wf-golden-warning",
  status: "completed",
  createdAt: COMMON_VOLATILE_TS,
  contentHash: COMMON_HASH,
  steps: [
    {
      type: "plan",
      status: "success"
    }
  ],
  producedArtifacts: ["plan-golden"],
  errorEnvelope: {
    code: "DUST_WARNING",
    message: "Transaction contains dust outputs",
    redacted: false
  }
});

// 3. corruption-large-jsonl-tail.json
writeGolden("corruption-large-jsonl-tail.json", {
  note: "This file simulates a tail corruption. Since it's JSON, we just mock the payload that AppendCoordinator might read.",
  rawContent: `{"type":"event","data":"valid"}\n{"type":"event","data":"incom`
});

// 4. corruption-repaired-tail.json
writeGolden("corruption-repaired-tail.json", {
  note: "This file simulates the repaired state.",
  rawContent: `{"type":"event","data":"valid"}\n`
});

// 5. replay-passed.json (matches ReplayResult logic or just a mock ReplayReport)
writeGolden("replay-passed.json", {
  schemaVersion: "hardkas.replayReport.v1", // (If we defined one, else just mock)
  workspace: "mock/path",
  artifacts: 5,
  lineage: "valid",
  determinism: "verified",
  contamination: "none",
  status: "passed",
  result: "PASS"
});

// 6. replay-diverged.json
writeGolden("replay-diverged.json", {
  schemaVersion: "hardkas.replayReport.v1",
  workspace: "mock/path",
  artifacts: 5,
  lineage: "valid",
  determinism: "verified",
  contamination: "none",
  status: "diverged",
  result: "FAIL"
});

// 7. receipt-submitted.json (matches TxReceiptSchema)
writeGolden("receipt-submitted.json", {
  schema: "hardkas.txReceipt",
  schemaVersion: "hardkas.receipt.v1",
  hardkasVersion: "1.0.0-alpha",
  version: "1.0.0-alpha",
  networkId: "simnet",
  mode: "simulated",
  txId: "abc123golden",
  status: "submitted",
  from: { address: "kaspatest:qqgolden1" },
  to: { address: "kaspatest:qqgolden2" },
  amountSompi: "100000000",
  feeSompi: "10000",
  createdAt: COMMON_VOLATILE_TS,
  contentHash: COMMON_HASH
});

// 8. receipt-unknown.json (matches TxReceiptSchema with 'pending')
writeGolden("receipt-unknown.json", {
  schema: "hardkas.txReceipt",
  schemaVersion: "hardkas.receipt.v1",
  hardkasVersion: "1.0.0-alpha",
  version: "1.0.0-alpha",
  networkId: "simnet",
  mode: "simulated",
  txId: "abc123golden_unknown",
  status: "pending",
  from: { address: "kaspatest:qqgolden1" },
  to: { address: "kaspatest:qqgolden2" },
  amountSompi: "100000000",
  feeSompi: "10000",
  createdAt: COMMON_VOLATILE_TS,
  contentHash: COMMON_HASH
});

// 9. explain-transfer.json (matches TxPlanSchema)
writeGolden("explain-transfer.json", {
  schema: "hardkas.txPlan",
  schemaVersion: "hardkas.artifact.v1",
  hardkasVersion: "1.0.0-alpha",
  version: "1.0.0-alpha",
  networkId: "simnet",
  mode: "simulated",
  planId: "plan-golden-explain",
  from: { address: "kaspatest:qqgolden1" },
  to: { address: "kaspatest:qqgolden2" },
  amountSompi: "50000000",
  estimatedFeeSompi: "5000",
  estimatedMass: "2000",
  inputs: [{ outpoint: { transactionId: "prev123", index: 0 }, amountSompi: "50005000" }],
  outputs: [{ address: "kaspatest:qqgolden2", amountSompi: "50000000" }],
  createdAt: COMMON_VOLATILE_TS,
  contentHash: COMMON_HASH
});

// 10. doctor-clean.json (matches DevDoctorResult)
writeGolden("doctor-clean.json", {
  schemaVersion: "hardkas.devDoctor.v1",
  status: "ready",
  checks: [{ name: "Workspace Structure", status: "success", message: "Valid" }],
  timestamp: COMMON_VOLATILE_TS
});

// 11. doctor-corrupt-artifact.json
writeGolden("doctor-corrupt-artifact.json", {
  schemaVersion: "hardkas.devDoctor.v1",
  status: "failed",
  checks: [
    {
      name: "Artifact Integrity",
      status: "error",
      message: "Corrupt file",
      code: "ARTIFACT_CORRUPT",
      suggestion: "Delete it"
    }
  ],
  timestamp: COMMON_VOLATILE_TS
});

// 12. torture-local-report.json
writeGolden("torture-local-report.json", {
  schemaVersion: "hardkas.tortureReport.v1",
  seed: 7001,
  iterations: 300,
  profile: "local",
  bucketFilter: null,
  summary: {
    total: 300,
    passed: 300,
    failed: 0,
    buckets: [{ name: "local-first-lifecycle", count: 300 }]
  },
  cases: []
});

// 13. torture-corruption-report.json
writeGolden("torture-corruption-report.json", {
  schemaVersion: "hardkas.tortureReport.v1",
  seed: 7001,
  iterations: 300,
  profile: "corruption",
  bucketFilter: null,
  summary: {
    total: 300,
    passed: 299,
    failed: 1,
    buckets: [{ name: "concurrent-append-tail-repair", count: 300 }]
  },
  cases: [
    {
      caseId: "case-042",
      bucket: "concurrent-append-tail-repair",
      passed: false,
      error: "Simulated mock failure",
      duration: 120
    }
  ]
});

// 14. artifact-tx-plan.json (duplicate of explain-transfer for clarity)
writeGolden("artifact-tx-plan.json", {
  schema: "hardkas.txPlan",
  schemaVersion: "hardkas.artifact.v1",
  hardkasVersion: "1.0.0-alpha",
  version: "1.0.0-alpha",
  networkId: "simnet",
  mode: "simulated",
  planId: "plan-golden-explain",
  from: { address: "kaspatest:qqgolden1" },
  to: { address: "kaspatest:qqgolden2" },
  amountSompi: "50000000",
  estimatedFeeSompi: "5000",
  estimatedMass: "2000",
  inputs: [{ outpoint: { transactionId: "prev123", index: 0 }, amountSompi: "50005000" }],
  outputs: [{ address: "kaspatest:qqgolden2", amountSompi: "50000000" }],
  createdAt: COMMON_VOLATILE_TS,
  contentHash: COMMON_HASH
});

// 15. artifact-signed-tx.json
writeGolden("artifact-signed-tx.json", {
  schema: "hardkas.signedTx",
  schemaVersion: "hardkas.artifact.v1",
  hardkasVersion: "1.0.0-alpha",
  version: "1.0.0-alpha",
  networkId: "simnet",
  mode: "simulated",
  status: "signed",
  signedId: "signed-tx-golden",
  sourcePlanId: "plan-golden-explain",
  from: { address: "kaspatest:qqgolden1" },
  to: { address: "kaspatest:qqgolden2" },
  amountSompi: "50000000",
  signedTransaction: {
    format: "kaspad-rpc",
    payload: "mock-signed-payload"
  },
  createdAt: COMMON_VOLATILE_TS,
  contentHash: COMMON_HASH
});

// 16. artifact-inspect-basic.json
writeGolden("artifact-inspect-basic.json", {
  schemaVersion: "hardkas.artifactInspect.v1",
  ok: true,
  artifact: {
    id: "plan-golden-explain",
    path: "mock/path/plan-golden-explain.json",
    type: "hardkas.txPlan",
    canonicalHash: COMMON_HASH,
    parents: undefined,
    lineageId: undefined,
    receiptRef: "undefined.receipt.json",
    replayability: "supported"
  },
  warnings: [],
  errors: []
});

// 17. artifact-inspect-lineage.json
writeGolden("artifact-inspect-lineage.json", {
  schemaVersion: "hardkas.artifactInspect.v1",
  ok: true,
  artifact: {
    id: "wf-golden-basic",
    path: "mock/path/wf-golden-basic.json",
    type: "hardkas.workflow.v1",
    canonicalHash: COMMON_HASH,
    parents: ["prev-workflow-123"],
    lineageId: "lin-456",
    receiptRef: undefined,
    replayability: "supported"
  },
  warnings: [],
  errors: []
});

// 18. replay-unsupported.json
writeGolden("replay-unsupported.json", {
  schemaVersion: "hardkas.replayReport.v1",
  workspace: "mock/path",
  artifacts: 1,
  lineage: "invalid",
  determinism: "unverified",
  contamination: "none",
  status: "unsupported",
  result: "FAIL"
});

// 19. large-jsonl-valid-line.json
// Simulate a >70KB valid line
const largePayload = "A".repeat(75000);
writeGolden("large-jsonl-valid-line.json", {
  note: "This simulates a >70KB single line payload.",
  rawContent: `{"type":"large-event","data":"${largePayload}"}\n`
});

console.log("Golden fixtures generated.");
