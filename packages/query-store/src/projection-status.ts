import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { listWorkspaceStoreFilesSync } from "@hardkas/artifacts";
import { eventLedgerPath } from "@hardkas/core";
import { HardkasStore } from "./db.js";

// WORKSPACE-AUTHORITY-1 · WA-I2: a projection (.hardkas/store.db) is derived state. It never becomes the truth merely
// because the file exists: it answers only when it is proven current with the authority it was built from — the
// workspace's canonical artifact entries (as the verified resolver enumerates them) and its event ledger.

/**
 * What a projection holds and how it is keyed. Any change to that meaning (the indexed set, the event key) bumps it, and a
 * projection built under another contract is stale until it is rebuilt.
 */
export const PROJECTION_CONTRACT = "wa1-v1";

export type ProjectionState = "fresh" | "stale" | "absent" | "unreadable";

export interface ProjectionStatus {
  /** fresh: built from exactly the current authority · stale: the authority changed since, or freshness cannot be shown ·
   * absent: no projection (no file, or a file that holds none) · unreadable: a file that cannot be read as one. */
  state: ProjectionState;
  dbPath: string;
  reason: string;
  /** When the projection was last indexed, as it records it. */
  indexedAt?: string | null;
}

export function projectionDbPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, ".hardkas", "store.db");
}

const sha256 = (bytes: Buffer | string): string => crypto.createHash("sha256").update(bytes).digest("hex");

/**
 * The authority a projection derives from, as one deterministic digest: every file of the artifact store the resolver
 * reads (its store path and the sha-256 of its bytes, in the resolver's sorted order) and the event ledger (its size and
 * the sha-256 of its bytes). Two states share it only when they hold byte-identical files at the same store paths and a
 * byte-identical ledger, so no count or timestamp coincidence can pass for freshness.
 */
export function computeAuthorityFingerprint(workspaceRoot: string): string {
  const digest = crypto.createHash("sha256");
  digest.update(`${PROJECTION_CONTRACT}\n`);
  for (const entry of listWorkspaceStoreFilesSync(workspaceRoot)) {
    let bytes: Buffer;
    try {
      bytes = fs.readFileSync(entry.path);
    } catch {
      continue; // gone since it was listed: not part of the authority any more
    }
    digest.update(`artifact\0${entry.relativeSubpath}\0${sha256(bytes)}\n`);
  }
  let ledger: Buffer | undefined;
  try {
    ledger = fs.readFileSync(eventLedgerPath(workspaceRoot));
  } catch {
    ledger = undefined;
  }
  digest.update(ledger ? `ledger\0${ledger.length}\0${sha256(ledger)}\n` : "ledger\0absent\n");
  return digest.digest("hex");
}

/** Records, inside the caller's transaction, which authority a full rebuild or sync derived the projection from. */
export function recordProjectionAuthority(db: any, fingerprint: string): void {
  const put = db.prepare("INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)");
  put.run("projection_contract", PROJECTION_CONTRACT);
  put.run("authority_fingerprint", fingerprint);
}

/** The state of an open projection against the workspace it belongs to (reads only). */
export function projectionStatusOf(store: HardkasStore, workspaceRoot: string): ProjectionStatus {
  const dbPath = store.path;
  let meta: Record<string, string>;
  try {
    const rows = store
      .getDatabase()
      .prepare("SELECT key, value FROM metadata WHERE key IN ('projection_contract', 'authority_fingerprint', 'last_indexed_at')")
      .all() as Array<{ key: string; value: string }>;
    meta = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  } catch (err: any) {
    const message = err instanceof Error ? err.message : String(err);
    if (/no such table/i.test(message)) {
      return { state: "absent", dbPath, reason: "the file holds no projection (it was never built)" };
    }
    return { state: "unreadable", dbPath, reason: message };
  }
  const indexedAt = meta.last_indexed_at ?? null;
  if (!meta.authority_fingerprint) {
    return { state: "stale", dbPath, indexedAt, reason: "it records no authority it was built from; rebuild it to establish freshness" };
  }
  if (meta.projection_contract !== PROJECTION_CONTRACT) {
    return {
      state: "stale",
      dbPath,
      indexedAt,
      reason: `it was built under projection contract ${meta.projection_contract ?? "(none)"}, this HardKAS reads ${PROJECTION_CONTRACT}; rebuild it`
    };
  }
  return meta.authority_fingerprint === computeAuthorityFingerprint(workspaceRoot)
    ? { state: "fresh", dbPath, indexedAt, reason: "built from exactly the workspace's current artifacts and event ledger" }
    : { state: "stale", dbPath, indexedAt, reason: "the workspace's artifacts or event ledger changed after it was built" };
}

/** The projection's state without creating, migrating or keeping anything open. */
export function readProjectionStatus(workspaceRoot: string, dbPath: string = projectionDbPath(workspaceRoot)): ProjectionStatus {
  let store: HardkasStore | null;
  try {
    store = HardkasStore.openExisting(dbPath);
  } catch (err: any) {
    return { state: "unreadable", dbPath, reason: err instanceof Error ? err.message : String(err) };
  }
  if (!store) return { state: "absent", dbPath, reason: "there is no projection file; queries read the workspace" };
  try {
    return projectionStatusOf(store, workspaceRoot);
  } finally {
    store.disconnect();
  }
}
