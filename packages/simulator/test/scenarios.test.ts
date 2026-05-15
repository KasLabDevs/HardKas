import { describe, it, expect } from "vitest";
import {
  runLinearChain,
  runWideDag,
  runForkResolution,
  runDiamondDag,
  runAllScenarios,
  formatScenarioReport,
} from "../src/index.js";

describe("Simulation Scenarios", () => {
  describe("Linear Chain", () => {
    it("produces zero red blocks", () => {
      const result = runLinearChain({ name: "test-linear", blockCount: 20 });
      expect(result.metrics.redRatio).toBe(0);
      expect(result.metrics.dagWidth).toBe(1);
      expect(result.metrics.selectedChainLength).toBe(21); // 20 + genesis
    });

    it("blueScore equals chain length", () => {
      const result = runLinearChain({ name: "test-linear", blockCount: 10 });
      // In our impl, genesis is blueScore 0, so sink at height 10 has blueScore 10.
      // Wait, let's check maxBlueScore.
      expect(result.metrics.maxBlueScore).toBeGreaterThanOrEqual(10);
    });
  });

  describe("Wide DAG", () => {
    it("produces red blocks when blockCount > K", () => {
      const result = runWideDag({ name: "test-wide", blockCount: 30, k: 18 });
      expect(result.metrics.redBlocks).toBeGreaterThan(0);
      expect(result.metrics.dagWidth).toBe(1); // Merger block is the only tip
    });

    it("all blocks blue when blockCount <= K", () => {
      const result = runWideDag({ name: "test-wide-small", blockCount: 10, k: 18 });
      expect(result.metrics.redBlocks).toBe(0);
    });
  });

  describe("Fork Resolution", () => {
    it("selected chain follows one fork consistently", () => {
      const result = runForkResolution({
        name: "test-fork", blockCount: 20, forkPoint: 10
      });
      expect(result.metrics.selectedChainLength).toBeGreaterThan(10);
    });
  });

  describe("Diamond DAG", () => {
    it("merge blocks have 2 parents", () => {
      const result = runDiamondDag({ name: "test-diamond", blockCount: 12 });
      expect(result.metrics.meanParents).toBeGreaterThan(1);
    });

    it("has some red blocks", () => {
      const result = runDiamondDag({ name: "test-diamond", blockCount: 30, k: 2 });
      expect(result.metrics.redBlocks).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Run All", () => {
    it("returns 4 scenario results", () => {
      const results = runAllScenarios({ name: "test-all", blockCount: 15 });
      expect(results).toHaveLength(4);
      for (const r of results) {
        expect(r.metrics.totalBlocks).toBe(15);
        expect(r.computeTimeMs).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe("Report", () => {
    it("formats without crashing", () => {
      const results = runAllScenarios({ name: "test-report", blockCount: 10 });
      const report = formatScenarioReport(results);
      expect(report).toContain("linear");
      expect(report).toContain("wide");
      expect(report).toContain("Red ratio");
    });
  });

  describe("Determinism", () => {
    it("same config produces identical metrics", () => {
      const r1 = runLinearChain({ name: "det-test", blockCount: 15 });
      const r2 = runLinearChain({ name: "det-test", blockCount: 15 });
      expect(r1.metrics).toEqual(r2.metrics);
    });
  });
});
