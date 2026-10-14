import { Command } from "commander";
import { UI, handleError } from "../ui.js";
import { HardkasCliError } from "../cli-errors.js";
import type { LoadedHardkasConfig } from "@hardkas/config";

export function registerTaskCommands(program: Command, loadedConfig?: LoadedHardkasConfig) {
  const taskGroup = program
    .command("task")
    .description("Execute an evidence-aware custom task");

  const tasks = loadedConfig?.config?.tasks || {};
  
  // Extract tasks from plugins so they are available in CLI
  const plugins = loadedConfig?.config?.plugins || [];
  for (const plugin of plugins) {
    if (plugin.tasks) {
      Object.assign(tasks, plugin.tasks);
    }
  }

  const taskNames = Object.keys(tasks);

  if (taskNames.length === 0) {
    // Register a generic catch-all if no tasks are defined
    taskGroup
      .command("<name>")
      .description("Run a task")
      .allowUnknownOption()
      .action(async (name) => {
        throw new HardkasCliError(
          "TASK_NOT_FOUND",
          `Task '${name}' not found. No tasks are defined in hardkas.config.ts.`,
          { exitCode: 1 }
        );
      });
    return;
  }

  for (const [name, definition] of Object.entries(tasks)) {
    const cmd = taskGroup.command(name).description(definition.description || `Run task: ${name}`);

    // Register options dynamically based on task parameters
    const params = definition.params || {};
    for (const paramName of Object.keys(params)) {
      const param = params[paramName];
      const flags = param.type === "boolean" 
        ? `--${paramName}` 
        : `--${paramName} <value>`;
      
      const desc = param.defaultValue !== undefined 
        ? `${param.description} (default: ${param.defaultValue})`
        : param.description;

      if (!param.isOptional) {
        cmd.requiredOption(flags, desc);
      } else {
        cmd.option(flags, desc);
      }
    }

    cmd.option("--evidence", "Automatically package task trace into .hke.json", false);
    cmd.option("--network <network>", "Override network for this task");
    cmd.option("--json", "Output results as JSON", false);

    cmd.action(async (options) => {
      // RESOURCE-LIFECYCLE-1 (RL-I1/RL-I3): the SDK this command opens and lends to the task is released once the task
      // and its recording are done, whatever they end with. What the task creates itself is the task's (RL-I2).
      let release: (() => Promise<void>) | undefined;
      try {
        const { Hardkas } = await import("@hardkas/sdk");
        const hk = await Hardkas.open({
          cwd: ".",
          mode: "developer",
          network: options.network || loadedConfig?.config?.defaultNetwork || "simulated"
        });
        release = () => hk.close();

        // Type conversion based on param definitions
        const typedArgs: Record<string, any> = {};
        for (const paramName of Object.keys(params)) {
          const param = params[paramName];
          let val = options[paramName];
          if (val === undefined && param.defaultValue !== undefined) {
            val = param.defaultValue;
          }
          if (val !== undefined) {
            if (param.type === "number") {
              const num = Number(val);
              if (isNaN(num)) {
                throw new HardkasCliError("TASK_PARAM_INVALID", `Parameter '${paramName}' must be a number`);
              }
              typedArgs[paramName] = num;
            } else if (param.type === "boolean") {
              typedArgs[paramName] = Boolean(val);
            } else {
              typedArgs[paramName] = String(val);
            }
          } else if (!param.isOptional) {
            throw new HardkasCliError("TASK_PARAM_INVALID", `Missing required parameter: ${paramName}`);
          }
        }

        UI.header(`Running Task: ${name}`);

        // Start trace recording
        // We'll simulate this by grabbing the runId or creating an artifact
        const { randomUUID } = await import("node:crypto");
        const runId = `task_${Date.now()}_${randomUUID().substring(0, 5)}`;
        
        // TASK-EVIDENCE-UNBOUND-1: what THIS run writes, recorded on the instance lent to the task (never the process's
        // or the workspace's other writers), becomes the run's sealed membership.
        const recording = hk.artifacts.record();
        let resultData;
        let failure: any;
        try {
          if (definition.actionFn) {
             resultData = await definition.actionFn(typedArgs, hk);
          }
        } catch (e: any) {
          failure = e;
        }
        const written = recording.stop();

        // First contact · E03: the task run is recorded as a sealed v5
        // `hardkas.scenarioResult.v1` (the shape EvidenceManager packs). The previous
        // ad-hoc body had no hashVersion, so the writer refused it (N3) and every
        // task failed after its action had already run.
        // TASK-EVIDENCE-UNBOUND-1 (D-TEU-1..4): it names what the run wrote, records the mode the instance ran in (not a
        // label derived from the network name), seals what its package may be presented as — nothing, artifacts, or the
        // payments it broadcast — and a failed run is recorded as failed (its error and arguments without secrets).
        const { createScenarioResultArtifact, scenarioModeForNetwork, ProjectArtifactStore } = await import("@hardkas/artifacts");
        const { maskSecrets, redactSecretFields } = await import("@hardkas/core");
        const taskNetwork = String(hk.network ?? "simulated");
        const executedMode = hk.execution?.mode;
        const mode =
          executedMode === "simulator" || executedMode === "localnet" || executedMode === "rpc" || executedMode === "l2-rpc"
            ? executedMode
            : scenarioModeForNetwork(taskNetwork);
        const writtenSet = new Set(written);
        const payments = (await new ProjectArtifactStore(hk.cwd).enumerateCanonicalArtifacts())
          .filter((entry) => typeof entry.contentHash === "string" && writtenSet.has(entry.contentHash))
          .map((entry) => entry.artifact as any)
          .filter((a) => a?.schema === "hardkas.txSubmission.v1" && typeof a.txId === "string")
          .map((a) => ({ txId: a.txId as string, submissionArtifactId: a.contentHash as string }));
        const failureMessage = failure !== undefined ? maskSecrets(`Task '${name}' failed: ${failure?.message ?? String(failure)}`) : undefined;
        const taskResult = createScenarioResultArtifact({
          scenarioName: name,
          status: failure === undefined ? "passed" : "failed",
          networkId: taskNetwork,
          mode,
          artifactsGenerated: written,
          evidenceClaim: payments.length > 0 ? { kind: "payment", payments } : written.length > 0 ? { kind: "artifacts" } : { kind: "none" },
          ...(failure !== undefined
            ? {
                error: {
                  code: typeof failure?.code === "string" && /^[A-Z][A-Z0-9_]*$/.test(failure.code) ? failure.code : "TASK_FAILED",
                  message: failureMessage!,
                  component: "task",
                  recoverable: false
                }
              }
            : {}),
          metadata: {
            kind: "task",
            taskName: name,
            runId,
            args: redactSecretFields(typedArgs),
            ...(resultData !== undefined ? { result: redactSecretFields(resultData) } : {})
          }
        });
        const writeResult = await hk.artifacts.write(taskResult as any);
        const taskResultPath = writeResult.absolutePath;

        if (failure === undefined) UI.success(`Task '${name}' completed successfully.`);

        if (options.evidence) {
          UI.info(`Packaging task evidence...`);
          const { EvidenceManager } = await import("@hardkas/sdk");
          try {
            const outPath = await EvidenceManager.pack({
              scenarioResultPath: taskResultPath!, // Re-use the packer logic for TaskResult
              workspaceRoot: hk.cwd
            });
            UI.success(`Evidence packed: ${outPath}`);
          } catch (e: any) {
            const reason = maskSecrets(String(e?.message ?? e));
            // a task that already failed reports its own failure; the package that could not follow it is noted
            if (failure !== undefined) UI.error(`Failed to pack evidence: ${reason}`);
            else
              throw new HardkasCliError("EVIDENCE_PACK_FAILED", `Task '${name}' completed but its evidence package was not written: ${reason}`, {
                exitCode: 1,
                context: { scenarioResult: String(taskResultPath), cause: String(e?.code ?? "unknown") }
              });
          }
        }

        if (failure !== undefined) {
          throw new HardkasCliError("TASK_FAILED", failureMessage!, { exitCode: 1, context: { scenarioResult: String(taskResultPath) } });
        }

        const { getOutput } = await import("../output.js");
        if (!getOutput().jsonWritten) {
          getOutput().writeJson({
            ok: true,
            command: "task",
            mode: "cli",
            result: {
              task: name,
              artifact: taskResultPath,
              output: resultData
            }
          });
        }

      } catch (e: any) {
        if (e instanceof HardkasCliError) throw e;
        // CLI-RUNTIME-CONTRACT-1: rendered once here with the task as context, rethrown as itself
        // (its own code and message, instead of a TASK_FAILED "Command failed").
        handleError(e, `Failed to execute task ${name}`);
        throw e;
      } finally {
        await release?.();
      }
    });
  }

  // Catch unknown tasks and throw a structured error
  taskGroup.on("command:*", (operands) => {
    throw new HardkasCliError(
      "TASK_NOT_FOUND",
      `Task '${operands[0]}' not found. Run 'hardkas task --help' to see available tasks.`,
      { exitCode: 1 }
    );
  });
}
