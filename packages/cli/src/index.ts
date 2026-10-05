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

  const program = buildHardkasProgram({ loadedConfig });

  try {
    await program.parseAsync(process.argv);
    // F3: a command that finished normally may have set a nonzero exit code; it is never discarded.
    // CLI-RUNTIME-CONTRACT-1: an error a command rendered and then swallowed set that code too.
    process.exit(process.exitCode ?? 0);
  } catch (err: any) {
    // CLI-RUNTIME-CONTRACT-1: the renderer owns the failure (one human rendering, one JSON envelope,
    // the typed code preserved) and the exit code follows the error — in one place, for every error type.
    const { handleError, exitCodeOf } = await import("./ui.js");
    handleError(err);
    process.exit(exitCodeOf(err));
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
  process.exit(exitCodeOf(err));
});
