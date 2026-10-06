import path from "node:path";
import { existsSync } from "node:fs";
import pc from "picocolors";
import { readSnapshotManifest } from "@hardkas/core";
import { ArtifactStoreMutation } from "@hardkas/artifacts";
import { UI, handleError } from "../ui.js";
import { getOutput } from "../output.js";
import { runReplayVerify } from "./replay-verify-runner.js";
import { snapshotDirFor } from "./snapshot-dir.js";

export interface SnapshotReplayOptions {
  name: string;
  json?: boolean;
  workspaceRoot?: string;
}

export async function runSnapshotReplay(options: SnapshotReplayOptions) {
  snapshotDirFor(options.workspaceRoot ?? process.cwd(), options.name); // refused before the workspace is even opened
  try {
    const { Hardkas } = await import("@hardkas/sdk");
    const sdk = await Hardkas.open(
      options.workspaceRoot ? { cwd: options.workspaceRoot } : {}
    );
    const snapshotDir = snapshotDirFor(sdk.workspace.root, options.name);

    // 1. Read Manifest
    let manifest;
    try {
      manifest = await readSnapshotManifest(snapshotDir);
    } catch {
      throw new Error(`Snapshot manifest not found or invalid at ${snapshotDir}`);
    }

    if (!options.json) {
      UI.header(`Snapshot Replay: ${options.name}`);
      console.log(`  Loaded Manifest v${manifest.snapshotVersion}`);
      console.log(`  Included Artifacts: ${manifest.includedArtifacts}`);
      console.log(`  Scope: ${manifest.deterministicScope}`);
      console.log("");
    }

    const hardkasDir = sdk.workspace.hardkasDir;
    const wsArtifactsDir = path.join(hardkasDir, "artifacts");
    const snapArtifactsDir = path.join(snapshotDir, "artifacts");
    const fs = await import("node:fs/promises");

    // 2–3 · SNAPSHOT-REPLAY-UNIT-1: from the check to the last restore the replay holds the store, so no cooperative
    // writer introduces a mutation between them and no cooperative reader sees a partial restore (a receipt restored
    // before the signed artifact it descends from). The projection rebuild below is outside the unit.
    const unit = ArtifactStoreMutation.forPath(wsArtifactsDir)?.store ?? new ArtifactStoreMutation(sdk.workspace.root);
    const { missing, identical, localOnlyKept } = await unit.hold(async () => {
      // 2. Plan the restore before touching the store. SNAPSHOT-NONDESTRUCTIVE-1: replay never removes an artifact.
      // SNAPSHOT-CONFLICT-1: a path both sides hold with different bytes fails the replay before anything is written.
      const snapshotFiles = await listArtifactFiles(snapArtifactsDir);
      const missing: string[] = [];
      const conflicts: string[] = [];
      let identical = 0;
      for (const rel of snapshotFiles) {
        const local = await readIfPresent(path.join(wsArtifactsDir, rel));
        if (local === undefined) missing.push(rel);
        else if (local.equals(await fs.readFile(path.join(snapArtifactsDir, rel)))) identical++;
        else conflicts.push(rel);
      }
      if (conflicts.length > 0) {
        const { HardkasCliError } = await import("../cli-errors.js");
        const shown = conflicts.slice(0, 5).map(toPosix).join(", ");
        throw new HardkasCliError(
          "SNAPSHOT_REPLAY_CONFLICT",
          `Snapshot ${options.name} and the workspace hold different bytes at ${conflicts.length} artifact path(s) (${shown}${conflicts.length > 5 ? ", …" : ""}); nothing was restored`,
          { exitCode: 1 }
        );
      }
      const inSnapshot = new Set(snapshotFiles);
      const localOnlyKept = (await listArtifactFiles(wsArtifactsDir)).filter((rel) => !inSnapshot.has(rel)).length;

      // 3. Restore what is missing through the store's gate (ARTIFACT-MUTATION-1); each write joins this holding.
      // `exclusive` keeps COPYFILE_EXCL's promise: an artifact already in the store is never overwritten (EEXIST).
      if (!options.json) console.log(pc.yellow("  Restoring missing artifacts to workspace..."));
      for (const rel of missing) {
        const gate = ArtifactStoreMutation.forPath(path.join(wsArtifactsDir, rel));
        if (!gate || !gate.relPath) throw new Error(`${wsArtifactsDir} is not an artifact store (<workspace>/.hardkas/artifacts)`);
        await gate.store.writeFile(gate.relPath, await fs.readFile(path.join(snapArtifactsDir, rel)), { exclusive: true });
      }
      return { missing, identical, localOnlyKept };
    }, "localnet snapshot replay");

    // 4. The query store is rebuilt only when the workspace already has one: without .hardkas/store.db the query
    // engine reads the artifact files directly, and replay never creates the store.
    const dbPath = path.join(hardkasDir, "store.db");
    let rebuilt: { artifacts: { indexed: number }; events: { indexed: number } } | undefined;
    if (existsSync(dbPath)) {
      if (!options.json) console.log(pc.yellow("  Rebuilding state projections..."));
      const { HardkasStore, HardkasIndexer } = await import("@hardkas/query-store");
      const store = new HardkasStore({ dbPath });
      store.connect({ autoMigrate: true });

      const indexer = new HardkasIndexer(
        store.getDatabase(),
        options.workspaceRoot
          ? { cwd: options.workspaceRoot, strict: true }
          : { strict: true }
      );
      const result = await indexer.rebuild();

      if (!result.ok) {
        throw new Error(
          `Restored ${missing.length} artifact(s), but the SQLite projection could not be rebuilt: ${result.errors.join(", ")}`
        );
      }
      rebuilt = result;
    }

    if (options.json) {
      getOutput().writeJson({
        ok: true,
        command: "localnet snapshot replay",
        mode: "cli",
        snapshot: options.name,
        restored: missing.length,
        identical,
        localOnlyKept,
        restoredPaths: missing.map(toPosix),
        projection: rebuilt ? "rebuilt" : "none"
      });
      return;
    }

    UI.causality(
      `Snapshot Replay: ${options.name}`,
      {
        "Execution Scope": manifest.deterministicScope,
        Workspace: options.workspaceRoot,
        "Restored Artifacts": String(missing.length),
        "Already Present": String(identical),
        "Local Artifacts Kept": String(localOnlyKept),
        "Projection Layer": rebuilt ? "SQLite query-store (rebuilt)" : "none (queries read the artifact files)",
        ...(rebuilt
          ? { "Indexed Artifacts": String(rebuilt.artifacts.indexed), "Indexed Events": String(rebuilt.events.indexed) }
          : {}),
        "Consensus Validated":
          manifest.deterministicScope === "consensus-validated" ? "YES" : "NO",
        Notice: "Replay restores the snapshot's missing artifacts; it never removes or overwrites one"
      },
      // SURFACE-TRUTH-1B: the CLI registers no `dashboard` command
      ["hardkas doctor --strict"]
    );
  } catch (err: any) {
    const { HardkasCliError } = await import("../cli-errors.js");
    if (err instanceof HardkasCliError) throw err;
    throw new HardkasCliError(
      "SNAPSHOT_REPLAY_FAILED",
      `Snapshot replay failed: ${((err instanceof Error) ? ((err instanceof Error) ? err.message : String(err)) : String(err))}`,
      { exitCode: 1, cause: err }
    );
  }
}

const toPosix = (rel: string) => rel.split(path.sep).join("/");

/** Regular files under dir, recursively, relative to dir; links are never followed. A missing dir has none. */
async function listArtifactFiles(dir: string, rel = ""): Promise<string[]> {
  const fs = await import("node:fs/promises");
  let entries;
  try {
    entries = await fs.readdir(path.join(dir, rel), { withFileTypes: true });
  } catch (err: any) {
    if (err?.code === "ENOENT") return [];
    throw err;
  }
  const files: string[] = [];
  for (const entry of entries) {
    const relPath = path.join(rel, entry.name);
    if (entry.isDirectory()) files.push(...(await listArtifactFiles(dir, relPath)));
    else if (entry.isFile()) files.push(relPath);
  }
  return files;
}

async function readIfPresent(file: string): Promise<Buffer | undefined> {
  const fs = await import("node:fs/promises");
  try {
    return await fs.readFile(file);
  } catch (err: any) {
    if (err?.code === "ENOENT") return undefined;
    throw err;
  }
}
