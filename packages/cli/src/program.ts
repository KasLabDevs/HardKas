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
import { registerRunCommand } from "./commands/run.js";

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { registerLockCommands } from "./commands/lock.js";

const packageJsonPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../package.json"
);

const { version: HARDKAS_VERSION } = JSON.parse(readFileSync(packageJsonPath, "utf8"));

/**
 * Builds the HardKAS Commander program tree.
 * Separated from execution to allow safe documentation generation and testing.
 */
export function buildHardkasProgram(options?: { forDocs?: boolean }): Command {
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
  registerRunCommand(program);
  registerLockCommands(program);

  // Optional: Add a docs command if we want to expose it via CLI
  // We only do this if requested and if it has no side effects.
  if (options?.forDocs) {
    // We can add hidden doc-only commands here if needed
  }

  return program;
}
