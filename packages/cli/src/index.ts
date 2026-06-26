#!/usr/bin/env node

import { buildHardkasProgram } from "./program.js";
import { attachLedgerAppender } from "@hardkas/core";
import path from "node:path";

import { HardkasCliError, HardkasExitCode } from "./cli-errors.js";

async function main() {
  const isJson = process.argv.includes("--json");
  const isSilent = process.argv.includes("--silent") || process.argv.includes("--quiet");

  const { setGlobalOutput, createCommandOutput } = await import("./output.js");
  const mode = isSilent ? "silent" : isJson ? "json" : "human";
  setGlobalOutput(createCommandOutput({ mode }));

  const wsArgIndex = process.argv.indexOf("--workspace");
  const workspaceRoot =
    wsArgIndex !== -1 && process.argv[wsArgIndex + 1]
      ? path.resolve(process.argv[wsArgIndex + 1] as string)
      : process.cwd();

  attachLedgerAppender(workspaceRoot);

  const { loadHardkasConfig } = await import("@hardkas/config");
  let loadedConfig;
  try {
    loadedConfig = await loadHardkasConfig({ workspaceRoot });
  } catch (e) {
    // Ignore config load errors during CLI initialization;
    // commands will catch it when they try to use it if it's required.
  }

  const program = buildHardkasProgram({ loadedConfig });

  try {
    await program.parseAsync(process.argv);
    process.exit(0);
  } catch (err: any) {
    const { handleError } = await import("./ui.js");
    handleError(err);

    // For HardkasCliError in JSON mode, produce the structured error envelope
    // ONLY if the command didn't already write one.
    if (err instanceof HardkasCliError && isJson) {
      const { getOutput } = await import("./output.js");
      if (!getOutput().jsonWritten) {
        getOutput().writeJson({
          ok: false,
          code: err.code,
          message: err.message,
          mode: "cli"
        });
      }
    }

    const exitCode =
      err instanceof HardkasCliError
        ? err.exitCode
        : ((err as any).code) === "POLICY_DENIED"
          ? HardkasExitCode.POLICY_DENIED
          : HardkasExitCode.RUNTIME_FAILURE;
    process.exit(exitCode);
  }
}

main().catch(async (err) => {
  const { handleError } = await import("./ui.js");
  handleError(err, "Fatal error");
  if (((err as any).stack)) {
    const { maskSecrets } = await import("@hardkas/core");
    const { getOutput } = await import("./output.js");
    getOutput().error(maskSecrets(((err as any).stack)));
  }
  const exitCode =
    err instanceof HardkasCliError
      ? err.exitCode
      : ((err as any).code) === "POLICY_DENIED"
        ? HardkasExitCode.POLICY_DENIED
        : HardkasExitCode.RUNTIME_FAILURE;
  process.exit(exitCode);
});
