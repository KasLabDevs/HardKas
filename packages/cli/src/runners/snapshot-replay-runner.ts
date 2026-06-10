import path from "node:path";
import pc from "picocolors";
import { readSnapshotManifest } from "@hardkas/core";
import { UI, handleError } from "../ui.js";
import { runReplayVerify } from "./replay-verify-runner.js";

export interface SnapshotReplayOptions {
  name: string;
  json?: boolean;
  workspaceRoot?: string;
}

export async function runSnapshotReplay(options: SnapshotReplayOptions) {
  try {
    const { Hardkas } = await import("@hardkas/sdk");
    const sdk = await Hardkas.open(
      options.workspaceRoot ? { cwd: options.workspaceRoot } : {}
    );
    const snapshotDir = sdk.workspace.resolvePath("snapshots", options.name);

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
      console.log(pc.yellow("  Rebuilding state projections from artifacts..."));
    }

    // 2. Wipe current workspace artifacts
    const hardkasDir = sdk.workspace.hardkasDir;
    const wsArtifactsDir = path.join(hardkasDir, "artifacts");
    const fs = await import("node:fs/promises");

    if (!options.json) console.log(pc.yellow("  Restoring artifacts to workspace..."));
    try {
      await fs.rm(wsArtifactsDir, { recursive: true, force: true });
      await fs.mkdir(wsArtifactsDir, { recursive: true });
    } catch {}

    const snapArtifactsDir = path.join(snapshotDir, "artifacts");
    try {
      const files = await fs.readdir(snapArtifactsDir);
      for (const f of files) {
        await fs.copyFile(path.join(snapArtifactsDir, f), path.join(wsArtifactsDir, f));
      }
    } catch (err: any) {
      if (err.code !== "ENOENT") throw err;
    }

    // 3. Rebuild query store index from restored artifacts
    if (!options.json) console.log(pc.yellow("  Rebuilding state projections..."));
    const { HardkasStore, HardkasIndexer } = await import("@hardkas/query-store");
    const store = new HardkasStore({ dbPath: path.join(hardkasDir, "store.db") });
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
        `Failed to rebuild SQLite projection from snapshot artifacts: ${result.errors.join(", ")}`
      );
    }

    if (!options.json) {
      UI.causality(
        `Snapshot Replay: ${options.name}`,
        {
          "Execution Scope": manifest.deterministicScope,
          Workspace: options.workspaceRoot,
          "Source Authority": "restored from snapshot",
          "Projection Layer": "SQLite query-store (rebuilt)",
          "Indexed Artifacts": String(result.artifacts.indexed),
          "Indexed Events": String(result.events.indexed),
          "Consensus Validated":
            manifest.deterministicScope === "consensus-validated" ? "YES" : "NO",
          Notice: "Workspace state has been deterministically overwritten"
        },
        ["hardkas doctor --strict", "hardkas dashboard"]
      );
    }
  } catch (err: any) {
    const { HardkasCliError } = await import("../cli-errors.js");
    throw new HardkasCliError(
      "SNAPSHOT_REPLAY_FAILED",
      `Snapshot replay failed: ${err.message}`,
      { exitCode: 1, cause: err }
    );
  }
}
