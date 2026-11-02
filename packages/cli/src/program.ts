import { Command } from "commander";
import { registerInitCommands } from "./commands/init.js";
import { registerCreateCommand } from "./commands/create.js";
import { registerTxCommands } from "./commands/tx.js";
import { registerArtifactCommands } from "./commands/artifact.js";
import { registerReplayCommands } from "./commands/replay.js";
import { registerRpcCommands } from "./commands/rpc.js";
import { registerDagCommands } from "./commands/dag.js";
import { registerAccountsCommands } from "./commands/accounts.js";
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
import { registerSimulatorCommands } from "./commands/simulator.js";
import { registerDeployCommands } from "./commands/deploy.js";
import { registerDevCommands } from "./commands/dev.js";
import { registerKaspaCommands } from "./commands/kaspa.js";
import { registerBridgeCommands } from "./commands/bridge.js";
import { registerSessionCommands } from "./commands/session.js";
import { registerPsktCommands } from "./commands/pskt/index.js";
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
import { registerSilverCommand } from "./commands/silver.js";
import { registerKccCommands } from "./commands/kcc.js";
import { registerEscrowCommands } from "./commands/escrow.js";
import { registerCorpusCommands } from "./commands/corpus.js";
import { registerZkCommands } from "./commands/zk.js";
import { registerVprogsCommands } from "./commands/vprogs.js";
import { registerProgrammabilityCommands } from "./commands/programmability.js";
import { registerDevServerCommands } from "./commands/dev-server.js";
import { registerSecurityCommand } from "./commands/security.js";
import { registerEvidenceCommands } from "./commands/evidence.js";
import { registerEnvCommands } from "./commands/env.js";
import { registerToolchainCommands } from "./commands/toolchain.js";
import { registerExtensionCommands } from "./commands/extension.js";

import { HARDKAS_VERSION } from "@hardkas/artifacts";

import { registerTaskCommands } from "./commands/task.js";
import { noteParsedWorkspace, refuseIgnoredWorkspace } from "./workspace-root.js";
import { LoadedHardkasConfig } from "@hardkas/config";
import { EMPTY_EXTENSION_REGISTRY, type ExtensionRegistry, type ExtensionState } from "./extensions/registry.js";
import { registerExtensionRefusals } from "./extensions/refusal.js";
import { KNOWN_EXTENSIONS } from "./extensions/api.js";

/**
 * Builds the HardKAS Commander program tree.
 * Separated from execution to allow safe documentation generation and testing.
 *
 * L2-EXT stage 2: `extensions` is what the entry loaded (src/extensions/registry.ts). Without it the program is the L1
 * core; an extension that is not loaded owns hidden commands that answer with its typed reason.
 */
export function buildHardkasProgram(options?: {
  forDocs?: boolean;
  loadedConfig?: LoadedHardkasConfig | undefined;
  extensions?: ExtensionRegistry;
}): Command {
  const program = new Command();

  program
    .name("hardkas")
    .description("HardKAS: Kaspa-native developer operating environment")
    .version(HARDKAS_VERSION)
    .showHelpAfterError(true)
    .showSuggestionAfterError(true)
    // AUX-08: excess positional arguments are a usage error for every command
    // registered below (inherited by subcommands), never silently ignored.
    .allowExcessArguments(false)
    // WORKSPACE-AUTHORITY-1 (WA-I0): one explicit override of the workspace root, before or after the subcommand. It is
    // resolved once (src/workspace-root.ts); commands never read it from their own options. A command that does not take
    // its workspace from it refuses it (never ignores it).
    .option(
      "--workspace <path>",
      "Workspace root: the nearest hardkas.config.* at or above this directory, else the directory itself (default: from the current directory). Commands that act on the current directory refuse it"
    )
    .hook("preAction", (thisCommand, actionCommand) => {
      noteParsedWorkspace(thisCommand.opts().workspace);
      refuseIgnoredWorkspace(actionCommand);
    });

  // Register modular command groups
  // Generated docs describe the core only; an extension documents its own commands (design §3.3).
  const loadedRegistry = options?.forDocs ? EMPTY_EXTENSION_REGISTRY : options?.extensions ?? EMPTY_EXTENSION_REGISTRY;

  registerInitCommands(program);
  registerCreateCommand(program, loadedRegistry);
  registerTxCommands(program);
  registerArtifactCommands(program);
  registerReplayCommands(program);
  registerRpcCommands(program);
  registerDagCommands(program);
  registerAccountsCommands(program);
  registerNodeCommands(program);
  registerConfigCommands(program);
  registerQueryCommands(program);
  registerTestCommands(program);
  registerDoctorCommand(program, loadedRegistry);
  registerVerifyCommand(program);
  registerRebuildCommand(program);
  registerRunCommand(program);
  registerLockCommands(program);
  registerCapabilitiesCommand(program);
  registerConsoleCommand(program);
  registerLocalnetCommands(program);
  registerSimulatorCommands(program);
  registerDeployCommands(program);
  registerDevCommands(program);
  registerKaspaCommands(program);
  registerSessionCommands(program);
  registerPsktCommands(program);
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
  registerSilverCommand(program);
  registerKccCommands(program);
  registerEscrowCommands(program);
  registerCorpusCommands(program);
  registerZkCommands(program);
  registerVprogsCommands(program);
  registerProgrammabilityCommands(program);
  registerSecurityCommand(program);
  registerEnvCommands(program);
  registerToolchainCommands(program, loadedRegistry);
  registerTaskCommands(program, options?.loadedConfig);
  registerExtensionCommands(program, loadedRegistry);

  // Programmable workflows & Agent Mode
  registerWorkflowCommands(program);
  registerEvidenceCommands(program);

  // Igra L2 is the `l2` extension, not the L1 core: its commands (which can sign and broadcast EVM transactions) exist
  // only when @hardkas/ext-l2 is installed in the project and passed every load check. An extension whose
  // registration throws (a name clash with the core, say) is reported as incompatible and the core keeps working.
  const effective: ExtensionState[] = [...loadedRegistry.states];
  for (const ext of loadedRegistry.loaded) {
    const before = program.commands.length;
    const groups = program.commands.map((c) => [c, c.commands.length] as const);
    try {
      ext.extension.registerCommands?.(program, ext.context);
    } catch (e) {
      // undo a partial registration, including subcommands it added to core groups
      (program.commands as Command[]).splice(before);
      for (const [group, count] of groups) (group.commands as Command[]).splice(count);
      const i = effective.findIndex((s) => s.known.id === ext.known.id);
      effective[i] = { status: "incompatible", known: ext.known, reason: "load_failed", detail: `its commands failed to register: ${(e as Error)?.message ?? String(e)}` };
    }
  }
  if (!options?.forDocs) {
    // every catalog extension that is not loaded, also when no registry was passed (a program built without the entry)
    const effectiveRegistry: ExtensionRegistry = { states: effective, loaded: loadedRegistry.loaded };
    const loadedIds = new Set(effective.filter((s) => s.status === "loaded").map((s) => s.known.id));
    registerExtensionRefusals(program, effectiveRegistry, KNOWN_EXTENSIONS.filter((k) => !loadedIds.has(k.id)));
  }

  // Fallback / Catch-all: Add a docs command if we want to expose it via CLI
  // We only do this if requested and if it has no side effects.
  if (options?.forDocs) {
    // We can add hidden doc-only commands here if needed
  }

  return program;
}
