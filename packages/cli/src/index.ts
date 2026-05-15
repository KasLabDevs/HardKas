#!/usr/bin/env node

import { buildHardkasProgram } from "./program.js";

async function main() {
  const program = buildHardkasProgram();

  try {
    await program.parseAsync(process.argv);
  } catch (err: any) {
    const { maskSecrets } = await import("@hardkas/core");
    console.error(`\nError: ${maskSecrets(err.message || String(err))}`);
    process.exit(1);
  }
}

main().catch(async (err) => {
  const { maskSecrets } = await import("@hardkas/core");
  console.error("Fatal error:", maskSecrets(err.message || String(err)));
  if (err.stack) {
    console.error(maskSecrets(err.stack));
  }
  process.exit(1);
});
