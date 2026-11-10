import path from "node:path";
import pc from "picocolors";
import { createSnapshot } from "@hardkas/core";
import { UI, handleError } from "../ui.js";
import { snapshotDirFor } from "./snapshot-dir.js";
import { withSdk } from "./with-sdk.js";

export interface SnapshotCreateOptions {
  name: string;
  workspaceRoot: string;
  consensusValidated: boolean;
  json?: boolean;
}

export async function runSnapshotCreate(options: SnapshotCreateOptions) {
  const { name, workspaceRoot } = options;
  // ESCALÓN 2 · P12: --consensus-validated asked the snapshot to declare itself validated by consensus, with nothing
  // checked ("Consensus Validated: YES"). Refused, as a usage error, before anything is opened or written.
  if (options.consensusValidated) {
    const { HardkasCliError, HardkasExitCode } = await import("../cli-errors.js");
    throw new HardkasCliError(
      "SNAPSHOT_CONSENSUS_VALIDATION_UNSUPPORTED",
      "--consensus-validated is not supported: HardKAS does not validate snapshots against consensus, and a snapshot never declares it. Nothing was written.",
      { exitCode: HardkasExitCode.USAGE_ERROR, suggestion: `Create a local snapshot without it: hardkas localnet snapshot create ${name}` }
    );
  }
  snapshotDirFor(workspaceRoot, name); // refused before the workspace is even opened

  try {
    const { hardkasDir, outputDir } = await withSdk({ cwd: workspaceRoot }, (sdk) => ({
      hardkasDir: sdk.workspace.hardkasDir,
      outputDir: snapshotDirFor(sdk.workspace.root, options.name)
    }));

    const manifest = await createSnapshot({
      hardkasDir,
      outputDir,
      deterministicScope: "local-only"
    });

    if (options.json) {
      console.log(JSON.stringify(manifest, null, 2));
      return;
    }

    UI.causality(`Snapshot Created: ${options.name}`, {
      "Execution Scope": manifest.deterministicScope,
      "Snapshot Path": outputDir,
      "State Authority": manifest.stateAuthority || "filesystem artifacts",
      "Projection Layer": manifest.projectionAuthority || "local cache",
      "Snapshot Version": String(manifest.snapshotVersion),
      "Included Artifacts": String(manifest.includedArtifacts),
      "Excluded/Corrupted": `${manifest.excludedArtifacts} / ${manifest.corruptedArtifacts}`,
      // what the manifest says, which is never a consensus validation (createSnapshot refuses that scope)
      "Consensus Validated": manifest.consensusValidated ? "YES" : "NO",
      Notice: "Snapshots are portable local deterministic captures, NOT consensus proofs"
    });
  } catch (err: any) {
    const { HardkasCliError } = await import("../cli-errors.js");
    if (err?.code === "SNAPSHOT_EXISTS") {
      throw new HardkasCliError("SNAPSHOT_EXISTS", err.message, { exitCode: 1, cause: err });
    }
    throw new HardkasCliError(
      "SNAPSHOT_CREATE_FAILED",
      `Snapshot creation failed: ${((err instanceof Error) ? ((err instanceof Error) ? err.message : String(err)) : String(err))}`,
      { exitCode: 1, cause: err }
    );
  }
}
