/**
 * Explainability engine.
 *
 * Generates structured, rule-driven ExplainChains for query results.
 * Every explanation is based on explicit rules, deterministic evidence,
 * and actual execution state. No speculative reasoning.
 */
import type { ExplainChain, ReasoningStep, ArtifactQueryItem, LineageNode, LineageTransition } from "./types.js";

// ---------------------------------------------------------------------------
// Valid lineage transitions (from lineage.ts in @hardkas/artifacts)
// ---------------------------------------------------------------------------

const VALID_TRANSITIONS: Record<string, readonly string[]> = {
  "hardkas.snapshot": ["hardkas.txPlan"],
  "hardkas.txPlan": ["hardkas.signedTx"],
  "hardkas.signedTx": ["hardkas.txReceipt"]
};

// ---------------------------------------------------------------------------
// Explain: Artifact Integrity
// ---------------------------------------------------------------------------

export function explainIntegrity(
  artifact: ArtifactQueryItem,
  integrity: { ok: boolean; hashMatch: boolean; schemaValid: boolean; errors: readonly string[] }
): ExplainChain {
  const steps: ReasoningStep[] = [];
  let order = 1;

  // Step 1: Schema check
  steps.push({
    order: order++,
    assertion: integrity.schemaValid
      ? `Schema "${artifact.schema}" is a recognized HardKAS artifact schema`
      : `Schema "${artifact.schema}" is not recognized`,
    evidence: `artifact.schema = "${artifact.schema}"`,
    rule: "ARTIFACT_SCHEMAS constant (artifacts/constants.ts)"
  });

  // Step 2: Content hash
  if (artifact.contentHash) {
    steps.push({
      order: order++,
      assertion: integrity.hashMatch
        ? "Content hash matches recomputed hash"
        : "Content hash does NOT match recomputed hash — possible corruption",
      evidence: `artifact.contentHash = "${artifact.contentHash}"`,
      rule: "canonicalStringify + SHA-256 (artifacts/canonical.ts)"
    });
  } else {
    steps.push({
      order: order++,
      assertion: "Artifact has no contentHash field (pre-verification artifact)",
      evidence: "artifact.contentHash is undefined",
      rule: "contentHash is optional but recommended"
    });
  }

  // Step 3: Overall verdict
  if (integrity.errors.length > 0) {
    for (const err of integrity.errors) {
      steps.push({
        order: order++,
        assertion: `Integrity issue: ${err}`,
        evidence: err,
        rule: "verifyArtifactIntegrity (artifacts/verify.ts)"
      });
    }
  }

  return {
    question: `Why is artifact "${artifact.schema}" at ${artifact.filePath} ${integrity.ok ? "valid" : "invalid"}?`,
    conclusion: integrity.ok
      ? "All integrity checks passed. Schema is valid and content hash matches."
      : `Integrity check failed: ${integrity.errors.join("; ")}`,
    steps,
    model: "artifact-verification",
    confidence: "definitive",
    references: artifact.contentHash ? [artifact.contentHash] : []
  };
}

// ---------------------------------------------------------------------------
// Explain: Lineage Transition
// ---------------------------------------------------------------------------

