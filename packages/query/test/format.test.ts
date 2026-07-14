import { describe, it, expect } from "vitest";
import { paginateAndFormatResult } from "../src/format.js";
import type { QueryRequest } from "../src/types.js";

describe("paginateAndFormatResult", () => {
  const mockItems = Array.from({ length: 10 }, (_, i) => ({ id: i, name: `Item ${i}` }));
  const baseRequest: QueryRequest = {
    domain: "artifacts",
    op: "list"
  };

  it("should handle offset = 0", () => {
    const res = paginateAndFormatResult({
      request: { ...baseRequest, limit: 3, offset: 0 },
      items: mockItems,
      domain: "artifacts",
      op: "list",
      deterministic: true
    });
    expect(res.items).toHaveLength(3);
    expect(res.items[0]).toEqual(mockItems[0]);
    expect(res.total).toBe(10);
    expect(res.truncated).toBe(true);
  });

  it("should handle intermediate offset", () => {
    const res = paginateAndFormatResult({
      request: { ...baseRequest, limit: 3, offset: 4 },
      items: mockItems,
      domain: "artifacts",
      op: "list",
      deterministic: true
    });
    expect(res.items).toHaveLength(3);
    expect(res.items[0]).toEqual(mockItems[4]);
    expect(res.total).toBe(10);
    expect(res.truncated).toBe(true);
  });

  it("should handle missing limit", () => {
    const res = paginateAndFormatResult({
      request: { ...baseRequest, offset: 5 },
      items: mockItems,
      domain: "artifacts",
      op: "list",
      deterministic: true
    });
    expect(res.items).toHaveLength(5);
    expect(res.total).toBe(10);
    expect(res.truncated).toBe(false);
  });

  it("should handle offset greater than total", () => {
    const res = paginateAndFormatResult({
      request: { ...baseRequest, offset: 15, limit: 5 },
      items: mockItems,
      domain: "artifacts",
      op: "list",
      deterministic: true
    });
    expect(res.items).toHaveLength(0);
    expect(res.total).toBe(10);
    expect(res.truncated).toBe(false);
  });

  it("should ensure deterministic hashes do not depend on runtime metadata", () => {
    const res1 = paginateAndFormatResult({
      request: baseRequest,
      items: mockItems,
      domain: "artifacts",
      op: "list",
      deterministic: true,
      annotations: { executedAt: "2026-07-13T10:00:00Z" }
    });

    const res2 = paginateAndFormatResult({
      request: baseRequest,
      items: mockItems,
      domain: "artifacts",
      op: "list",
      deterministic: true,
      annotations: { executedAt: "2026-07-13T11:00:00Z" }
    });

    expect(res1.queryHash).toBeDefined();
    expect(res1.resultHash).toBeDefined();
    expect(res1.queryHash).toBe(res2.queryHash);
    expect(res1.resultHash).toBe(res2.resultHash);
  });

  it("should have same queryHash but different resultHash for different pages of the same query", () => {
    const page1 = paginateAndFormatResult({
      request: { ...baseRequest, offset: 0, limit: 5 },
      items: mockItems,
      domain: "artifacts",
      op: "list",
      deterministic: true
    });

    const page2 = paginateAndFormatResult({
      request: { ...baseRequest, offset: 5, limit: 5 },
      items: mockItems,
      domain: "artifacts",
      op: "list",
      deterministic: true
    });

    // Query parameters (domain, op, filters) are the same, so queryHash is identical
    expect(page1.queryHash).toBe(page2.queryHash);
    
    // The items on the page differ, so resultHash must differ
    expect(page1.resultHash).not.toBe(page2.resultHash);
  });
});
