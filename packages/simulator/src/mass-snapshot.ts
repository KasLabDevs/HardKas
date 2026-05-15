// SAFETY_LEVEL: SIMULATION_ONLY
//
// Persistent snapshot storage for mass comparison.

import { resolve, join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { writeFileAtomicSync } from "@hardkas/core";
import { MassBreakdown, profileMass, compareMassProfiles, MassComparison } from "./mass-profile.js";

export interface MassSnapshot {
  /** Snapshot label (e.g., "basic-transfer", "multi-output"). */
  label: string;
  /** When the snapshot was taken. */
  timestamp: string;
  /** The mass breakdown. */
  breakdown: MassBreakdown;
}

export interface MassSnapshotStore {
  snapshots: MassSnapshot[];
}

/**
 * Saves a mass breakdown to a persistent snapshot.
 */
export function saveMassSnapshot(dir: string, label: string, breakdown: MassBreakdown): void {
  const snapshotDir = resolve(dir, ".hardkas", "mass-snapshots");
  
  const snapshot: MassSnapshot = {
    label,
    timestamp: new Date().toISOString(),
    breakdown
  };

  const filePath = join(snapshotDir, `${label}.json`);
  writeFileAtomicSync(filePath, JSON.stringify(snapshot, null, 2));
}

/**
 * Loads a saved mass snapshot.
 */
export function loadMassSnapshot(dir: string, label: string): MassSnapshot | undefined {
  const filePath = resolve(dir, ".hardkas", "mass-snapshots", `${label}.json`);
  if (!existsSync(filePath)) {
    return undefined;
  }

  try {
    const data = readFileSync(filePath, "utf8");
    const snapshot = JSON.parse(data) as MassSnapshot;
    
    // Revive bigints if necessary (though JSON.parse will make them numbers/strings)
    // Actually, MassBreakdown contains bigints. We need a reviver.
    return reviveSnapshot(snapshot);
  } catch (err) {
    console.warn(`Failed to load mass snapshot "${label}":`, err);
    return undefined;
  }
}

/**
 * Profiles current mass, compares with previous if exists, and saves new snapshot.
 */
export function profileAndCompare(
  opts: { inputCount: number; outputCount: number; payloadBytes?: number; feeRate?: bigint },
  snapshotDir: string,
  label: string
): { breakdown: MassBreakdown; comparison?: MassComparison } {
  const currentBreakdown = profileMass(opts);
  const previousSnapshot = loadMassSnapshot(snapshotDir, label);
  
  let comparison: MassComparison | undefined;
  if (previousSnapshot) {
    comparison = compareMassProfiles(currentBreakdown, previousSnapshot.breakdown);
  }

  saveMassSnapshot(snapshotDir, label, currentBreakdown);

  return {
    breakdown: currentBreakdown,
    ...(comparison ? { comparison } : {})
  };
}

/**
 * Helper to revive BigInts from JSON-serialized snapshot.
 */
function reviveSnapshot(snapshot: any): MassSnapshot {
  const b = snapshot.breakdown;
  snapshot.breakdown = {
    ...b,
    totalMass: BigInt(b.totalMass),
    inputMass: BigInt(b.inputMass),
    outputMass: BigInt(b.outputMass),
    payloadMass: BigInt(b.payloadMass),
    estimatedFeeSompi: BigInt(b.estimatedFeeSompi),
    feeRate: BigInt(b.feeRate)
  };
  return snapshot as MassSnapshot;
}
