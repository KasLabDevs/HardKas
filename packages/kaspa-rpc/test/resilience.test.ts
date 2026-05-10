import { describe, it, expect } from "vitest";
import { calculateConfidence, classifyRpcError } from "../src/resilience.js";

describe("RPC Resilience & Confidence (Fase 3 Hardening)", () => {
  describe("calculateConfidence", () => {
    it("should report high confidence for a healthy node", () => {
      const result = calculateConfidence({
        latencyMs: 100,
        successRate: 100,
        retries: 0,
        stale: false,
        reachable: true,
        circuitOpen: false
      });
      expect(result.confidence).toBe("high");
      expect(result.state).toBe("healthy");
      expect(result.score).toBe(100);
    });

    it("should report low confidence for an unreachable node", () => {
      const result = calculateConfidence({
        latencyMs: null,
        successRate: 0,
        retries: 0,
        stale: false,
        reachable: false,
        circuitOpen: false
      });
      expect(result.confidence).toBe("low");
      expect(result.state).toBe("unreachable");
    });

    it("should report stale state for a node with non-advancing DAA", () => {
      const result = calculateConfidence({
        latencyMs: 100,
        successRate: 100,
        retries: 0,
        stale: true,
        reachable: true,
        circuitOpen: false
      });
      expect(result.state).toBe("stale");
      expect(result.confidence).toBe("medium"); // Score 100 - 40 = 60
    });

    it("should degrade confidence on high latency", () => {
      const result = calculateConfidence({
        latencyMs: 1200,
        successRate: 100,
        retries: 0,
        stale: false,
        reachable: true,
        circuitOpen: false
      });
      expect(result.score).toBe(80);
      expect(result.confidence).toBe("medium");
      expect(result.issues).toContain("High latency: 1200ms");
    });

    it("should report low confidence when circuit is open", () => {
      const result = calculateConfidence({
        latencyMs: 100,
        successRate: 50,
        retries: 5,
        stale: false,
        reachable: true,
        circuitOpen: true
      });
      expect(result.confidence).toBe("low");
      expect(result.issues).toContain("Circuit breaker is OPEN");
    });
  });

  describe("classifyRpcError", () => {
    it("should classify validation errors as non-retriable", () => {
      const err = new Error("Invalid address format");
      const classification = classifyRpcError(err);
      expect(classification.retriable).toBe(false);
      expect(classification.category).toBe("validation");
    });

    it("should classify timeout as retriable", () => {
      const err = new Error("RPC request timed out");
      const classification = classifyRpcError(err);
      expect(classification.retriable).toBe(true);
      expect(classification.category).toBe("network");
    });

    it("should classify 429 as retriable", () => {
      const err = new Error("HTTP Error 429: Too many requests");
      const classification = classifyRpcError(err);
      expect(classification.retriable).toBe(true);
      expect(classification.category).toBe("network");
    });
  });
});
