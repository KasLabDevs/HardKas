import { Command } from "commander";
import { UI } from "@hardkas/cli/extension-kit";

const l2Options = (cmd: Command): Command =>
  cmd
    .option("--profile <name>", "L2 network profile name (local, igra-galleon, igra-mainnet)", "local")
    .option("--rpc-url <url>", "Explicit Igra RPC URL to check")
    .option("--account <name>", "EVM account that must exist in hardkas.config (its balance is not checked)")
    .option("--timeout <ms>", "RPC timeout in milliseconds", "3000")
    .option("--json", "Output as JSON");

/**
 * NEW-11: `l2 doctor` checks the L2 side only; `dev doctor` (the one-version alias on the core's `dev` group, D6) keeps
 * its former report: the core's workspace checks (`hardkas doctor workspace`) plus this L2 section.
 */
export function addDoctorCommand(parent: Command, aliasOf?: string): void {
  if (aliasOf) {
    l2Options(
      parent
        .command("doctor")
        // SURFACE-TRUTH-1B (ST-D): an Igra L2 lab check, not a stable L1 command.
        .description(
          `Igra L2 lab, not the L1 core: the workspace checks of 'hardkas doctor workspace' plus the L2 ones of 'hardkas l2 doctor' (profile, JSON-RPC, chain id, EVM account); the Kaspa node is not checked ${UI.maturity("experimental")} (kept for one version: use those two commands)`
        )
    )
      .option("--release", "Run strict release gate checks")
      .action(async (options: any) => {
        const { runDevDoctor } = await import("../runners/dev-doctor-runner.js");
        await runDevDoctor(options);
      });
    return;
  }
  l2Options(
    parent
      .command("doctor")
      .description(
        `Igra L2 lab: check an L2 profile (the local Anvil profile by default; igra-galleon / igra-mainnet only when named): the profile, its EVM JSON-RPC, the chain id and an EVM account in hardkas.config. Workspace checks: 'hardkas doctor workspace' ${UI.maturity("experimental")}`
      )
  ).action(async (options: any) => {
    const { runL2Doctor } = await import("../runners/dev-doctor-runner.js");
    await runL2Doctor(options);
  });
}
