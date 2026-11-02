import fs from "node:fs";
import path from "node:path";
import { Command } from "commander";
import { UI, getOutput, invocationWorkspaceRoot, HardkasCliError, HardkasExitCode } from "@hardkas/cli/extension-kit";

/**
 * L2-EXT stage 6 · `hardkas l2 dev accounts|deploy|call|send` and `hardkas l2 test`: local development against the
 * Anvil node this workspace's HardKAS started, and nothing else. These commands have no --url, --network or
 * --chain-id on purpose: the only endpoint is the verified local node (see dev/local-node.ts).
 */
export function registerL2DevCommands(l2: Command): void {
  const dev = l2.command("dev").description(`Deploy, call and send on the LOCAL Anvil node HardKAS started (chain id 31337 only) ${UI.maturity("experimental")}`);
  const out = (command: string, json: boolean, result: unknown, human: () => void) => (json ? getOutput().writeJson({ ok: true, command, result }) : human());

  dev
    .command("accounts")
    .description("The local node's development accounts (they sign the local transactions; HardKAS holds no key)")
    .option("--json", "Output as JSON", false)
    .action(async (o: { json: boolean }) => {
      const { devAccounts } = await import("../dev/actions.js");
      const r = await devAccounts(invocationWorkspaceRoot());
      out("l2 dev accounts", o.json, r, () => r.accounts.forEach((a, i) => UI.field(String(i), a)));
    });

  dev
    .command("deploy <contract>")
    .description("Deploy a contract of the verified build (hardkas l2 compile) to the local node")
    .option("--args <json>", "Constructor arguments, as a JSON array")
    .option("--from <account>", "A local development account (address or index; default 0)")
    .option("--value <wei>", "Value sent with the deployment, in wei")
    .option("--gas-limit <gas>", "Gas limit (default: the node's estimate + 20 %)")
    .option("--json", "Output as JSON", false)
    .action(async (contract: string, o: any) => {
      const a = await import("../dev/actions.js");
      const r = await a.devDeploy(invocationWorkspaceRoot(), contract, a.parseArgsJson(o.args), { from: o.from, value: o.value, gasLimit: o.gasLimit });
      out("l2 dev deploy", o.json, r, () => {
        UI.success(`${r.contract} deployed at ${r.address}`);
        UI.field("tx", `${r.txHash} (block ${r.blockNumber}, gas used ${r.gasUsed})`);
      });
    });

  dev
    .command("call <target> <function>")
    .description("Read-only call (eth_call) on a contract deployed to the local node (target: its name or address)")
    .option("--args <json>", "Function arguments, as a JSON array")
    .option("--contract <name>", "The contract at an address target")
    .option("--json", "Output as JSON", false)
    .action(async (target: string, fn: string, o: any) => {
      const a = await import("../dev/actions.js");
      const r = await a.devCall(invocationWorkspaceRoot(), target, fn, a.parseArgsJson(o.args), { contract: o.contract });
      out("l2 dev call", o.json, r, () => UI.field(`${fn}()`, JSON.stringify(r.result)));
    });

  dev
    .command("send <target> <function>")
    .description("Transaction to a contract deployed to the local node; prints the receipt, gas and decoded events")
    .option("--args <json>", "Function arguments, as a JSON array")
    .option("--contract <name>", "The contract at an address target")
    .option("--from <account>", "A local development account (address or index; default 0)")
    .option("--value <wei>", "Value sent, in wei")
    .option("--gas-limit <gas>", "Gas limit (default: the node's estimate + 20 %; given, the estimate is skipped)")
    .option("--json", "Output as JSON", false)
    .action(async (target: string, fn: string, o: any) => {
      const a = await import("../dev/actions.js");
      const r = await a.devSend(invocationWorkspaceRoot(), target, fn, a.parseArgsJson(o.args), { contract: o.contract, from: o.from, value: o.value, gasLimit: o.gasLimit });
      out("l2 dev send", o.json, r, () => {
        UI.success(`${fn}() mined in block ${r.blockNumber} (gas used ${r.gasUsed})`);
        for (const e of r.events) UI.field("event", `${e.event ?? "unknown"} ${JSON.stringify(e.args ?? {})}`);
      });
    });

  l2.command("test")
    .description(`Run the project's Solidity tests offline with the pinned, verified forge + solc ${UI.maturity("experimental")}`)
    .option("--match <regex>", "Only tests whose name matches")
    .option("--allow-ffi", "Run even if the project's Foundry config enables FFI (its tests can then run any command: trusted projects only)", false)
    .option("--json", "Output as JSON", false)
    .action(async (o: { match?: string; allowFfi: boolean; json: boolean }) => {
      const root = invocationWorkspaceRoot();
      if (!fs.existsSync(path.join(root, "foundry.toml"))) {
        throw new HardkasCliError("L2_PROJECT_NOT_FOUND", `no foundry.toml in ${root} (create one with: hardkas create l2-evm <dir>)`, { exitCode: HardkasExitCode.USAGE_ERROR });
      }
      const { verifiedToolchain } = await import("../toolchains/verified.js");
      const nothing = "no test was run";
      const tools = { forge: await verifiedToolchain("foundry", nothing), solc: await verifiedToolchain("solc", nothing) };
      const { forgeTest } = await import("../compile/forge-build.js");
      const r = await forgeTest(root, tools, { match: o.match, allowFfi: o.allowFfi });
      if (!r.passed) {
        throw new HardkasCliError("L2_TEST_FAILED", `forge test failed: ${r.summary}\n${r.output.split(/\r?\n/).slice(-30).join("\n")}`, { exitCode: HardkasExitCode.RUNTIME_FAILURE });
      }
      out("l2 test", o.json, { passed: true, summary: r.summary, ffi: r.ffi }, () => UI.success(r.summary || "tests passed"));
    });
}
