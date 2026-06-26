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
      try {
        const { Hardkas } = await import("@hardkas/sdk");
        const hk = await Hardkas.open(".", { 
          mode: "script",
          network: options.network || loadedConfig?.config?.defaultNetwork || "simulated"
        });

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
        
        let resultData;
        try {
          if (definition.actionFn) {
             resultData = await definition.actionFn(typedArgs, hk);
          }
        } catch (e: any) {
          throw new HardkasCliError("TASK_FAILED", `Task '${name}' failed: ${e.message}`, { exitCode: 1 });
        }

        // Always write a TaskResult artifact (shaped compatibly for EvidenceManager)
        const writeResult = await hk.artifacts.write({
          type: "TaskResult",
          scenarioName: name,
          status: "PASSED",
          networkId: hk.network,
          mode: "script",
          artifactsGenerated: [],
          metadata: {
            taskName: name,
            args: typedArgs,
            timestamp: new Date().toISOString()
          },
          payload: {
             result: resultData
          }
        }, {
          fileName: `task-results/${runId}.task-result.json`
        });
        const taskResultPath = writeResult.absolutePath;

        UI.success(`Task '${name}' completed successfully.`);

        if (options.evidence) {
          UI.info(`Packaging task evidence...`);
          const { EvidenceManager } = await import("@hardkas/sdk");
          try {
            const outPath = await EvidenceManager.pack({
              scenarioResultPath: taskResultPath, // Re-use the packer logic for TaskResult
              workspaceRoot: hk.cwd
            });
            UI.success(`Evidence packed: ${outPath}`);
          } catch (e: any) {
             UI.error(`Failed to pack evidence: ${e.message}`);
          }
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
        handleError(e, `Failed to execute task ${name}`);
        throw new HardkasCliError("TASK_FAILED", "Command failed", { exitCode: 1 });
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
