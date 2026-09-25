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
    plannerPath: "CLI Real Node uses `buildPaymentPlan` (Legacy), CLI Simulator uses `buildPaymentPlan`.",
    evidenceMeaning: "Proves that a geometrically valid, fee-paying transaction was possible using available UTXOs at a specific virtualDaaScore.",
    limitations: ["Candidate B (upstream unification) is not yet wired to the CLI."],
    relatedConcepts: ["/concepts/transactions/planning.md", "/concepts/transactions/utxos.md"],
    relatedGuides: ["/guides/transactions/create-a-transaction.md"]
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
    relatedConcepts: ["/concepts/transactions/signing.md"],
    relatedGuides: ["/guides/transactions/sign-a-transaction.md"]
  },
  "hardkas tx send": {
    commandPath: "hardkas tx send",
    environments: ["Simulator", "Localnet", "RPC"],
    reads: ["SignedTxArtifact"],
    writes: ["TxReceiptArtifact json file"],
    artifactsProduced: ["TxReceiptArtifact"],
    acceptedIdentifiers: ["filepath", "canonical artifactId"],
    sideEffects: ["Submits transaction to network mempool or mutates local simulator state."],
    evidenceMeaning: "Proves submission acceptance by the target environment (mempool inclusion or simulator mutation). DOES NOT prove finality.",
    limitations: ["CLI-NEXTSTEPS-1: The CLI currently hints `hardkas explain <txId>` upon success, but `explain` does not accept `txId`."],
    relatedConcepts: ["/concepts/transactions/submission.md"],
    relatedGuides: ["/guides/transactions/submit-a-transaction.md"]
  },
  "hardkas tx trace": {
    commandPath: "hardkas tx trace",
    limitations: ["DISABLED: Tracing is temporarily disabled while the query API stabilizes."],
  },
  "hardkas verify": {
    commandPath: "hardkas verify",
    environments: ["Local Workspace"],
    reads: ["All JSON artifacts in .hardkas/artifacts/"],
    writes: [],
    artifactsProduced: [],
    sideEffects: [],
    evidenceMeaning: "Verifies cryptographic integrity (contentHash), schema compliance, and DAG continuity of all artifacts in the workspace. Will attempt deterministic replay audit only in single-file mode if supported.",
    relatedConcepts: ["/concepts/evidence.md"],
    relatedGuides: ["/how-to/verify-evidence.md"]
  },
  "hardkas explain": {
    commandPath: "hardkas explain",
    environments: ["Local Workspace"],
    reads: ["Artifact JSON file", "Parent artifacts in lineage"],
    writes: [],
    artifactsProduced: [],
    acceptedIdentifiers: ["explicit filepath", "exact canonical artifactId", "planId (legacy compatibility)"],
    sideEffects: [],
    evidenceMeaning: "Produces a human-readable trace of the artifact's lineage and assertions.",
    limitations: ["Does NOT accept `txId` or `contentHash` as generic locators."],
    relatedGuides: ["/how-to/verify-evidence.md"]
  },
  "hardkas why": {
    commandPath: "hardkas why",
    environments: ["Local Workspace"],
    reads: ["Artifact JSON file", "Parent artifacts in lineage"],
    writes: [],
    artifactsProduced: [],
    acceptedIdentifiers: ["explicit filepath", "exact canonical artifactId", "planId (legacy compatibility)"],
    sideEffects: [],
    evidenceMeaning: "Extended causal tracing. Identical constraints to `explain`."
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
  }
};
