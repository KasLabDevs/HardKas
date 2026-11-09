// SAFETY_LEVEL: SIMULATION_ONLY
//
// Mass snapshot storage and regression tracking.

import { resolve, join } from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
  type MassBreakdown,
  type MassComparison,
  profileMass,
  compareMassProfiles
} from "./mass-profile.js";

export interface MassSnapshot {
  name: string;
  profile: MassBreakdown;
  timestamp: number;
  metadata?: Record<string, string>;
}

export interface MassSnapshotStore {
  snapshots: Record<string, MassSnapshot>;
}

const DEFAULT_STORE_FILE = ".mass-snapshots.json";

function getStorePath(dir?: string): string {
  return resolve(dir ?? process.cwd(), DEFAULT_STORE_FILE);
}

export function loadMassSnapshot(name: string, dir?: string): MassSnapshot | null {
  const filePath = getStorePath(dir);
  if (!existsSync(filePath)) return null;

  try {
    const raw = readFileSync(filePath, "utf-8");
    const store: MassSnapshotStore = JSON.parse(raw);
    const snap = store.snapshots[name];
    if (!snap) return null;

    return {
      ...snap,
      profile: {
        ...snap.profile,
        totalMass: BigInt(snap.profile.totalMass),
        inputMass: BigInt(snap.profile.inputMass),
        outputMass: BigInt(snap.profile.outputMass),
        payloadMass: BigInt(snap.profile.payloadMass),
        estimatedFeeSompi: BigInt(snap.profile.estimatedFeeSompi),
        feeRate: BigInt(snap.profile.feeRate)
      }
    };
  } catch {
    return null;
  }
}

export function saveMassSnapshot(
  name: string,
  profile: MassBreakdown,
  dir?: string,
  metadata?: Record<string, string>
): void {
  const filePath = getStorePath(dir);
  let store: MassSnapshotStore = { snapshots: {} };

  if (existsSync(filePath)) {
    try {
      const raw = readFileSync(filePath, "utf-8");
      store = JSON.parse(raw);
    } catch {
      store = { snapshots: {} };
    }
  }

  const serializableProfile = {
    ...profile,
    totalMass: profile.totalMass.toString(),
    inputMass: profile.inputMass.toString(),
    outputMass: profile.outputMass.toString(),
    payloadMass: profile.payloadMass.toString(),
    estimatedFeeSompi: profile.estimatedFeeSompi.toString(),
    feeRate: profile.feeRate.toString()
  };

  const entry: MassSnapshot = {
    name,
    profile: serializableProfile as unknown as MassBreakdown,
    timestamp: Date.now(),
    ...(metadata !== undefined ? { metadata } : {})
  };
  store.snapshots[name] = entry;

  writeFileSync(filePath, JSON.stringify(store, null, 2), "utf-8");
}

export function profileAndCompare(
  name: string,
  opts: {
    inputCount: number;
    outputCount: number;
    payloadBytes?: number;
    feeRate?: bigint;
  },
  dir?: string
): { current: MassBreakdown; comparison: MassComparison | null } {
  const current = profileMass(opts);
  const previous = loadMassSnapshot(name, dir);

  if (!previous) {
    saveMassSnapshot(name, current, dir);
    return { current, comparison: null };
  }

  const comparison = compareMassProfiles(current, previous.profile);
  return { current, comparison };
}
