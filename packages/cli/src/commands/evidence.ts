import { Command } from "commander";
import { UI } from "../ui.js";
import { EvidenceManager } from "@hardkas/sdk";
import path from "node:path";
import { getOutput } from "../output.js";

export function registerEvidenceCommands(program: Command) {
  const evidenceCmd = program
    .command("evidence")
    .description(`Manage HardKAS Evidence Packages (.hke.json) ${UI.maturity("alpha")}`);

  evidenceCmd
    .command("pack <scenarioResultPath>")
    .description("Pack a scenario result and its artifacts into an evidence package")
    .option("--out <path>", "Output package file path")
    .option("--workspace <path>", "Override workspace root directory")
    .option("--json", "Output results as JSON", false)
    .action(async (scenarioResultPath: string, options: any) => {
      try {
        const workspaceRoot = options.workspace
          ? path.resolve(options.workspace)
          : process.cwd();
        
        const pkgPath = await EvidenceManager.pack({
          scenarioResultPath,
          workspaceRoot,
          outPath: options.out
        });

        if (options.json) {
          getOutput().writeJson({ ok: true, command: "evidence pack", mode: "cli", result: { file: pkgPath } });
        } else {
          getOutput().writeLine(`Evidence package successfully packed: ${pkgPath}`);
        }
      } catch (e: any) {
        const { handleError } = await import("../ui.js");
        handleError(e, "Evidence pack failed");
        process.exit(1);
      }
    });

  evidenceCmd
    .command("verify <packagePath>")
    .description("Verify the integrity and policy compliance of an evidence package")
    .option("--json", "Output results as JSON", false)
    .action(async (packagePath: string, options: any) => {
      try {
        const result = await EvidenceManager.verify(packagePath);
        if (result.ok) {
          if (options.json) {
            getOutput().writeJson({ ok: true, command: "evidence verify", mode: "cli", result: { status: result.status } });
          } else {
            getOutput().writeLine(`EVIDENCE_VERIFIED: The package is valid and structurally sound.`);
          }
        } else {
          if (options.json) {
            getOutput().writeJson({ ok: false, code: result.status, message: result.details, mode: "cli" });
            process.exit(1);
          } else {
            getOutput().error(`${result.status}: ${result.details}`);
            process.exit(1);
          }
        }
      } catch (e: any) {
        const { handleError } = await import("../ui.js");
        handleError(e, "Evidence verify failed");
        process.exit(1);
      }
    });

  evidenceCmd
    .command("explain <packagePath>")
    .description("Explain the contents and claims of an evidence package")
    .option("--json", "Output results as JSON", false)
    .action(async (packagePath: string, options: any) => {
      try {
        const expl = await EvidenceManager.explain(packagePath);
        if (options.json) {
          // Parse explanation if it's returning raw JSON string or string
          // For now, EvidenceManager.explain returns a string. Let's just wrap it.
          getOutput().writeJson({ ok: true, command: "evidence explain", mode: "cli", result: { explanation: expl } });
        } else {
          getOutput().writeLine(expl);
        }
      } catch (e: any) {
        const { handleError } = await import("../ui.js");
        handleError(e, "Evidence explain failed");
        process.exit(1);
      }
    });
}
