import { describe, it, expect } from "vitest";
import { explainIntegrity, explainTransition, explainOrphan, formatExplainBlock, formatWhyBlock } from "../src/explain.js";
import type { ArtifactQueryItem, LineageNode, LineageTransition, ExplainBlock } from "../src/types.js";

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
    expect(chain.model).toBe("integrity-verifier");
    expect(chain.conclusion).toBeUndefined(); // WhyBlock doesn't have conclusion field anymore, it's 'answer'
    expect(chain.answer).toContain("All deterministic checks");
    expect(chain.steps).toBeUndefined(); // It's causalChain now
    expect(chain.causalChain.length).toBeGreaterThanOrEqual(2);
  });

  it("should explain an invalid artifact", () => {
    const item: ArtifactQueryItem = {
      filePath: "/test.json",
      schema: "hardkas.unknown",
      version: "1.0.0-alpha",
      networkId: "simnet",
      mode: "simulated",
      createdAt: "2026-01-01T00:00:00Z",
      contentHash: "foo"
    };

    const chain = explainIntegrity(item, { ok: false, hashMatch: false, schemaValid: false, errors: ["Schema not recognized"] });

    expect(chain.answer).toContain("Verification failed");
    expect(chain.causalChain.some(s => s.assertion.includes("not recognized"))).toBe(true);
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

    expect(chain.answer).toContain("consistent with HardKAS state transition rules");
    expect(chain.model).toBe("causal-lineage");
    expect(chain.confidence).toBe("definitive");
    expect(chain.causalChain.length).toBeGreaterThanOrEqual(2);
  });

  it("should explain an invalid snapshot → txReceipt transition", () => {
    const transition: LineageTransition = {
      from: mockNode("hardkas.snapshot"),
      to: mockNode("hardkas.txReceipt"),
      valid: false,
      rule: "hardkas.snapshot → hardkas.txReceipt (INVALID)"
    };

    const chain = explainTransition(transition);

    expect(chain.answer).toContain("Workflow violation");
    expect(chain.causalChain.some(s => s.assertion.includes("NOT allowed"))).toBe(true);
  });

  it("should detect context mismatch", () => {
    const transition: LineageTransition = {
      from: mockNode("hardkas.txPlan", { networkId: "simnet" }),
      to: mockNode("hardkas.signedTx", { networkId: "testnet" }),
      valid: true,
      rule: "hardkas.txPlan → hardkas.signedTx (valid)"
    };

    const chain = explainTransition(transition);
    expect(chain.causalChain.some(s => s.assertion.includes("CONTEXT MISMATCH"))).toBe(true);
  });
});

describe("explainOrphan", () => {
  it("should explain why an artifact is orphaned", () => {
    const node = mockNode("hardkas.signedTx", { parentArtifactId: "e".repeat(64) });
    const chain = explainOrphan(node, "e".repeat(64));

    expect(chain.answer).toContain("missing from the indexed store");
    expect(chain.causalChain.length).toBe(2);
    expect(chain.model).toBe("orphan-analysis");
  });
});

describe("formatting", () => {
  it("formatExplainBlock should produce diagnostics", () => {
    const block: ExplainBlock = {
      backend: "sqlite",
      freshness: "fresh",
      rowsRead: 10,
      scannedFiles: 0,
      executionPlan: ["Scan", "Filter"],
      indexesUsed: ["PRIMARY"],
      filtersApplied: ["schema eq ..."],
      warnings: []
    };

    const output = formatExplainBlock(block);
    expect(output).toContain("[Explain: Technical Diagnostics]");
    expect(output).toContain("Backend:      sqlite");
  });

  it("formatWhyBlock should produce causal output", () => {
    const chain = explainIntegrity(
      { filePath: "/t.json", schema: "hardkas.txPlan", version: "1.0.0-alpha", networkId: "simnet", mode: "simulated", createdAt: "" },
      { ok: true, hashMatch: true, schemaValid: true, errors: [] }
    );

    const output = formatWhyBlock(chain);
    expect(output).toContain("[Why: Causal Analysis]");
    expect(output).toContain("Q:");
    expect(output).toContain("A:");
  });
});
