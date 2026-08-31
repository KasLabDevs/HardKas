import { createSnapshot } from "@hardkas/core";
import { UI } from "../ui.js";
export async function runSnapshotCreate(options) {
    const { name, workspaceRoot } = options;
    try {
        const { Hardkas } = await import("@hardkas/sdk");
        const sdk = await Hardkas.open({ cwd: workspaceRoot });
        const hardkasDir = sdk.workspace.hardkasDir;
        const outputDir = sdk.workspace.resolvePath("snapshots", options.name);
        const manifest = await createSnapshot({
            hardkasDir,
            outputDir,
            deterministicScope: options.consensusValidated
                ? "consensus-validated"
                : "local-only"
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
            "Consensus Validated": options.consensusValidated ? "YES" : "NO",
            Notice: "Snapshots are portable local deterministic captures, NOT consensus proofs"
        });
    }
    catch (err) {
        const { HardkasCliError } = await import("../cli-errors.js");
        throw new HardkasCliError("SNAPSHOT_CREATE_FAILED", `Snapshot creation failed: ${((err instanceof Error) ? ((err instanceof Error) ? err.message : String(err)) : String(err))}`, { exitCode: 1, cause: err });
    }
}
//# sourceMappingURL=snapshot-create-runner.js.map