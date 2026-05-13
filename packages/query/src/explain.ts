/**
 * Explainability & Causal Analysis engine.
 *
 * Generates structured, technical ExplainBlocks and causal WhyBlocks.
 * Every analysis is based on explicit rules, deterministic evidence,
 * and actual execution state.
 */
import type { 
  ExplainBlock, 
  WhyBlock, 
  EvidenceRef, 
  CausalStep, 
  ArtifactQueryItem, 
  LineageNode, 
  LineageTransition,
  QueryStoreStatus
} from "./types.js";

// ---------------------------------------------------------------------------
// Valid lineage transitions
// ---------------------------------------------------------------------------

const VALID_TRANSITIONS: Record<string, readonly string[]> = {
  "hardkas.snapshot": ["hardkas.txPlan"],
  "hardkas.txPlan": ["hardkas.signedTx"],
  "hardkas.signedTx": ["hardkas.txReceipt"]
};

// ---------------------------------------------------------------------------
// Explain: Technical Diagnostics
// ---------------------------------------------------------------------------

export function createExplainBlock(options: {
  backend: string;
  executionPlan: string[];
  indexesUsed?: string[];
  filtersApplied?: string[];
  rowsRead: number;
  scannedFiles: number;
  freshness: QueryStoreStatus;
  warnings?: string[];
}): ExplainBlock {
  return {
    backend: options.backend,
    executionPlan: options.executionPlan,
    indexesUsed: options.indexesUsed || [],
    filtersApplied: options.filtersApplied || [],
    rowsRead: options.rowsRead,
    scannedFiles: options.scannedFiles,
    freshness: options.freshness,
    warnings: options.warnings || []
  };
}

// ---------------------------------------------------------------------------
// Why: Causal Analysis
// ---------------------------------------------------------------------------

/**
 * Why is this artifact valid or invalid?
 */
export function explainIntegrity(
  artifact: ArtifactQueryItem,
  integrity: { ok: boolean; hashMatch: boolean; schemaValid: boolean; errors: readonly string[] }
): WhyBlock {
  const causalChain: CausalStep[] = [];
  const evidence: EvidenceRef[] = [];
  let order = 1;

  if (artifact.contentHash) {
    evidence.push({ type: "contentHash", value: artifact.contentHash });
  }
  evidence.push({ type: "filePath", value: artifact.filePath });

  // Step 1: Schema check
  causalChain.push({
    order: order++,
    assertion: integrity.schemaValid
      ? `Schema "${artifact.schema}" is a recognized HardKAS artifact schema`
      : `Schema "${artifact.schema}" is not recognized`,
    evidence: `artifact.schema = "${artifact.schema}"`,
    rule: "ARTIFACT_SCHEMAS constant (artifacts/constants.ts)"
  });

  // Step 2: Content hash
  if (artifact.contentHash) {
    causalChain.push({
      order: order++,
      assertion: integrity.hashMatch
        ? "Content hash matches recomputed hash"
        : "Content hash does NOT match recomputed hash",
      evidence: `hash(payload) === "${artifact.contentHash}"`,
      rule: "canonicalStringify + SHA-256 (artifacts/canonical.ts)"
    });
  }

  // Step 3: Semantic errors
  if (integrity.errors.length > 0) {
    for (const err of integrity.errors) {
      causalChain.push({
        order: order++,
        assertion: `Semantic violation detected: ${err}`,
        evidence: "Verification engine failure",
        rule: "verifyArtifactSemantics (artifacts/verify.ts)"
      });
    }
  }

  return {
    question: `Why is artifact "${artifact.schema}" ${integrity.ok ? "valid" : "invalid"}?`,
    answer: integrity.ok
      ? "All deterministic checks (schema, hash, semantics) passed successfully."
      : `Verification failed: ${integrity.errors.join("; ")}`,
    evidence,
    causalChain,
    model: "integrity-verifier",
    confidence: "definitive"
  };
}

/**
 * Why is this transition valid or invalid?
 */
