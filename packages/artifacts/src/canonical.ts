import { createHash } from "node:crypto";

/**
 * Deterministically stringifies an object by sorting keys recursively.
 * Handles BigInt by converting to string.
 * Excludes 'contentHash', 'artifactId', and 'lineage' fields during serialization.
 * Skips keys with undefined values (matching JSON.stringify behavior).
 */
export function canonicalStringify(obj: any): string {
  if (obj === null || typeof obj !== "object") {
    if (typeof obj === "bigint") {
      return obj.toString();
    }
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return "[" + obj.map(item => canonicalStringify(item)).join(",") + "]";
  }

  const sortedKeys = Object.keys(obj)
    .filter(key =>
      key !== "contentHash" &&
      key !== "artifactId" &&
      key !== "lineage" &&
      obj[key] !== undefined
    )
    .sort();

  const result = sortedKeys
    .map(key => {
      const value = obj[key];
      return JSON.stringify(key) + ":" + canonicalStringify(value);
    })
    .join(",");

  return "{" + result + "}";
}

/**
 * Calculates a SHA-256 hash of the canonical JSON representation.
 * Always excludes the 'contentHash' field from the calculation.
 */
export function calculateContentHash(obj: any): string {
  const canonical = canonicalStringify(obj);
  return createHash("sha256").update(canonical).digest("hex");
}
