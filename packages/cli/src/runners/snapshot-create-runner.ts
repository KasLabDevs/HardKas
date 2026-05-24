import path from "node:path";
import pc from "picocolors";
import { createSnapshot } from "@hardkas/core";
import { UI, handleError } from "../ui.js";

export interface SnapshotCreateOptions {
  name: string;
  workspaceRoot: string;
  consensusValidated: boolean;
  json?: boolean;
}

export async function runSnapshotCreate(options: SnapshotCreateOptions) {
  const { name, workspaceRoot } = options;

  try {
    const { Hardkas } = await import("@hardkas/sdk");
    const sdk = await Hardkas.open({ cwd: workspaceRoot });
    const hardkasDir = sdk.workspace.hardkasDir;
    const outputDir = sdk.workspace.resolvePath("snapshots", options.name);

    const manifest = await createSnapshot({
      hardkasDir,
      outputDir,
      deterministicScope: options.consensusValidated ? "consensus-validated" : "local-only"
    });

    if (options.json) {
      console.log(JSON.stringify(manifest, null, 2));
      return;
    }

    UI.causality(
      `Snapshot Created: ${options.name}`,
      {
        "Execution Scope": manifest.deterministicScope,
        "Snapshot Path": outputDir,
        "State Authority": manifest.stateAuthority || "filesystem artifacts",
        "Projection Layer": manifest.projectionAuthority || "local cache",
        "Snapshot Version": manifest.snapshotVersion,
        "Included Artifacts": String(manifest.includedArtifacts),
        "Excluded/Corrupted": `${manifest.excludedArtifacts} / ${manifest.corruptedArtifacts}`,
        "Consensus Validated": options.consensusValidated ? "YES" : "NO",
        "Notice": "Snapshots are portable local deterministic captures, NOT consensus proofs"
      }
    );
  } catch (err: any) {
    if (!options.json) handleError(err);
    process.exitCode = 1;
  }
}