export function explainTransition(transition: LineageTransition): WhyBlock {
  const causalChain: CausalStep[] = [];
  const evidence: EvidenceRef[] = [
    { type: "contentHash", value: transition.from.contentHash },
    { type: "contentHash", value: transition.to.contentHash }
  ];
  let order = 1;

  const allowed = VALID_TRANSITIONS[transition.from.schema] ?? [];

  // Step 1: Transition rule
  causalChain.push({
    order: order++,
    assertion: transition.valid
      ? `Transition "${transition.from.schema}" → "${transition.to.schema}" is allowed`
      : `Transition "${transition.from.schema}" → "${transition.to.schema}" is NOT allowed`,
    evidence: `allowed_from_${transition.from.schema} = [${allowed.join(", ")}]`,
    rule: "Lineage transition table"
  });

  // Step 2: Context consistency
  const contextMatch = transition.from.networkId === transition.to.networkId && 
                       transition.from.mode === transition.to.mode;
  
  causalChain.push({
    order: order++,
    assertion: contextMatch
      ? "Execution context (network, mode) is consistent"
      : "EXECUTION CONTEXT MISMATCH detected",
    evidence: `from: ${transition.from.networkId}/${transition.from.mode}, to: ${transition.to.networkId}/${transition.to.mode}`,
    rule: "Context isolation policy"
  });

  return {
    question: `Why transition ${transition.from.schema} → ${transition.to.schema}?`,
    answer: transition.valid && contextMatch 
      ? "Causal chain is consistent with HardKAS state transition rules."
      : "Workflow violation: invalid schema transition or context contamination.",
    evidence,
    causalChain,
    model: "causal-lineage",
    confidence: "definitive"
  };
}

/**
 * Why is this artifact an orphan?
 */
export function explainOrphan(
  node: LineageNode,
  missingParentId: string
): WhyBlock {
  return {
    question: `Why is artifact "${node.artifactId.slice(0, 8)}" an orphan?`,
    answer: "The parent artifact referenced in the lineage metadata is missing from the indexed store.",
    evidence: [
      { type: "artifactId", value: node.artifactId },
      { type: "artifactId", value: missingParentId }
    ],
    causalChain: [
      {
        order: 1,
        assertion: "Artifact defines a parent dependency",
        evidence: `parentArtifactId = "${missingParentId}"`,
        rule: "Lineage metadata requirement"
      },
      {
        order: 2,
        assertion: "Parent artifact lookup failed",
        evidence: "Index scan for artifactId returned 0 results",
        rule: "Store integrity policy"
      }
    ],
    model: "orphan-analysis",
    confidence: "definitive"
  };
}

// ---------------------------------------------------------------------------
// Formatting Helpers
// ---------------------------------------------------------------------------

export function formatExplainBlock(block: ExplainBlock): string {
  const lines: string[] = [];
  lines.push(`  [Explain: Technical Diagnostics]`);
  lines.push(`  Backend:      ${block.backend}`);
  lines.push(`  Freshness:    ${block.freshness}`);
  lines.push(`  Rows Read:    ${block.rowsRead}`);
  lines.push(`  Files Scan:   ${block.scannedFiles}`);
  if (block.executionPlan.length > 0) {
    lines.push(`  Plan:         ${block.executionPlan.join(" → ")}`);
  }
  if (block.warnings.length > 0) {
    lines.push(`  Warnings:`);
    for (const w of block.warnings) lines.push(`    ⚠ ${w}`);
  }
  return lines.join("\n");
}

export function formatWhyBlock(block: WhyBlock): string {
  const lines: string[] = [];
  lines.push(`  [Why: Causal Analysis]`);
  lines.push(`  Q: ${block.question}`);
  lines.push(`  A: ${block.answer}`);
  lines.push("");
  for (const step of block.causalChain) {
    lines.push(`    ${step.order}. ${step.assertion}`);
    lines.push(`       Evidence: ${step.evidence}`);
    if (step.rule) lines.push(`       Rule:     ${step.rule}`);
  }
  if (block.evidence.length > 0) {
    lines.push("");
    lines.push(`  Evidence Refs: ${block.evidence.map(e => `${e.type}:${e.value.slice(0, 12)}...`).join(", ")}`);
  }
  return lines.join("\n");
}
