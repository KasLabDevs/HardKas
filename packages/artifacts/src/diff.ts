import { SEMANTIC_EXCLUSIONS } from "./canonical.js";
import { isSecretFieldName } from "@hardkas/core";

export interface DiffEntry {
  path: string;
  kind: "added" | "removed" | "changed";
  left?: any;
  right?: any;
  /** A field that holds secret material differs: its values are never carried, only that it differs. */
  secret?: true;
}

export interface ArtifactDiff {
  identical: boolean;
  entries: DiffEntry[];
}

export interface DiffOptions {
  /**
   * REPLAY-TRUST-2 · which keys are not compared. Without it: the frozen legacy SEMANTIC_EXCLUSIONS, dropped by name at
   * any depth (the historical behaviour, unchanged). With `topLevel`: everything is compared raw at every depth except
   * those top-level keys; no name is dropped below the top level.
   */
  exclude?: { topLevel: readonly string[] };
}

/**
 * Performs a semantic diff between two artifacts on their RAW values, ignoring volatile metadata (SEMANTIC_EXCLUSIONS
 * only, unless `options.exclude` names the top-level keys instead). EVIDENCE-DIFF-REDACTION-1: nothing is masked before
 * comparing, so two values that differ anywhere are a difference; the decision never sees a redacted form. The entries
 * are safe to record as evidence: public values (hashes, ids, amounts, addresses) are carried in full, while a
 * difference in a secret field (named by `isSecretFieldName`, or a value holding one) carries no value at all, only
 * `secret: true`. Presentation may redact further; it never decides equality.
 */
export function diffArtifacts(left: any, right: any, options: DiffOptions = {}): ArtifactDiff {
  const entries: DiffEntry[] = [];
  const topLevel = options.exclude ? new Set(options.exclude.topLevel) : undefined;
  const excluded = topLevel
    ? (key: string, path: string) => path === "$" && topLevel.has(key)
    : (key: string) => SEMANTIC_EXCLUSIONS.has(key);
  compareRecursive(left, right, "$", entries, false, excluded);

  return {
    identical: entries.length === 0,
    entries
  };
}

/** Records a difference; under a secret field, or when either value holds one, only that it differs. */
function record(entries: DiffEntry[], path: string, kind: DiffEntry["kind"], left: any, right: any, inSecret: boolean) {
  if (inSecret || holdsSecret(left) || holdsSecret(right)) {
    entries.push({ path, kind, secret: true });
  } else if (kind === "added") {
    entries.push({ path, kind, right });
  } else if (kind === "removed") {
    entries.push({ path, kind, left });
  } else {
    entries.push({ path, kind, left, right });
  }
}

function holdsSecret(value: any): boolean {
  if (isPrimitive(value)) return false;
  if (Array.isArray(value)) return value.some(holdsSecret);
  return Object.keys(value).some((k) => isSecretFieldName(k) || holdsSecret(value[k]));
}

function compareRecursive(
  left: any,
  right: any,
  path: string,
  entries: DiffEntry[],
  inSecret: boolean,
  excluded: (key: string, path: string) => boolean
) {
  // Handle primitives and nulls
  if (isPrimitive(left) || isPrimitive(right)) {
    if (left !== right) {
      record(entries, path, "changed", left, right, inSecret);
    }
    return;
  }

  // Handle arrays
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) {
      record(entries, path, "changed", left, right, inSecret);
      return;
    }

    const maxLength = Math.max(left.length, right.length);
    for (let i = 0; i < maxLength; i++) {
      if (i >= left.length) {
        record(entries, `${path}[${i}]`, "added", undefined, right[i], inSecret);
      } else if (i >= right.length) {
        record(entries, `${path}[${i}]`, "removed", left[i], undefined, inSecret);
      } else {
        compareRecursive(left[i], right[i], `${path}[${i}]`, entries, inSecret, excluded);
      }
    }
    return;
  }

  // Handle objects
  const leftKeys = Object.keys(left).filter((k) => !excluded(k, path));
  const rightKeys = Object.keys(right).filter((k) => !excluded(k, path));
  const allKeys = new Set([...leftKeys, ...rightKeys]);

  for (const key of allKeys) {
    const nextPath = path === "$" ? key : `${path}.${key}`;
    const secret = inSecret || isSecretFieldName(key);
    if (!leftKeys.includes(key)) {
      record(entries, nextPath, "added", undefined, right[key], secret);
    } else if (!rightKeys.includes(key)) {
      record(entries, nextPath, "removed", left[key], undefined, secret);
    } else {
      compareRecursive(left[key], right[key], nextPath, entries, secret, excluded);
    }
  }
}

function isPrimitive(val: any): boolean {
  if (val === null) return true;
  return typeof val !== "object" && typeof val !== "function";
}
