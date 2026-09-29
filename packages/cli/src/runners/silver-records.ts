import fs from "node:fs";
import path from "node:path";
import { ARTIFACT_VERSION, CURRENT_HASH_VERSION, calculateContentHash, writeArtifact } from "@hardkas/artifacts";

// Wave 1.3 · Silver records under IC-1′ / IC-7.3
//
// A Silver record is a version-5 artifact sealed in one pass. Its identity is
// the recomputed contentHash; the `<prefix>-<16hex>` label used for display and
// file names is DERIVED from that identity and never stored in the record
// (IC-7.3). Nested references ({ path, contentHash, artifactSha256 }) are part
// of the authenticated body (IC-1′.2 / N1).

export const SILVER_RECORD_DIR = path.join(".hardkas", "artifacts", "silver");
/** Runner verdicts on scenario transactions: kept apart from the node-evidenced records. */
export const SILVER_VM_RECORD_DIR = path.join(".hardkas", "artifacts", "silver-vm");

/** "localnet": evidenced by the canonical node. "vm": the official script engine on a scenario, no node. */
export type SilverRecordMode = "localnet" | "vm";

export interface SealedSilverRecord {
  [key: string]: unknown;
  version: string;
  mode: SilverRecordMode;
  hashVersion: number;
  contentHash: string;
}

/** The display/file label of a record: derived from its identity, never stored. */
export function silverRecordLabel(prefix: string, recordOrHash: string | { contentHash: string }): string {
  const hash = typeof recordOrHash === "string" ? recordOrHash : recordOrHash.contentHash;
  return `${prefix}-${hash.slice(0, 16)}`;
}

/** Seals a record draft as a version-5 artifact (no artifactId, one hash pass). */
export function sealSilverRecord(record: Record<string, unknown>, _prefix: string, mode: SilverRecordMode = "localnet"): SealedSilverRecord {
  const draft: Record<string, unknown> = { ...record, version: ARTIFACT_VERSION, mode, hashVersion: CURRENT_HASH_VERSION };
  delete draft.artifactId;
  delete draft.contentHash;
  const contentHash = calculateContentHash(draft, CURRENT_HASH_VERSION);
  return { ...draft, contentHash } as SealedSilverRecord;
}

/** Seals and persists a record; the file name carries the derived label. */
export async function writeSilverRecord(
  record: Record<string, unknown>,
  prefix: string,
  explicitOut?: string,
  mode: SilverRecordMode = "localnet"
): Promise<{ path: string; record: SealedSilverRecord }> {
  const full = sealSilverRecord(record, prefix, mode);
  const dir = mode === "vm" ? SILVER_VM_RECORD_DIR : SILVER_RECORD_DIR;
  const target = explicitOut ? path.resolve(explicitOut) : path.resolve(dir, `${silverRecordLabel(prefix, full)}.json`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  await writeArtifact(target, full);
  return { path: target, record: full };
}
