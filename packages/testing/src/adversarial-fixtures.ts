import {
  calculateContentHash,
  CURRENT_HASH_VERSION,
  ARTIFACT_VERSION
} from "@hardkas/artifacts";

/**
 * Generates artifacts with semantic or structural flaws for adversarial testing.
 */
export const AdversarialFixtures = {
  /**
   * Circular lineage: A -> B -> A
   */
  circularLineage() {
    // Legacy (hashVersion 3) artifacts: their lineage was never authenticated, so a
    // cycle can exist on disk while both artifacts still verify under their own rules.
    // Since Wave 1.2 a reference resolves only by verified identity, so the ids are
    // the real recomputed hashes.
    const bodyA: any = { schema: "hardkas.txPlan", version: ARTIFACT_VERSION, hashVersion: 3, networkId: "simnet", mode: "simulator", nonce: "A" };
    const bodyB: any = { schema: "hardkas.txPlan", version: ARTIFACT_VERSION, hashVersion: 3, networkId: "simnet", mode: "simulator", nonce: "B" };
    const hashA = calculateContentHash(bodyA, 3);
    const hashB = calculateContentHash(bodyB, 3);
    const artifactA: any = {
      ...bodyA,
      contentHash: hashA,
      lineage: { artifactId: hashA, lineageId: hashB, parentArtifactId: hashB, rootArtifactId: hashB, sequence: 2 }
    };
    const artifactB: any = {
      ...bodyB,
      contentHash: hashB,
      lineage: { artifactId: hashB, lineageId: hashA, parentArtifactId: hashA, rootArtifactId: hashA, sequence: 2 }
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
      mode: "simulator",
      amountSompi: "1000",
      estimatedFeeSompi: "1",
      estimatedMass: "1",
      from: { address: "kaspa:sim_qz0s9xrz5y5e8dq5azmpg756aeepm6fesq82ye7wv" },
      to: { address: "kaspa:sim_qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg" },
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
    // Sealed under the current hash version: the child's authenticated lineage points
    // at the parent's real identity, which lives on another network.
    const parent: any = {
      schema: "hardkas.txPlan",
      version: ARTIFACT_VERSION,
      hashVersion: CURRENT_HASH_VERSION,
      networkId: "mainnet",
      mode: "l1-rpc",
      lineage: { artifactId: "", sequence: 1 }
    };
    parent.contentHash = calculateContentHash(parent, CURRENT_HASH_VERSION);
    parent.lineage.artifactId = parent.contentHash;
    const child: any = {
      schema: "hardkas.signedTx",
      version: ARTIFACT_VERSION,
      hashVersion: CURRENT_HASH_VERSION,
      networkId: "simnet",
      mode: "simulator",
      lineage: {
        artifactId: "",
        parentArtifactId: parent.contentHash,
        lineageId: parent.contentHash,
        rootArtifactId: parent.contentHash,
        sequence: 2
      }
    };
    child.contentHash = calculateContentHash(child, CURRENT_HASH_VERSION);
    child.lineage.artifactId = child.contentHash;
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
      mode: "simulator"
    };
    return [
      {
        ...common,
        artifactId: "art-1",
        lineage: { sequenceId: 1, contentHash: "hash-1" }
      },
      {
        ...common,
        artifactId: "art-2",
        lineage: { sequenceId: 2, contentHash: "hash-2", parentArtifactId: "art-1" }
      },
      {
        ...common,
        artifactId: "art-3",
        lineage: { sequenceId: 2, contentHash: "hash-3-BAD", parentArtifactId: "art-1" }
      } // Duplicate sequenceId 2
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
      mode: "simulator",
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
      mode: "simulator"
    };
  }
};
