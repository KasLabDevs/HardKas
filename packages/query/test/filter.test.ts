import { describe, it, expect } from "vitest";
import { resolveFieldPath, evaluateFilter, evaluateFilters } from "../src/filter.js";

describe("resolveFieldPath", () => {
  it("should resolve top-level fields", () => {
    expect(resolveFieldPath({ a: 1 }, "a")).toBe(1);
  });

  it("should resolve nested fields", () => {
    expect(resolveFieldPath({ from: { address: "kaspa:abc" } }, "from.address")).toBe("kaspa:abc");
  });

  it("should return undefined for missing paths", () => {
    expect(resolveFieldPath({ a: 1 }, "b")).toBeUndefined();
    expect(resolveFieldPath({ a: 1 }, "a.b.c")).toBeUndefined();
  });

  it("should handle null/undefined gracefully", () => {
    expect(resolveFieldPath(null, "a")).toBeUndefined();
    expect(resolveFieldPath(undefined, "a")).toBeUndefined();
  });

  it("should resolve deeply nested paths", () => {
    expect(resolveFieldPath({ lineage: { sequence: 3 } }, "lineage.sequence")).toBe(3);
  });
});

describe("evaluateFilter", () => {
  it("eq — matches string equality", () => {
    expect(evaluateFilter({ schema: "hardkas.txPlan" }, { field: "schema", op: "eq", value: "hardkas.txPlan" })).toBe(true);
    expect(evaluateFilter({ schema: "hardkas.txPlan" }, { field: "schema", op: "eq", value: "hardkas.signedTx" })).toBe(false);
  });

  it("neq — matches inequality", () => {
    expect(evaluateFilter({ mode: "simulated" }, { field: "mode", op: "neq", value: "real" })).toBe(true);
    expect(evaluateFilter({ mode: "real" }, { field: "mode", op: "neq", value: "real" })).toBe(false);
  });

  it("gt/lt — numeric comparison", () => {
    expect(evaluateFilter({ amount: "500" }, { field: "amount", op: "gt", value: 100 })).toBe(true);
    expect(evaluateFilter({ amount: "50" }, { field: "amount", op: "gt", value: 100 })).toBe(false);
    expect(evaluateFilter({ amount: "50" }, { field: "amount", op: "lt", value: 100 })).toBe(true);
  });

  it("in — membership check", () => {
    expect(evaluateFilter({ networkId: "simnet" }, { field: "networkId", op: "in", value: ["simnet", "testnet"] })).toBe(true);
    expect(evaluateFilter({ networkId: "mainnet" }, { field: "networkId", op: "in", value: ["simnet", "testnet"] })).toBe(false);
  });

  it("contains — substring match", () => {
    expect(evaluateFilter({ schema: "hardkas.txPlan" }, { field: "schema", op: "contains", value: "txPlan" })).toBe(true);
    expect(evaluateFilter({ schema: "hardkas.txPlan" }, { field: "schema", op: "contains", value: "receipt" })).toBe(false);
  });

  it("exists — field presence", () => {
    expect(evaluateFilter({ from: { address: "a" } }, { field: "from", op: "exists", value: true })).toBe(true);
    expect(evaluateFilter({}, { field: "from", op: "exists", value: true })).toBe(false);
  });

  it("handles nested field paths", () => {
    expect(evaluateFilter(
      { from: { address: "kaspa:alice" } },
      { field: "from.address", op: "eq", value: "kaspa:alice" }
    )).toBe(true);
  });
});

describe("evaluateFilters (AND semantics)", () => {
  it("should return true when all filters pass", () => {
    const item = { schema: "hardkas.txPlan", networkId: "simnet", mode: "simulated" };
    const filters = [
      { field: "schema", op: "eq" as const, value: "hardkas.txPlan" },
      { field: "networkId", op: "eq" as const, value: "simnet" }
    ];
    expect(evaluateFilters(item, filters)).toBe(true);
  });

  it("should return false when any filter fails", () => {
    const item = { schema: "hardkas.txPlan", networkId: "mainnet" };
    const filters = [
      { field: "schema", op: "eq" as const, value: "hardkas.txPlan" },
      { field: "networkId", op: "eq" as const, value: "simnet" }
    ];
    expect(evaluateFilters(item, filters)).toBe(false);
  });

  it("should return true for empty filter list", () => {
    expect(evaluateFilters({ a: 1 }, [])).toBe(true);
  });
});
