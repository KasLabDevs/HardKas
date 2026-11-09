#!/usr/bin/env node

import { buildHardkasProgram } from "./program.js";
import { attachLedgerAppender } from "@hardkas/core";

async function main() {
  const isJson = process.argv.includes("--json");
  const isSilent = process.argv.includes("--silent") || process.argv.includes("--quiet");

  const { setGlobalOutput, createCommandOutput, installConsoleRedaction } = await import("./output.js");
  const mode = isSilent ? "silent" : isJson ? "json" : "human";
  setGlobalOutput(createCommandOutput({ mode }));
  // EVIDENCE-TRUST-1 (ET-C5): no URL credential reaches the terminal through a direct console print either.
  installConsoleRedaction();

  // WORKSPACE-AUTHORITY-1 (WA-I0): the workspace root is resolved once, here, and the event ledger, the config and every
  // workspace-aware command use that one root.
  const { resolveWorkspaceRoot, loadHardkasConfig } = await import("@hardkas/config");
  const { workspaceArgFrom, fixInvocationWorkspace } = await import("./workspace-root.js");
  const workspace = resolveWorkspaceRoot({ explicit: workspaceArgFrom(process.argv) });
  fixInvocationWorkspace(workspace);
  const workspaceRoot = workspace.root;

  attachLedgerAppender(workspaceRoot);

  let loadedConfig;
  try {
    loadedConfig = await loadHardkasConfig({ workspaceRoot });
  } catch (e) {
    // Ignore config load errors during CLI initialization;
    // commands will catch it when they try to use it if it's required.
  }

  // L2-EXT stage 2: first-party extensions installed in the project (design §3.3). The registry imports an extension
  // only after its checks pass; without one, no extension code (and nothing of @hardkas/l2 or viem) is loaded.
  const { loadExtensions } = await import("./extensions/registry.js");
  const { HARDKAS_VERSION } = await import("@hardkas/artifacts");
  const extensions = await loadExtensions({ workspaceRoot, loadedConfig, cliVersion: HARDKAS_VERSION });

  const program = buildHardkasProgram({ loadedConfig, extensions });
  // INT9 · CLI-CONTRACT-2B D1/D2: under --json a usage error commander detects (unknown option, missing argument…) is the
  // CLI's one envelope with the usage exit code (2). Commander used to print its text and call process.exit(1) itself;
  // with the override it throws instead (its message still goes to stderr), and the renderer below answers.
  if (isJson) {
    const override = (cmd: { exitOverride(): unknown; commands: readonly any[] }) => {
      cmd.exitOverride();
      for (const sub of cmd.commands) override(sub);
    };
    override(program as any);
  }

  // R0-I1: a command's result is its exit status, never an abrupt termination. The entry sets the status and returns;
  // the runtime then closes naturally, after draining its pending work (an abrupt process.exit() raced V8's background
  // WebAssembly compilation and aborted a finished command on Windows: VERIFY-EXIT-CRASH).
  try {
    await program.parseAsync(process.argv);
    // F3: a command that finished normally may have set a nonzero exit code; it is never discarded.
    // CLI-RUNTIME-CONTRACT-1: an error a command rendered and then swallowed set that code too.
    process.exitCode = process.exitCode ?? 0;
  } catch (caught: unknown) {
    let err: any = caught;
    // INT9 · CLI-CONTRACT-2B D1/D2: commander's own outcome under --json (exitOverride above): help and version keep
    // their exit 0; a usage error becomes one typed envelope with the usage exit code
    if (typeof err?.code === "string" && err.code.startsWith("commander.")) {
      if (err.exitCode === 0) {
        process.exitCode = 0;
        return;
      }
      const { HardkasCliError, HardkasExitCode } = await import("./cli-errors.js");
      const codes: Record<string, string> = {
        "commander.unknownOption": "UNKNOWN_OPTION",
        "commander.unknownCommand": "UNKNOWN_COMMAND",
        "commander.missingArgument": "MISSING_ARGUMENT",
        "commander.optionMissingArgument": "OPTION_MISSING_ARGUMENT",
        "commander.missingMandatoryOptionValue": "MISSING_MANDATORY_OPTION",
        "commander.excessArguments": "EXCESS_ARGUMENTS",
        "commander.invalidArgument": "INVALID_ARGUMENT",
        "commander.conflictingOption": "CONFLICTING_OPTIONS"
      };
      err = new HardkasCliError(codes[err.code] ?? "USAGE_ERROR", String(err.message ?? err).replace(/^error:\s*/, ""), {
        exitCode: HardkasExitCode.USAGE_ERROR,
        cause: err
      });
    }
    // CLI-RUNTIME-CONTRACT-1: the renderer owns the failure (one human rendering, one JSON envelope,
    // the typed code preserved) and the exit code follows the error — in one place, for every error type.
    const { handleError, exitCodeOf } = await import("./ui.js");
    handleError(err);
    process.exitCode = exitCodeOf(err);
  }
}

main().catch(async (err) => {
  const { handleError, exitCodeOf } = await import("./ui.js");
  handleError(err, "Fatal error");
  if (((err as any).stack)) {
    const { maskSecrets } = await import("@hardkas/core");
    const { getOutput } = await import("./output.js");
    getOutput().error(maskSecrets(((err as any).stack)));
  }
  process.exitCode = exitCodeOf(err);
});
