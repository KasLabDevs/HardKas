export interface CliCommandSemantics {
  commandPath: string;
  environments?: string[]; // Simulator, Localnet, RPC, Mainnet, etc.
  reads?: string[]; // Artifacts, Config, Keys, etc.
  writes?: string[]; // Files modified
  artifactsProduced?: string[]; // TxPlanArtifact, etc.
  acceptedIdentifiers?: string[]; // explicit filepath, exact canonical artifactId, etc.
  sideEffects?: string[]; // submit transactions, fund accounts, expose keys
  plannerPath?: string;
  evidenceMeaning?: string; // what does success prove
  limitations?: string[]; // e.g. CLI-NEXTSTEPS-1
  qualification?: string;
  relatedConcepts?: string[];
  relatedGuides?: string[];
}

export const cliSemantics: Record<string, CliCommandSemantics> = {
  "hardkas tx plan": {
    commandPath: "hardkas tx plan",
    environments: ["Simulator", "Localnet", "RPC"],
    reads: ["Workspace config", "Kaspa node RPC (for real-node path)"],
    writes: ["TxPlanArtifact json file"],
    artifactsProduced: ["TxPlanArtifact"],
    acceptedIdentifiers: [],
    sideEffects: [],
    plannerPath: "The kaspa-wasm Generator on every path: a real node (`KASPA_WASM_GENERATOR`) and the simulator (`SYNTHETIC_SIMULATOR`, over its identities).",
    evidenceMeaning: "Proves that a geometrically valid, fee-paying transaction was possible using available UTXOs at a specific virtualDaaScore.",
    limitations: ["A payment that needs more than one transaction is refused (`MULTI_TRANSACTION_PLAN_REQUIRED`): consolidate the UTXOs first."],
    relatedConcepts: ["/concepts/transaction-lifecycle.md", "/guides/transactions/fees-and-mass.md"],
    relatedGuides: ["/guides/transactions/plan-sign-send.md"]
  },
  "hardkas tx sign": {
    commandPath: "hardkas tx sign",
    environments: ["Simulator", "Localnet", "RPC"],
    reads: ["TxPlanArtifact", "Local private keys / deterministic simulator keys"],
    writes: ["SignedTxArtifact json file"],
    artifactsProduced: ["SignedTxArtifact"],
    acceptedIdentifiers: ["filepath", "canonical artifactId"],
    sideEffects: ["Cryptographic signing operations"],
    evidenceMeaning: "Proves authorization. Cryptographically asserts that the holder of the private keys approved the exact geometric bounds in the plan.",
    relatedConcepts: ["/concepts/security-model.md"],
    relatedGuides: ["/guides/transactions/plan-sign-send.md"]
  },
  "hardkas tx send": {
    commandPath: "hardkas tx send",
    environments: ["Simulator", "Localnet", "RPC"],
    reads: ["SignedTxArtifact"],
    writes: ["The simulator: a TxReceipt json file. A node send: a TxSubmission json file (`hardkas.txSubmission.v1`). Both under .hardkas/artifacts/receipts/"],
    artifactsProduced: ["TxReceipt (simulator)", "TxSubmission (node send)"],
    acceptedIdentifiers: ["filepath", "canonical artifactId"],
    sideEffects: ["Submits transaction to network mempool or mutates local simulator state."],
    evidenceMeaning: "Proves submission acceptance by the target environment (mempool inclusion or simulator mutation). DOES NOT prove finality. With `--wait`, the command also waits until the transaction is CONFIRMED on the same node.",
    limitations: ["The printed next steps name the receipt's canonical artifactId (`hardkas explain <artifactId>`); the txId is reported as `txId` and is looked up with `--tx`."],
    relatedConcepts: ["/concepts/transaction-lifecycle.md"],
    relatedGuides: ["/guides/transactions/plan-sign-send.md"]
  },
  "hardkas tx trace": {
    commandPath: "hardkas tx trace",
    limitations: ["DISABLED: Tracing is temporarily disabled while the query API stabilizes."],
  },
  "hardkas verify": {
    commandPath: "hardkas verify",
    environments: ["Local Workspace"],
    reads: ["All JSON artifacts in .hardkas/artifacts/", "Or the workspace-contained file/directory given as [path]"],
    writes: [],
    artifactsProduced: [],
    sideEffects: [],
    acceptedIdentifiers: ["(none) → every artifact under .hardkas/artifacts/", "explicit workspace-contained filepath", "explicit workspace-contained directory"],
    evidenceMeaning: "Verifies cryptographic integrity (contentHash recomputed under the declared hashVersion), schema compliance, references and DAG continuity, always in strict mode. `ok` in the JSON envelope is the verdict and a failed verdict exits non-zero.",
    limitations: [
      "Always strict: an artifact with hashVersion ≤ 4 fails with MIGRATION_REQUIRED; re-issue it with `hardkas artifact migrate <path> --to 5`.",
      "A [path] outside the workspace is refused (ARTIFACT_PATH_OUTSIDE_WORKSPACE); excess positional arguments are a usage error.",
      "No consensus replay is performed; the former deep-validation flag was removed because it performed no check."
    ],
    relatedConcepts: ["/concepts/artifact-lifecycle.md"],
    relatedGuides: ["/guides/artifact-auditing.md"]
  },
  "hardkas explain": {
    commandPath: "hardkas explain",
    environments: ["Local Workspace"],
    reads: ["Artifact JSON file", "Parent artifacts in lineage"],
    writes: [],
    artifactsProduced: [],
    acceptedIdentifiers: ["explicit filepath", "exact canonical artifactId", "--plan <planId>", "--signed <signedId>", "--tx <txId>", "--workflow <workflowId>"],
    sideEffects: [],
    evidenceMeaning: "Produces a human-readable trace of the artifact's lineage and assertions.",
    limitations: ["A bare label, txId or workflowId is refused with NAMESPACE_REQUIRED; name its namespace flag. The `--tx` namespace returns the submission receipt, never the signed transaction."],
    relatedGuides: ["/guides/artifact-auditing.md"]
  },
  "hardkas why": {
    commandPath: "hardkas why",
    environments: ["Local Workspace"],
    reads: ["Artifact JSON file", "Parent artifacts in lineage"],
    writes: [],
    artifactsProduced: [],
    acceptedIdentifiers: ["explicit filepath", "exact canonical artifactId", "--plan <planId>", "--signed <signedId>", "--tx <txId>", "--workflow <workflowId>"],
    sideEffects: [],
    evidenceMeaning: "Extended causal tracing. Identical constraints to `explain`.",
    limitations: ["A bare label, txId or workflowId is refused with NAMESPACE_REQUIRED; name its namespace flag. The `--tx` namespace returns the submission receipt, never the signed transaction."]
  },
  "hardkas accounts keys": {
    commandPath: "hardkas accounts keys",
    sideEffects: ["EXPOSES PRIVATE KEYS to stdout. Security-sensitive operation."],
    limitations: ["Intended for development/testing only, not for production custody."]
  },
  "hardkas init": {
    commandPath: "hardkas init",
    environments: ["Local Workspace"],
    reads: [],
    writes: ["hardkas.config.ts", ".hardkas/localnet.json", "package.json updates"],
    sideEffects: ["Creates new project scaffolding, provisions deterministic accounts, funds simulator accounts."],
  },
  "hardkas query store sync": {
    commandPath: "hardkas query store sync",
    environments: ["Local Workspace"],
    reads: [".hardkas/artifacts/ (all files)", ".hardkas/events.jsonl"],
    writes: [".hardkas/store.db (SQLite read-model)"],
    sideEffects: ["Rebuilds the ephemeral query projection from the Canonical Store."],
    evidenceMeaning: "Ensures the Query Store is in strict parity with the durable evidence DAG."
  },
  "hardkas zk toccata build-scripts": {
    commandPath: "hardkas zk toccata build-scripts",
    environments: ["Local (kaspa-wasm ZkScriptBuilder); simnet address always, testnet-10/mainnet only on request"],
    reads: ["RISC Zero Groth16 receipt (file or hex)"],
    evidenceMeaning:
      "Scripts built and parsed, and the receipt's claim matches (imageId, journalHash). This command signs and broadcasts nothing: `hardkas zk toccata spend` sends a lock's spend through HardKAS's send, the node verifies the proof, and HardKAS claims no on-chain verification of its own.",
    limitations: [
      "proof-only (default) is IMAGE_ID_ONLY: any holder of a valid receipt of the program spends every UTXO at the address, to any outputs, on any network (replay and front-running by design).",
      "proof-and-output-bound is IMAGE_ID_AND_OUTPUTS: output count, payout/change script public key and amount by introspection, exactly one input, and an input of at most the bound outputs plus --max-fee. Fund it with requiredFundingSompi.",
      "Neither mode binds the spent outpoint (circular: the funding transaction's id commits to the P2SH; refused as ZK_UTXO_BINDING_UNSATISFIABLE) or the journal (supplied by the unlocking script; the HKZ1 layout is an off-chain convention)."
    ],
    relatedConcepts: ["/guides/silverscript-covenants/zk-and-sequencing.md"],
    relatedGuides: ["/guides/zk-l1-verification-and-settlement.md"]
  },
  "hardkas zk toccata verify-scripts": {
    commandPath: "hardkas zk toccata verify-scripts",
    environments: ["Local (kaspa-wasm ZkScriptBuilder, to rebuild the lock); no node is contacted"],
    reads: ["Redeem and signature scripts (hex), or the scripts record `zk toccata build-scripts --json` printed (--scripts <record>)"],
    evidenceMeaning:
      "The lock uses the pinned RISC Zero verifying key, control root and control id, and its redeem script is byte-identical to the one build-scripts makes for the parameters it carries. consensusEnforced: true only for such an output-bound lock. The scripts are not executed here; a node runs them only when a spend is sent (`hardkas zk toccata spend`).",
    limitations: [
      "A lock HardKAS cannot rebuild byte for byte (another builder, other opcodes, another encoding) is ZK_REDEEM_SCRIPT_NOT_CANONICAL: no claim is made about it, even when it may be sound.",
      "Expected outputs asked of a lock that binds none (proof-only) are ZK_EXPECTED_BINDING_NOT_ENFORCED, never satisfied vacuously."
    ],
    relatedConcepts: ["/guides/silverscript-covenants/zk-and-sequencing.md"],
    relatedGuides: ["/guides/zk-l1-verification-and-settlement.md"]
  }
};
