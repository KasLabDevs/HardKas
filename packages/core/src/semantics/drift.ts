import { SemanticIdentity } from "./types.js";

export interface SemanticDriftReport {
  hasDrift: boolean;
  conflictingSubsystem?: string;
  exactReplayCommand?: string;
  severity: "NONE" | "CRITICAL";
  details?: string;
}

/**
 * Compares the truth across different subsystems.
 * If multiple subsystems disagree about truth, that is a CRITICAL semantic failure.
 * Invariant: `subsystems_cannot_disagree_about_canonical_truth`
 */
export function detectSemanticDrift(
  dashboardView: SemanticIdentity,
  queryStoreView: SemanticIdentity,
  replayView: SemanticIdentity,
  filesystemView: SemanticIdentity
): SemanticDriftReport {
  
  const views = {
    Dashboard: dashboardView,
    QueryStore: queryStoreView,
    Replay: replayView,
    Filesystem: filesystemView
  };

  let referenceView = filesystemView; // Filesystem is base projection

  for (const [subsystem, view] of Object.entries(views)) {
    if (view.semanticHash !== referenceView.semanticHash) {
      return {
        hasDrift: true,
        conflictingSubsystem: subsystem,
        exactReplayCommand: `hardkas verify-replay --artifact ${referenceView.artifactId}`,
        severity: "CRITICAL",
        details: `Hash mismatch: ${subsystem} (${view.semanticHash}) vs Reference (${referenceView.semanticHash})`
      };
    }

    if (view.status !== referenceView.status) {
      // NOTE: Different subsystems might legitimately see different statuses if they haven't synced,
      // but if the Replay says STALE and Dashboard says VERIFIED, it's a critical drift.
      if (subsystem === "Dashboard" && view.status === "VERIFIED" && replayView.status === "STALE") {
        return {
            hasDrift: true,
            conflictingSubsystem: subsystem,
            exactReplayCommand: `hardkas verify-replay --artifact ${referenceView.artifactId}`,
            severity: "CRITICAL",
            details: `Dashboard claims VERIFIED but Replay claims STALE.`
        };
      }
    }
  }

  return { hasDrift: false, severity: "NONE" };
}

/**
 * Asserts no semantic drift exists. Fails loudly.
 */
export function assertNoSemanticDrift(
  dashboardView: SemanticIdentity,
  queryStoreView: SemanticIdentity,
  replayView: SemanticIdentity,
  filesystemView: SemanticIdentity
): void {
  const report = detectSemanticDrift(dashboardView, queryStoreView, replayView, filesystemView);
  if (report.hasDrift) {
    throw new Error(
      `[CRITICAL SEMANTIC DRIFT] Subsystem disagreement detected.\n` +
      `Conflicting Subsystem: ${report.conflictingSubsystem}\n` +
      `Details: ${report.details}\n` +
      `Resolution Command: ${report.exactReplayCommand}`
    );
  }
}
