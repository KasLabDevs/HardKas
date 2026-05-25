#!/usr/bin/env node

import { buildHardkasProgram } from "./program.js";
import { attachLedgerAppender } from "@hardkas/query-store";

import { HardkasCliError, HardkasExitCode } from "./cli-errors.js";

async function main() {
  attachLedgerAppender();
  const program = buildHardkasProgram();

  try {
    await program.parseAsync(process.argv);
  } catch (err: any) {
    const { maskSecrets } = await import("@hardkas/core");
    console.error(`\nError: ${maskSecrets(err.message || String(err))}`);
    const exitCode = err instanceof HardkasCliError ? err.exitCode : (err.code === "POLICY_DENIED" ? HardkasExitCode.POLICY_DENIED : HardkasExitCode.RUNTIME_FAILURE);
    process.exit(exitCode);
  }
}

main().catch(async (err) => {
  const { maskSecrets } = await import("@hardkas/core");
  console.error("Fatal error:", maskSecrets(err.message || String(err)));
  if (err.stack) {
    console.error(maskSecrets(err.stack));
  }
  const exitCode = err instanceof HardkasCliError ? err.exitCode : (err.code === "POLICY_DENIED" ? HardkasExitCode.POLICY_DENIED : HardkasExitCode.RUNTIME_FAILURE);
  process.exit(exitCode);
});
