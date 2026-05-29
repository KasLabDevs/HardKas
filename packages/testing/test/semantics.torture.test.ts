import { expect, test, describe } from "vitest";
import {
  validateStatusTransition,
  assertNoSemanticDrift,
  resolveCanonicalArtifact,
  SemanticIdentity
} from "@hardkas/core";

describe("HardKAS Semantic Integrity Torture Tests", () => {
  describe("Artifact Status Lattice", () => {
    test("allows legal transitions", () => {
      expect(() => validateStatusTransition("PROJECTED", "VERIFIED")).not.toThrow();
      expect(() => validateStatusTransition("VERIFIED", "REPLAY_VERIFIED")).not.toThrow();
      expect(() => validateStatusTransition("VERIFIED", "STALE")).not.toThrow();
    });

    test("fails loudly on illegal transitions", () => {
      expect(() => validateStatusTransition("UNKNOWN", "REPLAY_VERIFIED")).toThrow(
        /CRITICAL SEMANTIC ERROR/
      );
      expect(() => validateStatusTransition("CORRUPTED", "VERIFIED")).toThrow(
        /CRITICAL SEMANTIC ERROR/
      );
    });
  });

  describe("Semantic Drift Detection", () => {
    const baseIdentity: SemanticIdentity = {
      artifactId: "test_art",
      schemaVersion: 1,
      semanticHash: "abc",
      status: "VERIFIED"
    };

    test("passes when all subsystems agree", () => {
      expect(() =>
        assertNoSemanticDrift(baseIdentity, baseIdentity, baseIdentity, baseIdentity)
      ).not.toThrow();
    });

    test("fails loudly when Dashboard hallucinates truth", () => {
      const hallucinatedDashboard = { ...baseIdentity, status: "VERIFIED" as const };
      const truthReplay = { ...baseIdentity, status: "STALE" as const };

      expect(() =>
        assertNoSemanticDrift(
          hallucinatedDashboard,
          truthReplay,
          truthReplay,
          truthReplay
        )
      ).toThrow(/CRITICAL SEMANTIC DRIFT/);
    });

    test("fails loudly on hash mismatch", () => {
      const corruptDashboard = { ...baseIdentity, semanticHash: "def" };
      expect(() =>
        assertNoSemanticDrift(corruptDashboard, baseIdentity, baseIdentity, baseIdentity)
      ).toThrow(/CRITICAL SEMANTIC DRIFT/);
    });
  });

  describe("Implicit Latest Resolution Ban", () => {
    test("forbids implicit latest resolution", () => {
      expect(() => resolveCanonicalArtifact({})).toThrow(/Implicit resolution forbidden/);
    });

    test("allows explicit pinning", () => {
      expect(resolveCanonicalArtifact({ artifactId: "id1" })).toBe("id1");
      expect(resolveCanonicalArtifact({ semanticHash: "hash1" })).toBe("hash1");
      expect(resolveCanonicalArtifact({ lineageId: "lin1" })).toBe("lin1");
    });
  });
});
