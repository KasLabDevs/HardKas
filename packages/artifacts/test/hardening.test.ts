import { describe, it, expect } from "vitest";
import { calculateContentHash } from "../src/canonical.js";
import { verifyArtifactSemantics, Clock } from "../src/verify.js";

describe("Artifact Hardening (Phase 4)", () => {
  it("should have stable content hash (golden test)", () => {
    const artifact = {
      schema: "hardkas.test",
      version: "1.0.0",
      payload: "hello",
      mode: "simulated",
      networkId: "simnet",
      createdAt: "2026-05-10T10:00:00Z"
    };
    
    const hash = calculateContentHash(artifact);
    // Fixed hash for this specific object structure
    expect(hash).toBe("638a2ed70127166e8475a1d1e205e23ed4fd970e7c37c54acbd6fd6ca44744a4");
  });

  it("should use injected clock for semantic validation", () => {
    const artifact = {
      schema: "hardkas.test",
      version: "1.0.0",
      createdAt: "2026-05-10T10:00:00Z", // Fixed time
      mode: "simulated",
      networkId: "simnet"
    };

    const mockClock: Clock = {
      now: () => new Date("2026-05-10T12:00:00Z").getTime() // 2 hours later
    };

    const result = verifyArtifactSemantics(artifact, { clock: mockClock });
    // Should not be stale (only 2 hours old)
    const staleIssue = result.issues.find(i => i.code === "STALE_ARTIFACT");
    expect(staleIssue).toBeUndefined();

    const oldClock: Clock = {
      now: () => new Date("2026-06-15T12:00:00Z").getTime() // ~35 days later
    };

    const resultStale = verifyArtifactSemantics(artifact, { clock: oldClock });
    const staleIssueFound = resultStale.issues.find(i => i.code === "STALE_ARTIFACT");
    expect(staleIssueFound).toBeDefined();
    expect(staleIssueFound?.severity).toBe("error");
  });

  it("should distinguish between normal and strict mode for hardening fields", () => {
    const artifactMissing = {
      schema: "hardkas.test",
      version: "1.0.0",
      mode: "simulated",
      networkId: "simnet",
      createdAt: new Date().toISOString()
    };

    // Normal mode: should only warn
    const resultNormal = verifyArtifactSemantics(artifactMissing, { strict: false });
    const workflowIdIssue = resultNormal.issues.find(i => i.code === "MISSING_WORKFLOW_ID");
    expect(workflowIdIssue?.severity).toBe("warning");
    expect(resultNormal.ok).toBe(true);

    // Strict mode: should fail
    const resultStrict = verifyArtifactSemantics(artifactMissing, { strict: true });
    const workflowIdIssueStrict = resultStrict.issues.find(i => i.code === "MISSING_WORKFLOW_ID");
    expect(workflowIdIssueStrict?.severity).toBe("error");
    expect(resultStrict.ok).toBe(false);
  });

  it("should fail if networkId and address prefix mismatch", () => {
    const artifact = {
      schema: "hardkas.test",
      version: "1.0.0",
      mode: "simulated",
      networkId: "mainnet",
      createdAt: new Date().toISOString(),
      from: { address: "kaspatest:qzhj..." } // Testnet address on mainnet
    };

    const result = verifyArtifactSemantics(artifact);
    const mismatchIssue = result.issues.find(i => i.code === "NETWORK_ADDRESS_MISMATCH");
    expect(mismatchIssue).toBeDefined();
    expect(mismatchIssue?.severity).toBe("error");
  });
});