export function explainTransition(transition: LineageTransition): ExplainChain {
  const steps: ReasoningStep[] = [];
  let order = 1;

  const allowed = VALID_TRANSITIONS[transition.from.schema] ?? [];

  // Step 1: Transition rule lookup
  steps.push({
    order: order++,
    assertion: allowed.length > 0
      ? `Schema "${transition.from.schema}" allows transitions to: ${allowed.join(", ")}`
      : `Schema "${transition.from.schema}" has no defined transitions`,
    evidence: `VALID_TRANSITIONS["${transition.from.schema}"] = [${allowed.map(s => `"${s}"`).join(", ")}]`,
    rule: "Lineage transition table (artifacts/lineage.ts)"
  });

  // Step 2: Check if this transition is in the allowed set
  steps.push({
    order: order++,
    assertion: transition.valid
      ? `Transition "${transition.from.schema}" → "${transition.to.schema}" is VALID`
      : `Transition "${transition.from.schema}" → "${transition.to.schema}" is NOT in the allowed set`,
    evidence: `target schema = "${transition.to.schema}", allowed = [${allowed.map(s => `"${s}"`).join(", ")}]`,
    rule: "Lineage transition table (artifacts/lineage.ts)"
  });

  // Step 3: Network consistency
  const networkMatch = transition.from.networkId === transition.to.networkId;
  steps.push({
    order: order++,
    assertion: networkMatch
      ? `Network is consistent: both "${transition.from.networkId}"`
      : `NETWORK CONTAMINATION: "${transition.from.networkId}" → "${transition.to.networkId}"`,
    evidence: `parent.networkId = "${transition.from.networkId}", child.networkId = "${transition.to.networkId}"`,
    rule: "NETWORK_CONTAMINATION check (artifacts/lineage.ts)"
  });

  // Step 4: Mode consistency
  const modeMatch = transition.from.mode === transition.to.mode;
  steps.push({
    order: order++,
    assertion: modeMatch
      ? `Mode is consistent: both "${transition.from.mode}"`
      : `MODE CONTAMINATION: "${transition.from.mode}" → "${transition.to.mode}"`,
    evidence: `parent.mode = "${transition.from.mode}", child.mode = "${transition.to.mode}"`,
    rule: "MODE_CONTAMINATION check (artifacts/lineage.ts)"
  });

  // Step 5: Lineage ID continuity
  const lineageMatch = transition.from.lineageId === transition.to.lineageId;
  steps.push({
    order: order++,
    assertion: lineageMatch
      ? "Lineage ID is continuous"
      : "LINEAGE ID MISMATCH — artifacts belong to different lineage chains",
    evidence: `parent.lineageId = "${transition.from.lineageId}", child.lineageId = "${transition.to.lineageId}"`,
    rule: "LINEAGE_ID_MISMATCH check (artifacts/lineage.ts)"
  });

  const allValid = transition.valid && networkMatch && modeMatch && lineageMatch;

  return {
    question: `Why is the transition "${transition.from.schema}" → "${transition.to.schema}" ${allValid ? "valid" : "invalid"}?`,
    conclusion: allValid
      ? `Valid transition. Rule: ${transition.from.schema} → ${transition.to.schema}. Network, mode, and lineage ID are all consistent.`
      : `Invalid transition. ${!transition.valid ? "Schema transition not allowed. " : ""}${!networkMatch ? "Network mismatch. " : ""}${!modeMatch ? "Mode mismatch. " : ""}${!lineageMatch ? "Lineage ID mismatch." : ""}`,
    steps,
    model: "lineage-rules",
    confidence: "definitive",
    references: [transition.from.contentHash, transition.to.contentHash]
  };
}

// ---------------------------------------------------------------------------
// Explain: Orphan
// ---------------------------------------------------------------------------

export function explainOrphan(
  node: LineageNode,
  missingParentId: string
): ExplainChain {
  return {
    question: `Why is artifact "${node.schema}" (${node.contentHash.slice(0, 12)}...) an orphan?`,
    conclusion: `Parent artifact with ID "${missingParentId.slice(0, 12)}..." is not found in the artifact store. This artifact is disconnected from its workflow context.`,
    steps: [
      {
        order: 1,
        assertion: `Artifact declares parentArtifactId = "${missingParentId}"`,
        evidence: `artifact.lineage.parentArtifactId = "${missingParentId}"`,
        rule: "Lineage parent resolution"
      },
      {
        order: 2,
        assertion: "No artifact in the store has a matching lineage.artifactId",
        evidence: "Full store scan found 0 artifacts with this artifactId",
        rule: "Lineage graph construction (query/lineage-adapter.ts)"
      },
      {
        order: 3,
        assertion: "Artifact is classified as an orphan",
        evidence: "Missing parent means the lineage chain is broken",
        rule: "Orphan detection: parentArtifactId exists but not resolvable"
      }
    ],
    model: "lineage-rules",
    confidence: "definitive",
    references: [node.contentHash, missingParentId]
  };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function formatExplainBrief(chain: ExplainChain): string {
  return `${chain.conclusion} [model: ${chain.model}, confidence: ${chain.confidence}]`;
}

export function formatExplainFull(chain: ExplainChain): string {
  const lines: string[] = [];
  lines.push(`Q: ${chain.question}`);
  lines.push("");
  for (const step of chain.steps) {
    lines.push(`  ${step.order}. ${step.assertion}`);
    lines.push(`     Evidence: ${step.evidence}`);
    if (step.rule) {
      lines.push(`     Rule: ${step.rule}`);
    }
  }
  lines.push("");
  lines.push(`Conclusion: ${chain.conclusion}`);
  lines.push(`Model: ${chain.model} | Confidence: ${chain.confidence}`);
  if (chain.references.length > 0) {
    lines.push(`References: ${chain.references.map(r => r.slice(0, 16) + "...").join(", ")}`);
  }
  return lines.join("\n");
}
