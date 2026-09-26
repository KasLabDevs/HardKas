// Wave 1.3 · Closure Pack IC-7.1 / IC-7.2
//
// Every identifier field of every schema declares its category here; the
// introspection test walks the exported Zod schemas and fails on an unregistered
// identifier-shaped name. CONTENT is the ONLY category that may act as an
// artifact identity or reference (IC-7.2); nothing here is a global rule
// `artifactId := contentHash`.

export const IDENTITY_CATEGORY_NAMES = [
  "CONTENT",
  "LABEL",
  "NETWORK",
  "SYNTHETIC_NETWORK",
  "CORRELATION",
  "DOMAIN_DIGEST",
  "LOCATOR"
] as const;

export type IdentityCategory = (typeof IDENTITY_CATEGORY_NAMES)[number];

/**
 * Field name → category. Names are matched exactly (the leaf key of a path).
 */
export const IDENTITY_CATEGORIES: Readonly<Record<string, IdentityCategory>> = Object.freeze({
  // --- CONTENT: the recomputed content hash and references to artifacts by it ---
  artifactId: "CONTENT",
  contentHash: "CONTENT",
  parentArtifactId: "CONTENT",
  rootArtifactId: "CONTENT",
  lineageId: "CONTENT",
  producedArtifactId: "CONTENT",
  signedArtifactId: "CONTENT",
  oldHash: "CONTENT",
  newHash: "CONTENT",
  originalContentHash: "CONTENT",
  sourceArtifactId: "CONTENT",
  artifactIds: "CONTENT",
  compileArtifactHash: "CONTENT",
  deployArtifactHash: "CONTENT",
  deployPlanHash: "CONTENT",
  spendPlanHash: "CONTENT",
  deploySimulationHash: "CONTENT",
  planArtifactId: "CONTENT",
  receiptArtifactId: "CONTENT",
  submissionArtifactId: "CONTENT", // a TxObservation's subject submission (Wave 2(a), IC-2′.3)
  childArtifactId: "CONTENT",
  parentRevisionHash: "CONTENT",
  policyRef: "CONTENT",
  networkProfileRef: "CONTENT",
  assumptionRef: "CONTENT",
  // --- LABEL: derived from the hash, verified, never a reference ---
  planId: "LABEL",
  signedId: "LABEL",
  sourcePlanId: "LABEL",
  sourceSignedId: "LABEL",
  // --- NETWORK: consensus-side identifiers, 1:N with artifacts ---
  txId: "NETWORK",
  deployTxId: "NETWORK",
  winnerTxId: "NETWORK",
  loserTxIds: "NETWORK",
  branchId: "NETWORK", // DAG branch designator inside dagContext
  transactionId: "NETWORK",
  covenantId: "NETWORK",
  covenantIdFromNode: "NETWORK",
  unsignedTransactionId: "NETWORK",
  blockHash: "NETWORK",
  acceptingBlockHash: "NETWORK",
  sinkHash: "NETWORK", // observation point: the virtual's selected parent (Wave 2(a))
  pruningPointHash: "NETWORK", // observation point: the observer's pruning point (Wave 2(a))
  acceptedTxIds: "NETWORK",
  displacedTxIds: "NETWORK",
  spentUtxoIds: "NETWORK",
  createdUtxoIds: "NETWORK",
  utxoId: "NETWORK",
  id: "NETWORK", // UTXO / outpoint identifiers `<txId>:<index>` in localnet state
  networkId: "NETWORK", // network designator (simnet, testnet-10, mainnet)
  chainId: "NETWORK",
  l2ChainId: "NETWORK",
  // --- SYNTHETIC_NETWORK: simulator-issued identifiers under their own namespace ---
  simulatedDeployTxId: "SYNTHETIC_NETWORK",
  simulatedSpendTxId: "SYNTHETIC_NETWORK",
  simulatedTxId: "SYNTHETIC_NETWORK",
  // --- CORRELATION: never resolved as an artifact ---
  workflowId: "CORRELATION",
  workflowIds: "CORRELATION",
  executionId: "CORRELATION",
  eventId: "CORRELATION",
  correlationId: "CORRELATION",
  causationId: "CORRELATION",
  migrationId: "CORRELATION",
  observerId: "CORRELATION", // opaque identity of a HardKAS observer instance (Wave 2(a)); never an artifact
  sessionId: "CORRELATION",
  parentSessionId: "CORRELATION",
  networkProfileId: "CORRELATION", // the profile's own name; the artifact is referenced by networkProfileRef
  generationId: "CORRELATION",
  requestId: "CORRELATION",
  queryId: "CORRELATION",
  replayId: "CORRELATION",
  runId: "CORRELATION",
  scenarioId: "CORRELATION",
  caseId: "CORRELATION",
  deploymentId: "CORRELATION",
  batchId: "CORRELATION",
  taskId: "CORRELATION",
  lockId: "CORRELATION",
  ownerId: "CORRELATION",
  profileId: "CORRELATION",
  imageId: "CORRELATION",
  // --- DOMAIN_DIGEST: digests of state or material; never an identity ---
  stateHash: "DOMAIN_DIGEST",
  preStateHash: "DOMAIN_DIGEST",
  postStateHash: "DOMAIN_DIGEST",
  utxoSetHash: "DOMAIN_DIGEST",
  accountsHash: "DOMAIN_DIGEST",
  intentHash: "DOMAIN_DIGEST",
  artifactSha256: "DOMAIN_DIGEST",
  binarySha256: "DOMAIN_DIGEST",
  sha256: "DOMAIN_DIGEST",
  unsignedPayloadHash: "DOMAIN_DIGEST",
  compiledScriptHash: "DOMAIN_DIGEST",
  redeemScriptHash: "DOMAIN_DIGEST",
  scriptHash: "DOMAIN_DIGEST",
  argsHash: "DOMAIN_DIGEST",
  inputHash: "DOMAIN_DIGEST",
  testVectorsHash: "DOMAIN_DIGEST",
  configHash: "DOMAIN_DIGEST",
  payloadHash: "DOMAIN_DIGEST",
  integrityHash: "DOMAIN_DIGEST",
  capabilitiesHash: "DOMAIN_DIGEST",
  queryHash: "DOMAIN_DIGEST",
  coherenceDigest: "DOMAIN_DIGEST",
  publicInputsHash: "DOMAIN_DIGEST",
  verificationKeyHash: "DOMAIN_DIGEST",
  proofHash: "DOMAIN_DIGEST",
  statementHash: "DOMAIN_DIGEST",
  manifestHash: "DOMAIN_DIGEST",
  corpusHash: "DOMAIN_DIGEST",
  sourceHash: "DOMAIN_DIGEST",
  bytecodeHash: "DOMAIN_DIGEST",
  imageDigest: "DOMAIN_DIGEST",
  digest: "DOMAIN_DIGEST",
  responseDigest: "DOMAIN_DIGEST", // digest of a raw RPC response kept as observation evidence (Wave 2(a))
  fingerprint: "DOMAIN_DIGEST",
  // --- LOCATOR: paths are hints only ---
  path: "LOCATOR",
  filePath: "LOCATOR",
  file_path: "LOCATOR",
  tracePath: "LOCATOR",
  receiptPath: "LOCATOR",
  recordPath: "LOCATOR",
  artifactPath: "LOCATOR",
  sourcePath: "LOCATOR",
  outputPath: "LOCATOR",
  workspacePath: "LOCATOR",
  relativePath: "LOCATOR",
  absolutePath: "LOCATOR",
  sandboxSnapshotPath: "LOCATOR",
  sourceSignedPath: "LOCATOR",
  sourcePlanPath: "LOCATOR",
  rootPath: "LOCATOR",
  storePath: "LOCATOR",
  dbPath: "LOCATOR"
});

/** The category a field name belongs to, or undefined when it is not registered. */
export function identityCategoryOf(fieldName: string): IdentityCategory | undefined {
  return IDENTITY_CATEGORIES[fieldName];
}

/** Whether a category may serve as an artifact identity or reference (IC-7.2): only CONTENT. */
export function isIdentityCategory(category: IdentityCategory): boolean {
  return category === "CONTENT";
}
