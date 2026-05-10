import { describe, it, expect } from "vitest";
import { explainIntegrity, explainTransition, explainOrphan, formatExplainBrief, formatExplainFull } from "../src/explain.js";
import type { ArtifactQueryItem, LineageNode, LineageTransition } from "../src/types.js";

const mockNode = (schema: string, overrides: Partial<LineageNode> = {}): LineageNode => ({
  contentHash: "a".repeat(64),
  schema,
  artifactId: "b".repeat(64),
  rootArtifactId: "c".repeat(64),
  lineageId: "d".repeat(64),
  filePath: "/test/artifact.json",
  networkId: "simnet",
  mode: "simulated",
  createdAt: "2026-01-01T00:00:00Z",
  ...overrides
});

describe("explainIntegrity", () => {
  it("should explain a valid artifact", () => {
    const item: ArtifactQueryItem = {
      filePath: "/test.json",
      schema: "hardkas.txPlan",
      version: "1.0.0-alpha",
      networkId: "simnet",
      mode: "simulated",
      createdAt: "2026-01-01T00:00:00Z",
      contentHash: "abc123"
    };

    const chain = explainIntegrity(item, { ok: true, hashMatch: true, schemaValid: true, errors: [] });

    expect(chain.confidence).toBe("definitive");
    expect(chain.model).toBe("artifact-verification");
    expect(chain.conclusion).toContain("All integrity checks passed");
    expect(chain.steps.length).toBeGreaterThanOrEqual(2);
  });

  it("should explain an invalid artifact", () => {
    const item: ArtifactQueryItem = {
      filePath: "/test.json",
      schema: "hardkas.unknown",
      version: "1.0.0-alpha",
      networkId: "simnet",
      mode: "simulated",
      createdAt: "2026-01-01T00:00:00Z"
    };

    const chain = explainIntegrity(item, { ok: false, hashMatch: false, schemaValid: false, errors: ["Schema not recognized"] });

    expect(chain.conclusion).toContain("Integrity check failed");
    expect(chain.steps.some(s => s.assertion.includes("not recognized"))).toBe(true);
  });
});

describe("explainTransition", () => {
  it("should explain a valid txPlan → signedTx transition", () => {
    const transition: LineageTransition = {
      from: mockNode("hardkas.txPlan"),
      to: mockNode("hardkas.signedTx"),
      valid: true,
      rule: "hardkas.txPlan → hardkas.signedTx (valid)"
    };

    const chain = explainTransition(transition);

    expect(chain.conclusion).toContain("Valid transition");
    expect(chain.model).toBe("lineage-rules");
    expect(chain.confidence).toBe("definitive");
    expect(chain.steps.length).toBeGreaterThanOrEqual(4); // rule lookup, check, network, mode
  });

  it("should explain an invalid snapshot → txReceipt transition", () => {
    const transition: LineageTransition = {
      from: mockNode("hardkas.snapshot"),
      to: mockNode("hardkas.txReceipt"),
      valid: false,
      rule: "hardkas.snapshot → hardkas.txReceipt (INVALID)"
    };

    const chain = explainTransition(transition);

    expect(chain.conclusion).toContain("Invalid transition");
    expect(chain.steps.some(s => s.assertion.includes("NOT in the allowed set"))).toBe(true);
  });

  it("should detect network contamination", () => {
    const transition: LineageTransition = {
      from: mockNode("hardkas.txPlan", { networkId: "simnet" }),
      to: mockNode("hardkas.signedTx", { networkId: "testnet" }),
      valid: true,
      rule: "hardkas.txPlan → hardkas.signedTx (valid)"
    };

    const chain = explainTransition(transition);
    expect(chain.steps.some(s => s.assertion.includes("NETWORK CONTAMINATION"))).toBe(true);
  });
});

describe("explainOrphan", () => {
  it("should explain why an artifact is orphaned", () => {
    const node = mockNode("hardkas.signedTx", { parentArtifactId: "e".repeat(64) });
    const chain = explainOrphan(node, "e".repeat(64));

    expect(chain.conclusion).toContain("not found in the artifact store");
    expect(chain.steps.length).toBe(3);
    expect(chain.model).toBe("lineage-rules");
  });
});

describe("formatting", () => {
  it("formatExplainBrief should produce a one-liner", () => {
    const chain = explainIntegrity(
      { filePath: "/t.json", schema: "hardkas.txPlan", version: "1.0.0-alpha", networkId: "simnet", mode: "simulated", createdAt: "" },
      { ok: true, hashMatch: true, schemaValid: true, errors: [] }
    );

    const brief = formatExplainBrief(chain);
    expect(brief).toContain("[model: artifact-verification");
    expect(brief.split("\n").length).toBe(1);
  });

  it("formatExplainFull should produce multi-line output", () => {
    const chain = explainIntegrity(
      { filePath: "/t.json", schema: "hardkas.txPlan", version: "1.0.0-alpha", networkId: "simnet", mode: "simulated", createdAt: "" },
      { ok: true, hashMatch: true, schemaValid: true, errors: [] }
    );

    const full = formatExplainFull(chain);
    expect(full).toContain("Q:");
    expect(full).toContain("Conclusion:");
    expect(full).toContain("Evidence:");
    expect(full.split("\n").length).toBeGreaterThan(5);
  });
});
