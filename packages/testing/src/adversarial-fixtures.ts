import { calculateContentHash, CURRENT_HASH_VERSION, ARTIFACT_VERSION } from "@hardkas/artifacts";

/**
 * Generates artifacts with semantic or structural flaws for adversarial testing.
 */
export const AdversarialFixtures = {
  /**
   * Circular lineage: A -> B -> A
   */
  circularLineage() {
    const artifactA: any = {
      schema: "hardkas.txPlan",
      version: ARTIFACT_VERSION,
      artifactId: "art-a",
      contentHash: "hash-a",
      networkId: "simnet",
      mode: "simulated",
      lineage: { parentArtifactId: "art-b" }
    };
    const artifactB: any = {
      schema: "hardkas.txPlan",
      version: ARTIFACT_VERSION,
      artifactId: "art-b",
      contentHash: "hash-b",
      networkId: "simnet",
      mode: "simulated",
      lineage: { parentArtifactId: "art-a" }
    };
    return { artifactA, artifactB };
  },

  /**
   * Artifact where the contentHash does not match the actual content calculation.
   */
  hashMismatch() {
    const artifact: any = {
      schema: "hardkas.txPlan",
      version: ARTIFACT_VERSION,
      networkId: "simnet",
      mode: "simulated",
      amountSompi: "1000",
      estimatedFeeSompi: "1",
      estimatedMass: "1",
      from: { address: "kaspasim:qz0s9xrz5y5e8dq5azmpg756aeepm6fesq82ye7wv" },
      to: { address: "kaspasim:qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg" },
      inputs: [],
      outputs: [],
      hashVersion: CURRENT_HASH_VERSION
    };
    const realHash = calculateContentHash(artifact, CURRENT_HASH_VERSION);
    artifact.contentHash = "f" + realHash.slice(1); // Tampered
    artifact.artifactId = `plan-${artifact.contentHash.slice(0, 16)}`;
    artifact.planId = artifact.artifactId;
    return artifact;
  },

  /**
   * Artifact with a parent from a different network (Security Violation).
   */
  crossNetworkLineage() {
    const parent: any = {
      schema: "hardkas.txPlan",
      version: ARTIFACT_VERSION,
      artifactId: "parent-mainnet",
      contentHash: "hash-mainnet",
      networkId: "mainnet",
      mode: "l1-rpc"
    };
    const child: any = {
      schema: "hardkas.signedTx",
      version: ARTIFACT_VERSION,
      artifactId: "child-simnet",
      contentHash: "hash-simnet",
      networkId: "simnet",
      mode: "simulated",
      lineage: { 
        artifactId: "hash-simnet",
        parentArtifactId: "parent-mainnet",
        lineageId: "b".repeat(64),
        rootArtifactId: "c".repeat(64)
      }
    };
    return { parent, child };
  },

  /**
   * Trace with duplicate event IDs (Corruption).
   */
  duplicateEventTrace() {
    return {
      schema: "hardkas.trace",
      workflowId: "wf-1",
      events: [
        { eventId: "ev-1", kind: "start" },
        { eventId: "ev-1", kind: "step" } // Duplicate ID
      ]
    };
  },

  /**
   * Malformed JSONL snippet (truncated).
   */
  malformedJsonl() {
    return `{"eventId":"ev-1","kind":"start"}\n{"eventId":"ev-2","kind":"step",`; // Truncated line
  },

  /**
   * Lineage with sequence rollback (corrupted history).
   */
  sequenceRollback() {
    const common = {
      schema: "hardkas.txPlan",
      version: ARTIFACT_VERSION,
      networkId: "simnet",
      mode: "simulated"
    };
    return [
      { ...common, artifactId: "art-1", lineage: { sequenceId: 1, contentHash: "hash-1" } },
      { ...common, artifactId: "art-2", lineage: { sequenceId: 2, contentHash: "hash-2", parentArtifactId: "art-1" } },
      { ...common, artifactId: "art-3", lineage: { sequenceId: 2, contentHash: "hash-3-BAD", parentArtifactId: "art-1" } } // Duplicate sequenceId 2
    ];
  },

  /**
   * Artifact with a future timestamp (anomaly).
   * Intentionally uses Date.now() to generate a timestamp far in the future.
   */
  futureTimestamp() {
    const farFuture = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365 * 10).toISOString();
    return {
      schema: "hardkas.txPlan",
      version: ARTIFACT_VERSION,
      artifactId: "art-future",
      contentHash: "hash-future",
      networkId: "simnet",
      mode: "simulated",
      createdAt: farFuture
    };
  },

  /**
   * Artifact with an unsupported version.
   */
  unsupportedVersion() {
    return {
      schema: "hardkas.txPlan",
      version: "99.9.9", // Future version
      artifactId: "art-vnext",
      contentHash: "hash-vnext",
      networkId: "simnet",
      mode: "simulated"
    };
  }
};
