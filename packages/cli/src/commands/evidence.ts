import { Command } from "commander";
import { UI } from "../ui.js";
import { EvidenceManager } from "@hardkas/sdk";
import { explicitWorkspaceOrCwd } from "../workspace-root.js";
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
        const workspaceRoot = explicitWorkspaceOrCwd(); // --workspace is resolved once (WORKSPACE-AUTHORITY-1)
        
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
            getOutput().writeJson({ ok: true, command: "evidence verify", mode: "cli", result: { status: result.status, scope: result.scope } });
          } else {
            // TASK-EVIDENCE-UNBOUND-1 (D-TEU-3): the verdict always says what it covers and what it does not. What the
            // package verifies and what an RPC observer reported are separate lines, never one "payment proven".
            const s = result.scope;
            const out = getOutput();
            out.writeLine(`EVIDENCE_VERIFIED: ${s?.artifacts ?? 0} artifacts, claim ${s?.claim ?? "unspecified"}, run ${s?.verdict ?? "unknown"}, lineage ${s?.lineage ?? "unknown"}.`);
            for (const p of s?.payments ?? []) {
              const answer = p.submitAccepted === true ? "accepted the request" : p.submitAccepted === false ? "refused it" : "answer not recorded";
              out.writeLine(`Payment ${p.txId}: plan, signed and submission linked inside the package; the node ${answer} when it was submitted.`);
            }
            const reported = (s?.payments ?? []).flatMap((p) =>
              p.rpcObservationsReported.map((o) => `${p.txId}: ${o.finding ?? "no finding"}${o.confirmationsBlue !== null ? `, ${o.confirmationsBlue} blue confirmations` : ""} (${o.observer ?? "observer"})`)
            );
            if (reported.length > 0) {
              out.writeLine(`RPC observations carried, as one observer reported them (not checked against the network by this command): ${reported.join("; ")}.`);
            }
            if (s?.statement) out.writeLine(s.statement);
          }
        } else {
          if (options.json) {
            getOutput().writeJson({ ok: false, code: result.status, message: result.details, mode: "cli", ...(result.scope ? { scope: result.scope } : {}) });
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
