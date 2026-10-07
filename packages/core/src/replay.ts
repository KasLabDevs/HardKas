import { HardkasSchemas } from "./registry.js";
import { isSecretFieldName } from "./security.js";

/**
 * REPLAY-TRUST-2 (RT-I2) · the top-level receipt fields a replay demonstrably cannot reproduce, so they are not compared.
 * Everything else a receipt asserts is compared raw, at every depth (status, dagContext, the txId the plan derives…);
 * no field is dropped by name below the top level.
 * - createdAt: the replay's receipt is made now;
 * - submittedAt, confirmedAt, rpcUrl, tracePath, sourceSignedId: lifecycle of the original submission (a replay does
 *   not submit anything);
 * - lineage, contentHash, artifactId: the original receipt's own identity and chain position (its parent is the signed
 *   artifact; the replay executes the plan that lineage leads to);
 * - hardkasVersion: the tool that produced the original; the replay stamps the running one;
 * - hashVersion: the replay's receipt is stamped with the current version, while its state digests follow the version
 *   the original declares (IC-1′.7).
 */
export const REPLAY_UNREPRODUCIBLE_RECEIPT_FIELDS: readonly string[] = [
  "createdAt",
  "submittedAt",
  "confirmedAt",
  "rpcUrl",
  "tracePath",
  "sourceSignedId",
  "lineage",
  "contentHash",
  "artifactId",
  "hardkasVersion",
  "hashVersion"
];

export interface StructuralDiff {
  missingArtifacts: string[];
  excludedArtifacts: string[];
  missingProjections: string[];
}

export interface DeterministicDiff {
  stateRootDiverged: boolean;
  lineageDiverged: boolean;
  graphDiverged: boolean;
  differences: Array<{ path: string; a: any; b: any }>;
}

export interface RuntimeNoiseDiff {
  timestampShifts: Array<{ path: string; shiftMs: number }>;
  eventOrderingShifts: string[];
  metadataDrift: string[];
}

export interface LayeredReplayDiff {
  schema: typeof HardkasSchemas.ReplayDiffV1;
  structural: StructuralDiff;
  deterministic: DeterministicDiff;
  observational: RuntimeNoiseDiff;
}

export function diffReplays(replayA: any, replayB: any): LayeredReplayDiff {
  const diff: LayeredReplayDiff = {
    schema: HardkasSchemas.ReplayDiffV1,
    structural: {
      missingArtifacts: [],
      excludedArtifacts: [],
      missingProjections: []
    },
    deterministic: {
      stateRootDiverged: false,
      lineageDiverged: false,
      graphDiverged: false,
      differences: []
    },
    observational: {
      timestampShifts: [],
      eventOrderingShifts: [],
      metadataDrift: []
    }
  };

  // 1. Structural Diff
  if (replayA.artifacts?.length !== replayB.artifacts?.length) {
    diff.structural.missingArtifacts.push("artifact_count_mismatch");
  }

  // 2. Deterministic Diff (Deep diff ignoring observational noise). REPLAY-TRUST-2 (RT-I7, D-RT6): raw values, at
  // every depth. Two replay reports differ in what decides their verdicts and in the receipt each one verified; any
  // other pair (receipts) differs in everything a replay compares (RT-I2). A field left out of the deterministic layer
  // still shows, as metadata drift: nothing that differs is hidden.
  const differences = diff.deterministic.differences;
  if (replayA.schema === HardkasSchemas.ReplayReportV1 && replayB.schema === HardkasSchemas.ReplayReportV1) {
    const parentA = replayA.lineage?.parentArtifactId;
    const parentB = replayB.lineage?.parentArtifactId;
    if (parentA !== parentB) {
      diff.deterministic.lineageDiverged = true;
      differences.push({ path: "lineage.parentArtifactId", a: parentA ?? null, b: parentB ?? null });
    }
    for (const field of REPLAY_REPORT_VERDICT_FIELDS) compareRaw(replayA[field], replayB[field], field, differences, false);
  } else {
    const unreproducible = new Set(REPLAY_UNREPRODUCIBLE_RECEIPT_FIELDS);
    const keys = [...new Set([...Object.keys(replayA ?? {}), ...Object.keys(replayB ?? {})])].sort();
    for (const key of keys) {
      if (key === "artifacts" || key === "timestamp") continue; // the structural and observational layers
      if (unreproducible.has(key)) {
        if (key !== "createdAt" && JSON.stringify(replayA[key]) !== JSON.stringify(replayB[key])) {
          diff.observational.metadataDrift.push(`${key} differs`);
        }
        continue;
      }
      compareRaw(replayA[key], replayB[key], key, differences, isSecretFieldName(key));
    }
    if (differences.some((d) => /^(postStateHash|stateRoot)(\.|\[|$)/.test(d.path))) diff.deterministic.stateRootDiverged = true;
  }

  // 3. Observational Diff
  const tsA = replayA.timestamp || replayA.createdAt;
  const tsB = replayB.timestamp || replayB.createdAt;
  if (tsA && tsB) {
    const timeA = new Date(tsA).getTime();
    const timeB = new Date(tsB).getTime();
    if (timeA !== timeB) {
      diff.observational.timestampShifts.push({
        path: "timestamp",
        shiftMs: Math.abs(timeA - timeB)
      });
    }
  }

  return diff;
}

/** What decides a replay report's verdict (its subject is compared apart: the receipt it verified). */
const REPLAY_REPORT_VERDICT_FIELDS = ["txId", "receiptComparison", "planOk", "receiptOk", "invariantsOk", "checks", "divergences"];

const isPrimitive = (value: unknown) => value === null || (typeof value !== "object" && typeof value !== "function");
const holdsSecret = (value: any): boolean =>
  !isPrimitive(value) &&
  (Array.isArray(value) ? value.some(holdsSecret) : Object.keys(value).some((k) => isSecretFieldName(k) || holdsSecret(value[k])));

/** Raw comparison; a difference under a secret field carries "differs", never the values (the evidence-safe form). */
function compareRaw(a: any, b: any, path: string, out: DeterministicDiff["differences"], inSecret: boolean): void {
  const push = () =>
    out.push(
      inSecret || holdsSecret(a) || holdsSecret(b)
        ? { path, a: "differs", b: "differs" }
        : { path, a: a === undefined ? null : a, b: b === undefined ? null : b }
    );
  if (isPrimitive(a) || isPrimitive(b) || a === undefined || b === undefined) {
    if (a !== b) push();
    return;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) {
      push();
      return;
    }
    for (let i = 0; i < Math.max(a.length, b.length); i++) compareRaw(a[i], b[i], `${path}[${i}]`, out, inSecret);
    return;
  }
  for (const key of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
    compareRaw(a[key], b[key], `${path}.${key}`, out, inSecret || isSecretFieldName(key));
  }
}
