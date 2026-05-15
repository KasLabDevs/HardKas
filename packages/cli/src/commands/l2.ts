import { Command } from "commander";
import { handleError } from "../ui.js";
import { runL2Networks } from "../runners/l2-networks-runner.js";
import { runL2ProfileShow } from "../runners/l2-profile-show-runner.js";
import { runL2ProfileValidate } from "../runners/l2-profile-validate-runner.js";
import { runL2TxBuild, runL2TxSign, runL2TxSend, runL2TxReceipt, runL2TxStatus } from "../runners/l2-tx-runners.js";
import { runL2ContractDeployPlan } from "../runners/l2-contract-runners.js";
import { runL2BridgeStatus, runL2BridgeAssumptions } from "../runners/l2-bridge-runners.js";
import { runL2RpcHealth } from "../runners/l2-rpc-health-runner.js";
import { runL2Balance, runL2Nonce } from "../runners/l2-account-runners.js";

export function registerL2Commands(program: Command) {
  const l2 = program.command("l2").description("Layer 2 (Igra) management");

  l2.command("networks")
    .description("List available L2 network profiles")
    .option("--json", "Output results in JSON format")
    .action(async (options) => { await runL2Networks(options); });

  const l2Profile = l2.command("profile").description("L2 profile management");
  l2Profile.command("show [name]")
    .description("Show L2 profile details")
    .option("--network <name>", "L2 network name")
    .option("--url <url>", "RPC URL override")
    .option("--chain-id <id>", "Chain ID override")
    .option("--json", "Output results in JSON format")
    .action(async (name, options) => { await runL2ProfileShow({ name, ...options }); });

  l2Profile.command("validate [name]")
    .description("Validate L2 profile")
    .option("--network <name>", "L2 network name")
    .option("--url <url>", "Override RPC URL for validation")
    .option("--json", "Output results in JSON format")
    .action(async (name, options) => { await runL2ProfileValidate({ name, ...options }); });

  const l2tx = l2.command("tx").description("Igra transaction management");
  l2tx.command("build")
    .description("Build L2 transaction plan")
    .option("--network <name>", "L2 network name")
    .option("--url <url>", "RPC URL override")
    .option("--chain-id <id>", "Chain ID override")
    .option("--from <address>", "From address")
    .option("--to <address>", "To address")
    .option("--value <wei>", "Value in wei", "0")
    .option("--data <hex>", "Call data", "0x")
    .option("--json", "Output as JSON")
    .action(async (options) => { try { await runL2TxBuild(options); } catch (e) { handleError(e); } });

  l2tx.command("sign <planPath>")
    .description("Sign L2 transaction plan")
    .option("--account <name>", "Account to sign with")
    .option("--json", "Output as JSON")
    .action(async (planPath, options) => { try { await runL2TxSign({ planPath, ...options }); } catch (e) { handleError(e); } });

  l2tx.command("send <signedPath>")
    .description("Send L2 transaction")
    .option("--yes", "Confirm submission")
    .option("--json", "Output as JSON")
    .action(async (signedPath, options) => { try { await runL2TxSend({ signedPath, ...options }); } catch (e) { handleError(e); } });

  l2tx.command("receipt <txHash>")
    .description("Get L2 transaction receipt")
    .option("--json", "Output as JSON")
    .action(async (txHash, options) => { try { await runL2TxReceipt({ txHash, ...options }); } catch (e) { handleError(e); } });

  l2tx.command("status <txHash>")
    .description("Check L2 transaction status via RPC")
    .option("--json", "Output as JSON")
    .action(async (txHash, options) => { try { await runL2TxStatus({ txHash, ...options }); } catch (e) { handleError(e); } });

  const l2contract = l2.command("contract").description("Igra contract management");
  l2contract.command("deploy-plan")
    .description("Build L2 contract deployment plan")
    .option("--network <name>", "L2 network name")
    .option("--url <url>", "RPC URL override")
    .option("--chain-id <id>", "Chain ID override")
    .option("--bytecode <hex>", "Contract bytecode")
    .option("--constructor <sig>", "Constructor signature")
    .option("--args <csv>", "Constructor arguments")
    .option("--json", "Output as JSON")
    .action(async (options) => { try { await runL2ContractDeployPlan(options); } catch (e) { handleError(e); } });

  const l2bridge = l2.command("bridge").description("Igra bridge awareness");
  l2bridge.command("status")
    .description("Show bridge security status")
    .option("--network <name>", "L2 network name")
    .option("--url <url>", "RPC URL override")
    .option("--json", "Output as JSON")
    .action(async (options) => { try { await runL2BridgeStatus(options); } catch (e) { handleError(e); } });

  l2bridge.command("assumptions")
    .description("Show bridge security assumptions")
    .option("--json", "Output as JSON")
    .action(async (options) => { try { await runL2BridgeAssumptions(options); } catch (e) { handleError(e); } });

  const l2rpc = l2.command("rpc").description("Igra RPC diagnostics");
  l2rpc.command("health")
    .description("Check L2 RPC health")
    .option("--network <name>", "L2 network name")
    .option("--url <url>", "RPC URL override")
    .option("--json", "Output as JSON")
    .action(async (options) => { try { await runL2RpcHealth(options); } catch (e) { handleError(e); } });

  l2.command("balance <address>")
    .description("Check Igra L2 balance")
    .option("--network <name>", "L2 network name")
    .option("--url <url>", "RPC URL override")
    .option("--chain-id <id>", "Chain ID override")
    .option("--json", "Output as JSON")
    .action(async (address, options) => { try { await runL2Balance(address, options); } catch (e) { handleError(e); } });

  l2.command("nonce <address>")
    .description("Check Igra L2 nonce")
    .option("--network <name>", "L2 network name")
    .option("--url <url>", "RPC URL override")
    .option("--chain-id <id>", "Chain ID override")
    .option("--json", "Output as JSON")
    .action(async (address, options) => { try { await runL2Nonce(address, options); } catch (e) { handleError(e); } });
}
