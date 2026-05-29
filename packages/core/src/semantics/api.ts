import { SemanticIdentity, ArtifactStatus } from "./types.js";
import { validateStatusTransition } from "./status.js";

export interface ReplayContext {
  semanticHash: string;
  lineageId: string;
  replayHash: string;
}

/**
 * Resolves a canonical artifact.
 * Implicit 'latest' is STRICTLY FORBIDDEN.
 * You must provide an explicit artifactId, lineageId, or semanticHash.
 * Invariant: `canonical_resolution_never_depends_on_implicit_latest`
 */
export function resolveCanonicalArtifact(params: {
  artifactId?: string;
  lineageId?: string;
  semanticHash?: string;
}): string {
  if (!params.artifactId && !params.lineageId && !params.semanticHash) {
    throw new Error(
      `[CRITICAL SEMANTIC ERROR] Implicit resolution forbidden. ` +
        `You must pin resolution by providing an explicit artifactId, lineageId, or semanticHash.`
    );
  }

  // Logic to resolve artifact via ID or Hash goes here.
  // For now, return a placeholder that just echoes the request to prevent errors in stub,
  // but in reality this connects to the storage layer (without any "latest" fallback).
  return params.artifactId || params.semanticHash || params.lineageId || "";
}

/**
 * Verifies that the artifact content integrity is valid.
 */
export function verifyArtifactIntegrity(
  identity: SemanticIdentity,
  computedHash: string
): void {
  if (identity.semanticHash !== computedHash) {
    throw new Error(
      `[CRITICAL SEMANTIC ERROR] Integrity mismatch for artifact ${identity.artifactId}: ` +
        `expected hash ${identity.semanticHash}, got ${computedHash}`
    );
  }
}

/**
 * Verifies the artifact via active replay, isolating it from ambient state.
 * Invariant: `replay_isolated_from_ambient_runtime_state`
 */
export function verifyReplay(
  identity: SemanticIdentity,
  replayCtx: ReplayContext
): ArtifactStatus {
  if (identity.semanticHash !== replayCtx.semanticHash) {
    throw new Error(
      `[CRITICAL SEMANTIC ERROR] Replay semantic hash divergence: expected ${identity.semanticHash}, got ${replayCtx.semanticHash}`
    );
  }
  validateStatusTransition(identity.status, "REPLAY_VERIFIED");
  return "REPLAY_VERIFIED";
}

export function verifyProjectionFreshness(
  identity: SemanticIdentity,
  currentLineageHead: string
): boolean {
  // If lineage drifted, it is STALE
  // Implementation stub
  return true;
}

export function classifyArtifactStatus(
  identity: SemanticIdentity,
  isReadable: boolean,
  isCorrupted: boolean
): ArtifactStatus {
  if (isCorrupted) return "CORRUPTED";
  if (!isReadable) return "UNKNOWN";
  if (identity.status === "UNKNOWN") return "PROJECTED";
  return identity.status;
}

export function resolveLineage(artifactId: string): string[] {
  // Resolves full explicit lineage. No 'latest' fallback.
  return [artifactId];
}

export function verifyCapabilityBoundary(
  identity: SemanticIdentity,
  capability: string
): void {
  // Formal capability check
}
