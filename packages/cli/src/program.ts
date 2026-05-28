import { Command } from "commander";
import { registerInitCommands } from "./commands/init.js";
import { registerTxCommands } from "./commands/tx.js";
import { registerArtifactCommands } from "./commands/artifact.js";
import { registerReplayCommands } from "./commands/replay.js";
import { registerRpcCommands } from "./commands/rpc.js";
import { registerDagCommands } from "./commands/dag.js";
import { registerAccountsCommands } from "./commands/accounts.js";
import { registerL2Commands } from "./commands/l2.js";
import { registerNodeCommands } from "./commands/node.js";
import { registerConfigCommands } from "./commands/config.js";
import { registerQueryCommands } from "./commands/query.js";
import { registerTestCommands } from "./commands/test.js";
import { registerDoctorCommand } from "./commands/doctor.js";
import { registerVerifyCommand } from "./commands/verify.js";
import { registerRebuildCommand } from "./commands/rebuild.js";
import { registerRunCommand } from "./commands/run.js";
import { registerLockCommands } from "./commands/lock.js";
import { registerCapabilitiesCommand } from "./commands/capabilities.js";
import { registerWorkflowCommands } from "./commands/workflow.js";
import { registerConsoleCommand } from "./commands/console.js";
import { registerLocalnetCommands } from "./commands/localnet.js";
import { registerDeployCommands } from "./commands/deploy.js";
import { registerMetamaskCommands } from "./commands/metamask.js";
import { registerDevCommands } from "./commands/dev.js";
import { registerLocalCommands } from "./commands/local.js";
import { registerKaspaCommands } from "./commands/kaspa.js";
import { registerBridgeCommands } from "./commands/bridge.js";
import { registerSessionCommands } from "./commands/session.js";
import { registerDashboardCommand } from "./commands/dashboard.js";
import { registerExplainCommand } from "./commands/explain.js";
import { registerTortureCommands } from "./commands/torture.js";
import { registerTelemetryCommands } from "./commands/telemetry.js";
import { registerRepairCommand } from "./commands/repair.js";
import { registerRotateCommand } from "./commands/rotate.js";
import { registerInspectCommand } from "./commands/inspect.js";
import { registerChaosCommands } from "./commands/chaos.js";
import { registerStatusCommands } from "./commands/status.js";
import { registerWhyCommand } from "./commands/why.js";
import { registerCiCommand } from "./commands/ci.js";
import { registerSandboxCommand } from "./commands/sandbox.js";

import { HARDKAS_VERSION } from "@hardkas/artifacts";

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
  registerRpcCommands(program);
  registerDagCommands(program);
  registerAccountsCommands(program);
  registerL2Commands(program);
  registerNodeCommands(program);
  registerConfigCommands(program);
  registerQueryCommands(program);
  registerTestCommands(program);
  registerDoctorCommand(program);
  registerVerifyCommand(program);
  registerRebuildCommand(program);
  registerRunCommand(program);
  registerLockCommands(program);
  registerCapabilitiesCommand(program);
  registerConsoleCommand(program);
  registerLocalnetCommands(program);
  registerDeployCommands(program);
  registerMetamaskCommands(program);
  registerDevCommands(program);
  registerLocalCommands(program);
  registerKaspaCommands(program);
  registerBridgeCommands(program);
  registerSessionCommands(program);
  registerDashboardCommand(program);
  registerExplainCommand(program);
  registerTortureCommands(program);
  registerTelemetryCommands(program);
  registerRepairCommand(program);
  registerRotateCommand(program);
  registerInspectCommand(program);
  registerChaosCommands(program);
  registerStatusCommands(program);
  registerWhyCommand(program);
  registerCiCommand(program);
  registerSandboxCommand(program);

  // Programmable workflows & Agent Mode
  registerWorkflowCommands(program);

  // Fallback / Catch-all: Add a docs command if we want to expose it via CLI
  // We only do this if requested and if it has no side effects.
  if (options?.forDocs) {
    // We can add hidden doc-only commands here if needed
  }

  return program;
}
