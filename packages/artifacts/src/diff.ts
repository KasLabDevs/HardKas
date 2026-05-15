import { SEMANTIC_EXCLUSIONS } from "./canonical.js";
import { maskSecrets } from "@hardkas/core";

export interface DiffEntry {
  path: string;
  kind: "added" | "removed" | "changed";
  left?: any;
  right?: any;
}

export interface ArtifactDiff {
  identical: boolean;
  entries: DiffEntry[];
}

/**
 * Performs a semantic diff between two artifacts, ignoring volatile metadata.
 * Uses the same exclusion rules as canonical hashing.
 * Redacts secrets from the output.
 */
export function diffArtifacts(left: any, right: any): ArtifactDiff {
  const entries: DiffEntry[] = [];
  
  // Redact secrets before diffing to ensure we don't leak them in reports
  const leftRedacted = maskSecrets(left);
  const rightRedacted = maskSecrets(right);

  compareRecursive(leftRedacted, rightRedacted, "$", entries);

  return {
    identical: entries.length === 0,
    entries
  };
}

function compareRecursive(left: any, right: any, path: string, entries: DiffEntry[]) {
  // Handle primitives and nulls
  if (isPrimitive(left) || isPrimitive(right)) {
    if (left !== right) {
      entries.push({ path, kind: "changed", left, right });
    }
    return;
  }

  // Handle arrays
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) {
      entries.push({ path, kind: "changed", left, right });
      return;
    }

    const maxLength = Math.max(left.length, right.length);
    for (let i = 0; i < maxLength; i++) {
      if (i >= left.length) {
        entries.push({ path: `${path}[${i}]`, kind: "added", right: right[i] });
      } else if (i >= right.length) {
        entries.push({ path: `${path}[${i}]`, kind: "removed", left: left[i] });
      } else {
        compareRecursive(left[i], right[i], `${path}[${i}]`, entries);
      }
    }
    return;
  }

  // Handle objects
  const leftKeys = Object.keys(left).filter(k => !SEMANTIC_EXCLUSIONS.has(k));
  const rightKeys = Object.keys(right).filter(k => !SEMANTIC_EXCLUSIONS.has(k));
  const allKeys = new Set([...leftKeys, ...rightKeys]);

  for (const key of allKeys) {
    const nextPath = path === "$" ? key : `${path}.${key}`;
    if (!leftKeys.includes(key)) {
      entries.push({ path: nextPath, kind: "added", right: right[key] });
    } else if (!rightKeys.includes(key)) {
      entries.push({ path: nextPath, kind: "removed", left: left[key] });
    } else {
      compareRecursive(left[key], right[key], nextPath, entries);
    }
  }
}

function isPrimitive(val: any): boolean {
  if (val === null) return true;
  return typeof val !== "object" && typeof val !== "function";
}
