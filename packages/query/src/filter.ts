/**
 * Filter evaluation engine.
 * Evaluates QueryFilter[] predicates against arbitrary objects using dot-path field access.
 * All evaluation is deterministic and null-safe.
 */
import type { QueryFilter, FilterOp } from "./types.js";

/**
 * Resolves a dot-separated field path on an object.
 * Returns undefined if any segment is missing.
 */
export function resolveFieldPath(obj: unknown, path: string): unknown {
  if (obj === null || obj === undefined) return undefined;

  const segments = path.split(".");
  let current: unknown = obj;

  for (const seg of segments) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[seg];
  }

  return current;
}

/**
 * Evaluates a single filter predicate against an item.
 */
export function evaluateFilter(item: unknown, filter: QueryFilter): boolean {
  const value = resolveFieldPath(item, filter.field);
  return applyOp(value, filter.op, filter.value);
}

/**
 * Evaluates all filters (AND semantics). Returns true only if all pass.
 */
export function evaluateFilters(item: unknown, filters: readonly QueryFilter[]): boolean {
  for (const f of filters) {
    if (!evaluateFilter(item, f)) return false;
  }
  return true;
}

/**
 * Applies a filter operation to a resolved value.
 */
function applyOp(resolved: unknown, op: FilterOp, target: QueryFilter["value"]): boolean {
  // Strict equality checks - no loose coercion
  if (op === "eq") {
    if (resolved === target) return true;
    if (typeof resolved === "bigint" && typeof target === "string") {
      try { return resolved === BigInt(target); } catch { return false; }
    }
    return false;
  }

  if (op === "neq") {
    return !applyOp(resolved, "eq", target);
  }

  if (op === "exists") {
    return resolved !== undefined && resolved !== null;
  }

  // Comparison ops
  if (op === "gt" || op === "lt" || op === "gte" || op === "lte") {
    const rNum = toNumber(resolved);
    const tNum = toNumber(target);
    if (rNum === null || tNum === null) return false;

    switch (op) {
      case "gt": return rNum > tNum;
      case "lt": return rNum < tNum;
      case "gte": return rNum >= tNum;
      case "lte": return rNum <= tNum;
    }
  }

  if (op === "in") {
    if (!Array.isArray(target)) return false;
    return target.some(t => applyOp(resolved, "eq", t));
  }

  if (op === "contains") {
    if (typeof resolved !== "string") return false;
    return resolved.includes(String(target));
  }

  return false;
}

function toNumber(v: unknown): number | bigint | null {
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "bigint") return v;
  if (typeof v === "string") {
    try {
      if (v.includes(".")) return parseFloat(v);
      return BigInt(v);
    } catch {
      return null;
    }
  }
  return null;
}
