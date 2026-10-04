import fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { HardkasError } from "./errors.js";
import { withLock } from "./lock.js";

export interface SnapshotManifest {
  snapshotVersion: number;
  createdAt: string;
  hardkasVersion: string;
  stateAuthority: "filesystem";
  projectionAuthority: "sqlite";
  deterministicScope: "local-only" | "consensus-validated";
  consensusValidated: boolean;
  includedArtifacts: number;
  excludedArtifacts: number;
  corruptedArtifacts: number;
}

export interface CreateSnapshotOptions {
  hardkasDir: string;
  outputDir: string;
  deterministicScope?: "local-only" | "consensus-validated";
}

/**
 * SNAPSHOT-CREATE-ATOMIC-1: succeeds only when it publishes a complete snapshot of the artifacts enumerated during
 * this call, as one generation, under a name that did not exist; a failure publishes nothing and never modifies an
 * existing snapshot. The snapshot is built in a sibling temp directory and moved into place last.
 * SNAPSHOT-CREATE-CONCURRENCY-1: the walk of the artifact store is one holding of the workspace's `artifacts` lock, so
 * no cooperative writer modifies the store while it is captured and the published artifacts are exactly the bytes
 * captured during that holding. events.jsonl, store.db, the manifest and the publication stay outside the holding.
 */
export async function createSnapshot(
  options: CreateSnapshotOptions
): Promise<SnapshotManifest> {
  const { hardkasDir, outputDir, deterministicScope = "local-only" } = options;

  // An existing snapshot is never overwritten, merged into or replaced.
  if (await pathExists(outputDir)) {
    throw snapshotExists(outputDir, "already exists (snapshots are never overwritten; choose another name)");
  }

  const parentDir = path.dirname(outputDir);
  await fs.mkdir(parentDir, { recursive: true });
  const tempDir = path.join(parentDir, `.${path.basename(outputDir)}.tmp-${process.pid}-${randomBytes(4).toString("hex")}`);
  await fs.mkdir(tempDir);
  try {
    const manifest = await writeSnapshot(hardkasDir, tempDir, deterministicScope);
    await publishSnapshot(tempDir, outputDir);
    return manifest;
  } catch (err) {
    // Best effort: a temp that cannot be removed stays behind under its .tmp- name, never as the snapshot itself.
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    throw err;
  }
}

/** Writes the whole snapshot into dir. A read, copy or write error is a capture failure and aborts the create. */
async function writeSnapshot(
  hardkasDir: string,
  dir: string,
  deterministicScope: "local-only" | "consensus-validated"
): Promise<SnapshotManifest> {
  for (const sub of ["artifacts", "projections", "events", "replay", "metadata"]) {
    await fs.mkdir(path.join(dir, sub));
  }

  let included = 0;
  let excluded = 0;
  let corrupted = 0;

  // 1. Copy artifacts (authority). SNAPSHOT-COMPLETE-1: every artifact in the store, recursively, at its relative path
  // (the store keeps plans/, signed/, receipts/, … in subfolders). Regular files only: links are never followed.
  // Only content that was read is classified: JSON outside hardkas.* is excluded, content that is not JSON is corrupted.
  const artifactsDir = path.join(hardkasDir, "artifacts");
  const copyArtifacts = async (rel: string): Promise<void> => {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(path.join(artifactsDir, rel), { withFileTypes: true });
    } catch (err: any) {
      if (rel === "" && err?.code === "ENOENT") return; // no store yet: an empty snapshot
      throw err;
    }
    for (const entry of entries) {
      const relPath = path.join(rel, entry.name);
      if (entry.isDirectory()) {
        await copyArtifacts(relPath);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const src = path.join(artifactsDir, relPath);
      const dest = path.join(dir, "artifacts", relPath);

      const content = await fs.readFile(src, "utf-8");
      let parsed: any;
      try {
        parsed = JSON.parse(content);
      } catch {
        corrupted++;
        continue;
      }
      if (typeof parsed?.schema !== "string" || !parsed.schema.startsWith("hardkas.")) {
        excluded++;
        continue;
      }
      // Note: A real snapshot would verify integrity here
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.copyFile(src, dest);
      included++;
    }
  };
  // SNAPSHOT-CREATE-CONCURRENCY-1: enumeration, reads and copies are one holding of the store (a writer of the store
  // waits for it, and the walk waits for a writer that already holds it)
  await withLock(
    { rootDir: path.dirname(hardkasDir), name: "artifacts", command: "localnet snapshot create", wait: true },
    () => copyArtifacts("")
  );

  // 2. Copy events append-log and 3. sqlite database (projection cache); a file that is absent is not part of the store
  await copyIfPresent(path.join(hardkasDir, "events.jsonl"), path.join(dir, "events", "events.jsonl"));
  await copyIfPresent(path.join(hardkasDir, "store.db"), path.join(dir, "projections", "store.db"));

  const manifest: SnapshotManifest = {
    snapshotVersion: 1,
    createdAt: new Date().toISOString(),
    hardkasVersion: "0.12.0-rc.26",
    stateAuthority: "filesystem",
    projectionAuthority: "sqlite",
    deterministicScope,
    consensusValidated: deterministicScope === "consensus-validated",
    includedArtifacts: included,
    excludedArtifacts: excluded,
    corruptedArtifacts: corrupted
  };

  await fs.writeFile(
    path.join(dir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf-8"
  );

  return manifest;
}

/**
 * Moves the finished snapshot into place without ever replacing something that appeared at outputDir meanwhile.
 * Windows (MoveFileEx) never replaces an existing directory. POSIX rename(2) silently replaces an EMPTY directory, so
 * there the name is reserved first with an exclusive mkdir and the rename only ever goes over that reservation.
 */
async function publishSnapshot(tempDir: string, outputDir: string): Promise<void> {
  const appeared = () => snapshotExists(outputDir, "appeared while it was being created");
  if (process.platform === "win32") {
    try {
      await fs.rename(tempDir, outputDir);
    } catch (err) {
      if (await pathExists(outputDir)) throw appeared();
      throw err;
    }
    return;
  }
  try {
    await fs.mkdir(outputDir);
  } catch (err: any) {
    if (err?.code === "EEXIST") throw appeared();
    throw err;
  }
  try {
    await fs.rename(tempDir, outputDir);
  } catch (err: any) {
    await fs.rmdir(outputDir).catch(() => {}); // removes only our own reservation, and only while it is still empty
    if (err?.code === "ENOTEMPTY" || err?.code === "EEXIST") throw appeared();
    throw err;
  }
}

function snapshotExists(outputDir: string, how: string): HardkasError {
  return new HardkasError("SNAPSHOT_EXISTS", `Snapshot ${path.basename(outputDir)} ${how}: ${outputDir}; nothing was published`);
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.lstat(p);
    return true;
  } catch (err: any) {
    if (err?.code === "ENOENT") return false;
    throw err;
  }
}

async function copyIfPresent(src: string, dest: string): Promise<void> {
  if (!(await pathExists(src))) return;
  await fs.copyFile(src, dest);
}

export async function readSnapshotManifest(
  snapshotDir: string
): Promise<SnapshotManifest> {
  const manifestPath = path.join(snapshotDir, "manifest.json");
  const content = await fs.readFile(manifestPath, "utf-8");
  return JSON.parse(content) as SnapshotManifest;
}
