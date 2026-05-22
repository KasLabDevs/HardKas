import path from "node:path";
import pc from "picocolors";
import { readSnapshotManifest } from "@hardkas/core";
import { UI, handleError } from "../ui.js";
import { runReplayVerify } from "./replay-verify-runner.js";

export interface SnapshotReplayOptions {
  name: string;
  json?: boolean;
}

export async function runSnapshotReplay(options: SnapshotReplayOptions) {
  try {
    const snapshotDir = path.resolve(process.cwd(), "snapshots", options.name);

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

    // 2. We trigger replay verify on the snapshot's artifacts dir
    // This proves that the localnet state can be fully re-derived from the artifacts
    // without blindly trusting the sqlite database in the snapshot.
    const artifactsDir = path.join(snapshotDir, "artifacts");
    await runReplayVerify({ path: artifactsDir, json: options.json });

  } catch (err: any) {
    if (!options.json) handleError(err);
    process.exitCode = 1;
  }
}
