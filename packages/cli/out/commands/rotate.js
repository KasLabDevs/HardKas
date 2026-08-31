import pc from "picocolors";
import { handleError, UI } from "../ui.js";
import { TelemetryRotator } from "@hardkas/core";
export function registerRotateCommand(program) {
    program
        .command("rotate")
        .description(`Rotate and archive telemetry streams ${UI.maturity("beta")}`)
        .option("--json", "Output results as stable JSON schema", false)
        .option("--force", "Force rotation even if file size is below threshold", false)
        .action(async (opts) => {
        try {
            await runRotate(opts);
        }
        catch (err) {
            handleError(err);
        }
    });
}
async function runRotate(opts) {
    if (opts.json)
        UI.setJsonMode(true);
    if (!opts.json) {
        UI.box("HardKAS Rotate", "Telemetry Archival");
    }
    const rootDir = process.cwd();
    const result = opts.force
        ? TelemetryRotator.forceRotate(rootDir)
        : TelemetryRotator.rotateIfNeeded(rootDir);
    if (opts.json) {
        UI.writeJson(result);
    }
    else {
        if (result.rotated) {
            UI.logHuman(`${pc.green("✅")} Telemetry rotated successfully.`);
            UI.logHuman(`   Archive Path: ${result.archivePath}`);
            UI.logHuman(`   Bytes Moved: ${result.bytesRotated}`);
        }
        else {
            UI.logHuman(`${pc.yellow("⚠️")} Telemetry not rotated.`);
            UI.logHuman(`   Reason: ${result.reason}`);
        }
        UI.divider();
        const segments = TelemetryRotator.listArchivedSegments(rootDir);
        UI.logHuman(`Archived Segments: ${segments.length}`);
        segments.forEach((s) => UI.logHuman(` - ${s}`));
    }
}
//# sourceMappingURL=rotate.js.map