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

const HARDKAS_VERSION = "0.2.0-alpha";

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

  try {
    await program.parseAsync(process.argv);
  } catch (err: any) {
    console.error(`\nError: ${err.message}`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
