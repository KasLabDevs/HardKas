import { describe, it, expect } from "vitest";
import { HardkasSchemas, isKnownArtifactType, assertKnownArtifactType, describeArtifactType } from "../src/registry.js";

describe("Artifact Registry", () => {
  it("has unique values across all schemas", () => {
    const values = Object.values(HardkasSchemas);
    const uniqueValues = new Set(values);
    expect(values.length).toBe(uniqueValues.size);
  });

  it("isKnownArtifactType accepts all registered values", () => {
    for (const schema of Object.values(HardkasSchemas)) {
      expect(isKnownArtifactType(schema)).toBe(true);
    }
  });

  it("isKnownArtifactType rejects fake schemas", () => {
    expect(isKnownArtifactType("hardkas.fake.v1")).toBe(false);
    expect(isKnownArtifactType("hardkas.txPlan.v3")).toBe(false);
  });

  it("assertKnownArtifactType throws for fake schemas", () => {
    expect(() => assertKnownArtifactType("hardkas.fake.v1")).toThrow();
  });

  it("legacy schemas without .v1 are identified as legacy by describeArtifactType", () => {
    const legacySchemas = Object.values(HardkasSchemas).filter(s => !s.includes(".v") && !s.endsWith("V1"));
    for (const schema of legacySchemas) {
      const meta = describeArtifactType(schema);
      expect(meta.legacy).toBe(true);
      expect(meta.version).toBe("legacy");
    }
    // Just to ensure we found at least some legacy schemas (like hardkas.txPlan)
    expect(legacySchemas.length).toBeGreaterThan(0);
  });

});
