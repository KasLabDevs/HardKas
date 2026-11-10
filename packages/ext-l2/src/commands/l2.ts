import { handleError } from "@hardkas/cli/extension-kit";
import { Command } from "commander";
import { registerMetamaskCommands } from "./metamask.js";
import { addWizardCommand } from "./local.js";
import { addDoctorCommand } from "./doctor.js";
import { registerL2NodeCommands } from "./node.js";
import { registerL2CompileCommand } from "./compile.js";
import { registerL2DevCommands } from "./dev.js";

// L2-EXT stage 2: the runners (and with them @hardkas/l2 and viem) load only when an `l2` command runs, so having the
// extension installed costs an L1 command nothing.
const txRunners = () => import("../runners/l2-tx-runners.js");

export function registerL2Commands(program: Command) {
  const l2 = program
    .command("l2")
    .description("Igra L2 (EVM) lab, the `l2` extension: profiles, JSON-RPC, EVM transactions and contracts");

  l2.hook("preAction", () => {
    if (!process.env.HARDKAS_EXPERIMENTAL) {
      console.warn(
        "\n⚠️  WARNING: 'l2' commands are highly experimental and unsupported. Set HARDKAS_EXPERIMENTAL=1 to acknowledge.\n"
      );
    }
  });

  l2.command("networks")
    .description("List available L2 network profiles")
    .option("--json", "Output results in JSON format")
    .action(async (options) => {
      const { runL2Networks } = await import("../runners/l2-networks-runner.js");
      await runL2Networks(options);
    });

  const l2Profile = l2.command("profile").description("L2 profile management");
  l2Profile
    .command("show [name]")
    .description("Show L2 profile details")
    .option("--network <name>", "L2 network name")
    .option("--url <url>", "RPC URL override")
    .option("--chain-id <id>", "Chain ID override")
    .option("--json", "Output results in JSON format")
    .action(async (name, options) => {
      const { runL2ProfileShow } = await import("../runners/l2-profile-show-runner.js");
      await runL2ProfileShow({ name, ...options });
    });

  l2Profile
    .command("validate [name]")
    .description("Validate L2 profile")
    .option("--network <name>", "L2 network name")
    .option("--url <url>", "Override RPC URL for validation")
    .option("--json", "Output results in JSON format")
    .action(async (name, options) => {
      const { runL2ProfileValidate } = await import("../runners/l2-profile-validate-runner.js");
      await runL2ProfileValidate({ name, ...options });
    });

  // Flags of every command that signs or broadcasts. MAINNET TOTAL LOCKDOWN: --allow-mainnet no longer authorizes
  // anything (kept so scripts do not break; it has no effect). --yes is a confirmation and never implies it. Fee
  // ceilings are required unless the profile ships them (local).
  const writeFlags = (cmd: Command): Command =>
    cmd
      .option("--allow-mainnet", "No effect: mainnet is locked down in HardKAS (no signing, broadcast or connection; L2_MAINNET_WRITE_BLOCKED)")
      .option("--max-gas-limit <gas>", "Fee ceiling: maximum gas limit")
      .option("--max-fee-per-gas <wei>", "Fee ceiling: maximum gas price / maxFeePerGas in wei")
      .option("--max-total-fee <wei>", "Fee ceiling: maximum worst-case total fee in wei");

  const l2tx = l2.command("tx").description("Igra transaction management");
  writeFlags(
    l2tx
      .command("build")
      .description("Build L2 transaction plan")
      .option("--network <name>", "L2 network profile (required): local, igra-galleon, igra-mainnet")
      .option("--url <url>", "RPC URL override")
      .option("--chain-id <id>", "Chain ID (must equal the profile's)")
      .option("--from <address>", "From address")
      .option("--to <address>", "To address")
      .option("--value <wei>", "Value in wei", "0")
      .option("--data <hex>", "Call data", "0x")
      .option("--gas-limit <gas>", "Gas limit (default: RPC estimate, checked against the ceiling)")
      .option("--gas-price <wei>", "Gas price in wei (default: RPC value, checked against the ceiling)")
      .option("--nonce <n>", "Nonce (default: RPC pending count)")
      .option("--json", "Output as JSON")
  ).action(async (options) => {
    try {
      await (await txRunners()).runL2TxBuild(options);
    } catch (e) {
      handleError(e);
    }
  });

  writeFlags(
    l2tx
      .command("sign <planPath>")
      .description("Sign L2 transaction plan")
      .option("--account <name>", "Account to sign with")
      .option("--network <name>", "Must match the plan's network")
      .option("--json", "Output as JSON")
  ).action(async (planPath, options) => {
    try {
      await (await txRunners()).runL2TxSign({ planPath, ...options });
    } catch (e) {
      handleError(e);
    }
  });

  writeFlags(
    l2tx
      .command("send <signedPath>")
      .description("Send L2 transaction")
      .option("--network <name>", "Must match the signed artifact's network")
      .option("--url <url>", "RPC URL override")
      .option("--yes", "Confirm submission")
      .option("--json", "Output as JSON")
  )
    .action(async (signedPath, options) => {
      try {
        await (await txRunners()).runL2TxSend({ signedPath, ...options });
      } catch (e) {
        handleError(e);
      }
    });

  l2tx
    .command("receipt <txHash>")
    .description("Get L2 transaction receipt")
    .option("--json", "Output as JSON")
    .action(async (txHash, options) => {
      try {
        await (await txRunners()).runL2TxReceipt({ txHash, ...options });
      } catch (e) {
        handleError(e);
      }
    });

  l2tx
    .command("status <txHash>")
    .description("Check L2 transaction status via RPC")
    .option("--json", "Output as JSON")
    .action(async (txHash, options) => {
      try {
        await (await txRunners()).runL2TxStatus({ txHash, ...options });
      } catch (e) {
        handleError(e);
      }
    });

  const l2contract = l2.command("contract").description("Igra contract management");
  writeFlags(
    l2contract
      .command("deploy-plan")
      .description("Build L2 contract deployment plan")
      .option("--network <name>", "L2 network profile (default: local)")
      .option("--url <url>", "RPC URL override")
      .option("--chain-id <id>", "Chain ID (must equal the profile's)")
      .option("--bytecode <hex>", "Contract bytecode")
      .option("--constructor <sig>", "Constructor signature")
      .option("--args <csv>", "Constructor arguments")
      .option("--json", "Output as JSON")
  ).action(async (options) => {
      try {
        const { runL2ContractDeployPlan } = await import("../runners/l2-contract-runners.js");
        await runL2ContractDeployPlan(options);
      } catch (e) {
        handleError(e);
      }
    });

  const l2bridge = l2.command("bridge").description("Igra bridge awareness");
  l2bridge
    .command("status")
    .description("Show bridge security status")
    .option("--network <name>", "L2 network name")
    .option("--url <url>", "RPC URL override")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      try {
        const { runL2BridgeStatus } = await import("../runners/l2-bridge-runners.js");
        await runL2BridgeStatus(options);
      } catch (e) {
        handleError(e);
      }
    });

  l2bridge
    .command("assumptions")
    .description("Show bridge security assumptions")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      try {
        const { runL2BridgeAssumptions } = await import("../runners/l2-bridge-runners.js");
        await runL2BridgeAssumptions(options);
      } catch (e) {
        handleError(e);
      }
    });

  const l2rpc = l2.command("rpc").description("Igra RPC diagnostics");
  l2rpc
    .command("health")
    .description("Check L2 RPC health")
    .option("--network <name>", "L2 network name")
    .option("--url <url>", "RPC URL override")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      try {
        const { runL2RpcHealth } = await import("../runners/l2-rpc-health-runner.js");
        await runL2RpcHealth(options);
      } catch (e) {
        handleError(e);
      }
    });

  l2.command("balance <address>")
    .description("Check Igra L2 balance")
    .option("--network <name>", "L2 network name")
    .option("--url <url>", "RPC URL override")
    .option("--chain-id <id>", "Chain ID override")
    .option("--json", "Output as JSON")
    .action(async (address, options) => {
      try {
        const { runL2Balance } = await import("../runners/l2-account-runners.js");
        await runL2Balance(address, options);
      } catch (e) {
        handleError(e);
      }
    });

  l2.command("nonce <address>")
    .description("Check Igra L2 nonce")
    .option("--network <name>", "L2 network name")
    .option("--url <url>", "RPC URL override")
    .option("--chain-id <id>", "Chain ID override")
    .option("--json", "Output as JSON")
    .action(async (address, options) => {
      try {
        const { runL2Nonce } = await import("../runners/l2-account-runners.js");
        await runL2Nonce(address, options);
      } catch (e) {
        handleError(e);
      }
    });

  // Moved from the core with the extension (D6): `l2 metamask`, `l2 wizard`, `l2 doctor`.
  registerMetamaskCommands(l2);
  addWizardCommand(l2, "wizard");
  addDoctorCommand(l2);
  // L2-EXT stage 4: the local Anvil node
  registerL2NodeCommands(l2);
  registerL2CompileCommand(l2);
  registerL2DevCommands(l2);
}

/** The one-version aliases on the core's groups: `dev doctor` (the core's `dev` group exists) and `local wizard`. */
export function registerL2Aliases(program: Command): void {
  const dev = program.commands.find((c) => c.name() === "dev");
  if (dev) addDoctorCommand(dev, "l2 doctor");
}
