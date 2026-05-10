#!/usr/bin/env node

import { Command } from "commander";
import { registerInitCommands } from "./commands/init.js";
import { registerTxCommands } from "./commands/tx.js";
import { registerArtifactCommands } from "./commands/artifact.js";
import { registerReplayCommands } from "./commands/replay.js";
import { registerSnapshotCommands } from "./commands/snapshot.js";
import { registerRpcCommands } from "./commands/rpc.js";
import { registerDagCommands } from "./commands/dag.js";
import { registerAccountsCommands } from "./commands/accounts.js";
import { registerL2Commands } from "./commands/l2.js";
import { registerNodeCommands } from "./commands/node.js";
import { registerConfigCommands } from "./commands/config.js";
import { registerMiscCommands } from "./commands/misc.js";
import { registerQueryCommands } from "./commands/query.js";
import { registerTestCommands } from "./commands/test.js";
import { registerDoctorCommand } from "./commands/doctor.js";
import { registerFaucetCommand } from "./commands/faucet.js";

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const packageJsonPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../package.json"
);

const { version: HARDKAS_VERSION } = JSON.parse(readFileSync(packageJsonPath, "utf8"));


async function main() {
  const program = new Command();

  program
    .name("hardkas")
    .description("HardKAS: Kaspa-native developer operating environment")
    .version(HARDKAS_VERSION);

  // Register modular command groups
  registerInitCommands(program);
  registerTxCommands(program);
  registerArtifactCommands(program);
  registerReplayCommands(program);
  registerSnapshotCommands(program);
  registerRpcCommands(program);
  registerDagCommands(program);
  registerAccountsCommands(program);
  registerL2Commands(program);
  registerNodeCommands(program);
  registerConfigCommands(program);
  registerMiscCommands(program);
  registerQueryCommands(program);
  registerTestCommands(program);
  registerDoctorCommand(program);
  registerFaucetCommand(program);

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
