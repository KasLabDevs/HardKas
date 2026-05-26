import { createHash } from "node:crypto";
import { deterministicCompare } from "@hardkas/core";
export const SEMANTIC_EXCLUSIONS = new Set([
  "contentHash",
  "artifactId",
  "planId",
  "lineage",
  "createdAt",
  "rpcUrl",
  "rpcHost",
  "latencyMs",
  "indexedAt",
  "file_path",
  "file_mtime_ms",
  "hardkasVersion",
  "hashVersion", // Exclude hash version from hash
  "parentArtifactId",
  "signedId",
  "deployedAt",
  "tracePath",
  "receiptPath",
  "events",
  "status",
  "sourceSignedId",
  "submittedAt",
  "confirmedAt",
  "dagContext"
]);

/**
 * Current canonicalization version.
 * v1: BigInt(123) -> "123" (Collision with String "123")
 * v2: BigInt(123) -> "n:123" (Distinguishable)
 * v3: String normalization (\r\n -> \n, NFC) for cross-platform stability.
 */
export const CURRENT_HASH_VERSION = 3;

/**
 * Deterministically stringifies an object by sorting keys recursively.
 * Handles BigInt by converting to string with type marker.
 * Excludes fields in SEMANTIC_EXCLUSIONS during serialization.
 * Skips keys with undefined values (matching JSON.stringify behavior).
 */
export function canonicalStringify(obj: unknown, version: number = CURRENT_HASH_VERSION): string {
  if (obj === null || typeof obj !== "object") {
    if (typeof obj === "bigint") {
      // v2+ adds a type marker to distinguish BigInt from String.
      // v1 was just JSON.stringify(obj.toString())
      if (version >= 2) {
        return JSON.stringify(`n:${obj.toString()}`);
      }
      return JSON.stringify(obj.toString());
    }

    if (typeof obj === "string" && version >= 3) {
      // v3+ normalizes newlines, path separators, and UTF-8 for cross-platform determinism
      // Convert Windows backslashes to POSIX forward slashes to prevent platform drift
      const normalized = obj.normalize("NFC")
        .replace(/\r\n/g, "\n")
        .replace(/\\/g, "/");
      return JSON.stringify(normalized);
    }

    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return "[" + obj.map(item => canonicalStringify(item, version)).join(",") + "]";
  }

  if (obj instanceof Map) {
    throw new Error("Map is not canonicalizable. Use a plain object.");
  }
  if (obj instanceof Set) {
    throw new Error("Set is not canonicalizable. Use an array.");
  }
  if (obj instanceof Date) {
    throw new Error("Date must be serialized explicitly.");
  }

  const proto = Object.getPrototypeOf(obj);
  if (proto !== Object.prototype && proto !== null) {
    throw new Error("Non-plain object encountered in canonicalizer.");
  }

  const sortedKeys = Object.keys(obj)
    .filter(key =>
      !SEMANTIC_EXCLUSIONS.has(key) &&
      (obj as Record<string, unknown>)[key] !== undefined
    )
    .sort(deterministicCompare);

  const result = sortedKeys
    .map(key => {
      const value = (obj as Record<string, unknown>)[key];
      return JSON.stringify(key) + ":" + canonicalStringify(value, version);
    })
    .join(",");

  return "{" + result + "}";
}

/**
 * Calculates a SHA-256 hash of the canonical JSON representation.
 * Always excludes fields in SEMANTIC_EXCLUSIONS from the calculation.
 */
export function calculateContentHash(obj: unknown, version: number = CURRENT_HASH_VERSION): string {
  const canonical = canonicalStringify(obj, version);
  return createHash("sha256").update(canonical).digest("hex");
}
