import { UI } from "../ui.js";
import { runWorkflowRun, runWorkflowInspect, runWorkflowReplay, runWorkflowDiff } from "../runners/workflow-runner.js";
export function registerWorkflowCommands(program) {
    const workflowCmd = program
        .command("workflow")
        .description(`Programmable deterministic workflows and agent orchestration ${UI.maturity("alpha")}`);
    workflowCmd
        .command("create <name>", { hidden: true })
        .description("Create a deterministic workflow from a template")
        .option("--template <name>", "Embedded template name")
        .option("--out <path>", "Output artifact file path")
        .option("--json", "Output the final workflow artifact as JSON", false)
        .option("--workspace <path>", "Override workspace root directory")
        .action(async (name, options) => {
        const { HardkasCliError } = await import("../cli-errors.js");
        throw new HardkasCliError("COMMAND_QUARANTINED", "workflow create is not part of the 0.12.0-rc.17 local-first surface", { exitCode: 1 });
    });
    workflowCmd
        .command("run <file>")
        .description("Execute a workflow JSON definition in Agent mode")
        .option("--dry-run", "Simulate the workflow without mutating the filesystem", false)
        .option("--network <net>", "Target network (e.g. simulated, testnet-10, mainnet)")
        .option("--offline", "Force offline execution (rejects real RPC connections)", false)
        .option("--timeout <ms>", "Maximum execution time in milliseconds")
        .option("--json", "Output the final workflow artifact as JSON", false)
        .action(async (file, options) => {
        await runWorkflowRun(file, options);
    });
    workflowCmd
        .command("inspect <id>")
        .description("Inspect a completed workflow artifact")
        .option("--json", "Output full artifact as JSON", false)
        .action(async (id, options) => {
        await runWorkflowInspect(id, options);
    });
    workflowCmd
        .command("replay <id>")
        .description("Deterministically replay and verify a workflow's lineage")
        .action(async (id, options) => {
        await runWorkflowReplay(id, options);
    });
    workflowCmd
        .command("diff <a> <b>")
        .description("Compare two workflow artifacts structurally")
        .action(async (a, b, options) => {
        await runWorkflowDiff(a, b, options);
    });
}
//# sourceMappingURL=workflow.js.map