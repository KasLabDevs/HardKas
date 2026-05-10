/**
 * Deterministic serialization for query results.
 * Guarantees: same items → same JSON output → same queryHash.
 * Uses canonicalStringify from @hardkas/artifacts for key-sorted, BigInt-safe output.
 */
import { createHash } from "node:crypto";
import { canonicalStringify } from "@hardkas/artifacts";
import type { QueryResult } from "./types.js";

/**
 * Computes a SHA-256 hash of the deterministic serialization of items.
 * This hash is stable: identical items always produce identical hashes.
 */
export function computeQueryHash(items: readonly unknown[]): string {
  const canonical = canonicalStringify(items);
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Serializes a QueryResult to deterministic JSON.
 * The `annotations` block is included but clearly non-deterministic.
 * The `queryHash` enables diffing results across environments.
 */
export function serializeQueryResult(result: QueryResult): string {
  // Build a key-sorted deterministic representation
  const output: Record<string, unknown> = {
    annotations: result.annotations,
    deterministic: result.deterministic,
    domain: result.domain,
    items: result.items,
    op: result.op,
    queryHash: result.queryHash,
    total: result.total,
    truncated: result.truncated
  };

  if (result.explain) {
    output["explain"] = result.explain;
  }

  return JSON.stringify(output, bigIntReplacer, 2);
}

function bigIntReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}
