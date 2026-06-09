#!/usr/bin/env node

import { buildHardkasProgram } from "./program.js";
import { attachLedgerAppender } from "@hardkas/core";

import { HardkasCliError, HardkasExitCode } from "./cli-errors.js";

async function main() {
  attachLedgerAppender(process.cwd());
  const program = buildHardkasProgram();

  try {
    await program.parseAsync(process.argv);
  } catch (err: any) {
    const { handleError } = await import("./ui.js");
    handleError(err);
    const exitCode =
      err instanceof HardkasCliError
        ? err.exitCode
        : err.code === "POLICY_DENIED"
          ? HardkasExitCode.POLICY_DENIED
          : HardkasExitCode.RUNTIME_FAILURE;
    process.exit(exitCode);
  }
}

main().catch(async (err) => {
  const { handleError } = await import("./ui.js");
  handleError(err, "Fatal error");
  if (err.stack) {
    const { maskSecrets } = await import("@hardkas/core");
    console.error(maskSecrets(err.stack));
  }
  const exitCode =
    err instanceof HardkasCliError
      ? err.exitCode
      : err.code === "POLICY_DENIED"
        ? HardkasExitCode.POLICY_DENIED
        : HardkasExitCode.RUNTIME_FAILURE;
  process.exit(exitCode);
});
