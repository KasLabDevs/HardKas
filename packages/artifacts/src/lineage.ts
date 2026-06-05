import { VerificationIssue } from "./verify.js";

export interface LineageValidationResult {
  ok: boolean;
  issues: VerificationIssue[];
}

export interface LineageOptions {
  strict?: boolean;
}

/**
 * Validates the lineage relationship between an artifact and its parent.
 */
export function verifyLineage(
  artifact: any,
  parent?: any,
  options: LineageOptions = {}
): LineageValidationResult {
  const issues: VerificationIssue[] = [];

  const addIssue = (
    code: string,
    message: string,
    severity: "error" | "warning" = "error"
  ) => {
    issues.push({ code, severity, message });
  };

  const lineage = artifact.lineage;

  // 1. Structural Checks
  if (!lineage) {
    const isWorkflow = artifact.schema === "hardkas.workflow.v1";
    const severity = options.strict && !isWorkflow ? "error" : "warning";
    if (!isWorkflow || options.strict) {
      addIssue("MISSING_LINEAGE", "Artifact has no lineage metadata", severity);
    }
    return {
      ok: issues.every((i) => i.severity !== "error"),
      issues
    };
  }

  const isHash = (s: any) => typeof s === "string" && /^[0-9a-f]{64}$/i.test(s);

  if (!lineage.artifactId || !lineage.lineageId || !lineage.rootArtifactId) {
    addIssue(
      "INVALID_LINEAGE_STRUCTURE",
      "Lineage block is missing required fields (artifactId, lineageId, or rootArtifactId)"
    );
  } else {
    if (!isHash(lineage.artifactId))
      addIssue("INVALID_LINEAGE_FORMAT", "artifactId must be a 64-char hex string");
    if (!isHash(lineage.lineageId))
      addIssue("INVALID_LINEAGE_FORMAT", "lineageId must be a 64-char hex string");
    if (!isHash(lineage.rootArtifactId))
      addIssue("INVALID_LINEAGE_FORMAT", "rootArtifactId must be a 64-char hex string");
    if (lineage.parentArtifactId && !isHash(lineage.parentArtifactId)) {
      addIssue("INVALID_LINEAGE_FORMAT", "parentArtifactId must be a 64-char hex string");
    }
  }

  // 2. Identity Verification
  if (artifact.contentHash && lineage.artifactId !== artifact.contentHash) {
    addIssue(
      "LINEAGE_IDENTITY_MISMATCH",
      `Lineage artifactId (${lineage.artifactId}) does not match contentHash (${artifact.contentHash})`
    );
  }

  // 3. Chain Continuity (if parent is provided)
  if (parent) {
    const parentLineage = parent.lineage;

    if (!parentLineage) {
      addIssue("PARENT_MISSING_LINEAGE", "Parent artifact has no lineage metadata");
    } else {
      // Parent Reference Check
      if (!lineage.parentArtifactId) {
        addIssue(
          "MISSING_PARENT_ID",
          "Artifact is missing parentArtifactId reference, but parent was provided for verification."
        );
      } else if (lineage.parentArtifactId !== parentLineage.artifactId) {
        addIssue(
          "PARENT_ID_MISMATCH",
          `Parent Artifact ID mismatch: expected ${parentLineage.artifactId}, got ${lineage.parentArtifactId}`
        );
      }

      // Lineage Stability
      if (lineage.lineageId !== parentLineage.lineageId) {
        addIssue(
          "LINEAGE_ID_MISMATCH",
          `Lineage ID mismatch: expected ${parentLineage.lineageId}, got ${lineage.lineageId}`
        );
      }

      if (lineage.rootArtifactId !== parentLineage.rootArtifactId) {
        addIssue(
          "ROOT_ARTIFACT_ID_MISMATCH",
          `Root Artifact ID mismatch: expected ${parentLineage.rootArtifactId}, got ${lineage.rootArtifactId}`
        );
      }

      // Sequence check
      if (lineage.sequence !== undefined && parentLineage.sequence !== undefined) {
        if (lineage.sequence <= parentLineage.sequence) {
          const severity = options.strict ? "error" : "warning";
          addIssue(
            "NON_MONOTONIC_SEQUENCE",
            `Non-monotonic sequence: current (${lineage.sequence}) <= parent (${parentLineage.sequence}).`,
            severity
          );
        }
      }
    }

    // Network & Mode Consistency
    if (artifact.networkId !== parent.networkId) {
      addIssue(
        "NETWORK_MISMATCH",
        `Network mismatch: parent is ${parent.networkId}, current is ${artifact.networkId}`
      );
    }

    if (artifact.mode !== parent.mode) {
      addIssue(
        "MODE_MISMATCH",
        `Mode mismatch: parent is ${parent.mode}, current is ${artifact.mode}`
      );
    }

    // Self-parent check
    if (lineage.artifactId === lineage.parentArtifactId) {
      addIssue("SELF_PARENT", "Artifact cannot be its own parent.");
    }
  }

  // 4. Transition Logic
  if (parent) {
    const validTransitions: Record<string, string[]> = {
      "hardkas.snapshot": ["hardkas.txPlan", "hardkas.migrationReceipt.v1"],
      "hardkas.txPlan": ["hardkas.signedTx", "hardkas.migrationReceipt.v1"],
      "hardkas.signedTx": ["hardkas.txReceipt", "hardkas.signedTx", "hardkas.migrationReceipt.v1"],
      "hardkas.txReceipt": ["hardkas.txTrace", "hardkas.migrationReceipt.v1"]
    };

    let isValidTransition = false;
    
    // Migration receipt rules
    if (parent.schema === "hardkas.migrationReceipt.v1") {
      isValidTransition = parent.toSchema === artifact.schema;
    } else if (artifact.schema === "hardkas.migrationReceipt.v1") {
      isValidTransition = artifact.fromSchema === parent.schema;
    } else {
      const allowed = validTransitions[parent.schema] || [];
      isValidTransition = allowed.includes(artifact.schema);
    }

    if (!isValidTransition) {
      // Also allow schema migration transitions (e.g., hardkas.txPlan.v1 → hardkas.txPlan)
      // where the parent's .v1 suffix was stripped during migration
      const parentBase = parent.schema?.replace(/\.v1$/, "");
      const childBase = artifact.schema?.replace(/\.v1$/, "");
      if (parentBase && childBase && parentBase === childBase) {
        isValidTransition = true;
      }
    }

    if (!isValidTransition) {
      addIssue(
        "INVALID_TRANSITION",
        `Invalid lineage transition: ${parent.schema} -> ${artifact.schema}`
      );
    }
  }

  return {
    ok: issues.every((i) => i.severity !== "error"),
    issues
  };
}

/**
 * Creates a valid lineage transition object for a new child artifact based on its parent.
 * This should be attached to the child artifact before calculating its final hash.
 */
export function createLineageTransition(parent: any, childType: string): { artifactId: string; lineageId: string; parentArtifactId: string; rootArtifactId: string; sequence: number; } {
  const parentLineage = parent.lineage || {};
  const parentId = parent.contentHash || parent.artifactId || parent.planId || parent.signedId || "0".repeat(64);

  return {
    artifactId: "", // To be computed after the rest of the artifact is hashed
    lineageId: parentLineage.lineageId || parentId,
    parentArtifactId: parentId,
    rootArtifactId: parentLineage.rootArtifactId || parentId,
    sequence: (parentLineage.sequence || 0) + 1
  };
}
