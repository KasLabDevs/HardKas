import path from "node:path";
import pc from "picocolors";
import { createSnapshot } from "@hardkas/core";
import { UI, handleError } from "../ui.js";

export interface SnapshotCreateOptions {
  name: string;
  consensusValidated: boolean;
  json?: boolean;
}

export async function runSnapshotCreate(options: SnapshotCreateOptions) {
  try {
    const hardkasDir = path.resolve(process.cwd(), ".hardkas");
    const outputDir = path.resolve(process.cwd(), "snapshots", options.name);

    const manifest = await createSnapshot({
      hardkasDir,
      outputDir,
      deterministicScope: options.consensusValidated ? "consensus-validated" : "local-only"
    });

    if (options.json) {
      console.log(JSON.stringify(manifest, null, 2));
      return;
    }

    UI.header(`Snapshot Created: ${options.name}`);
    console.log(`  Path:                 ${outputDir}`);
    console.log(`  Version:              ${manifest.snapshotVersion}`);
    console.log(`  Scope:                ${manifest.deterministicScope}`);
    console.log(`  Included Artifacts:   ${manifest.includedArtifacts}`);
    console.log(`  Excluded/Corrupted:   ${manifest.excludedArtifacts} / ${manifest.corruptedArtifacts}`);
    console.log("");
  } catch (err: any) {
    if (!options.json) handleError(err);
    process.exitCode = 1;
  }
}
