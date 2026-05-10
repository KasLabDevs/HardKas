import { BaseArtifact } from "@hardkas/artifacts";
import { coreEvents, CoreEvent } from "@hardkas/core";

/**
 * System Invariant Verifiers
 * 
 * Instead of just unit tests, these provide "System Guarantees".
 */

export const Invariants = {
  /**
   * Guarantee: An artifact's content hash MUST match its current state.
   */
  async verifyArtifactIntegrity(artifact: BaseArtifact<any>, calculateHash: (a: any) => string): Promise<boolean> {
    if (!artifact.contentHash) return true; // hash optional for some types
    const actual = calculateHash(artifact);
    return artifact.contentHash === actual;
  },

  /**
   * Guarantee: A Lineage chain MUST be strictly monotonic and linked.
   */
  verifyLineageContinuity(artifacts: BaseArtifact<any>[]): boolean {
    if (artifacts.length < 2) return true;
    
    const sorted = [...artifacts].sort((a, b) => 
      (a.lineage?.sequence ?? 0) - (b.lineage?.sequence ?? 0)
    );

    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      if (!prev || !curr) continue;
      
      if (curr.lineage?.parentArtifactId !== prev.lineage?.artifactId) {
        return false;
      }
      if (curr.lineage?.lineageId !== prev.lineage?.lineageId) {
        return false;
      }
    }
    return true;
  },

  /**
   * Guarantee: Every emission to the event bus MUST have a timestamp.
   */
  verifyEventCompliance(event: CoreEvent): boolean {
    return !!event.timestamp;
  }
};

/**
 * Invariant Watcher
 * Can be hooked into the event bus to detect violations in real-time.
 */
export class InvariantWatcher {
  private violations: string[] = [];

  constructor() {
    coreEvents.on(event => {
      if (!Invariants.verifyEventCompliance(event)) {
        this.violations.push(`Event compliance violation: ${event.kind}`);
      }
      
      if (event.kind === "integrity.hash_mismatch") {
        const payload = event.payload as any;
        this.violations.push(`Hash mismatch detected: ${payload.artifactId || event.artifactId}`);
      }
    });
  }

  getViolations() {
    return this.violations;
  }
  
  hasViolations() {
    return this.violations.length > 0;
  }
}
