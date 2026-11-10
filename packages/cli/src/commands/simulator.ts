import { Command } from "commander";
import { KASPA_SIMULATOR_DEFAULT_PORT } from "@hardkas/core";
import { UI } from "../ui.js";
import { runSimulatorAccountCreate } from "../runners/simulator-runners.js";
import { runAccountsFund, parseFundAmount } from "../runners/accounts-fund-runner.js";

export function registerSimulatorCommands(program: Command) {
  const simulatorCmd = program
    .command("simulator")
    .description("HardKAS Simulator management");

  // SIM-16 / SIM-18 (audit 6-nov-2026): experimental, not "stable"; its own port (never the canonical localnet's nor a
  // Kaspa network's default); no mainnet (the dev keys derive from a public seed). The simulator reports
  // `2.1.0-kaspa-simulator`, so no canonical-node path (localnet, silver, capabilities, the simnet harness) accepts it.
  simulatorCmd
    .command("start")
    .description(`Start the in-memory Kaspa node simulator (approximate rules, not consensus-equivalent) ${UI.maturity("experimental")}`)
    .option("-p, --port <port>", "Port for the RPC server (HTTP JSON-RPC and wRPC JSON)", String(KASPA_SIMULATOR_DEFAULT_PORT))
    // ESCALÓN 2 · P17: the host's short flag is -H; -h is the help again (it was the host, so `-h` asked for a value)
    .option("-H, --host <host>", "Host to bind", "127.0.0.1")
    .option("-n, --network <network>", "Network ID (simnet, devnet, testnet-10, testnet-11)", "simnet")
    .option("--automine", "Automine is on by default (this flag changes nothing; --no-automine turns it off)", true)
    .option("--no-automine", "Disable automine mode")
    .option("--json", "Output as JSON", false)
    .action(async (options: any) => {
      const { createKaspaSimulator, SimulatorRpcServer, SIMULATOR_SERVER_VERSION } = await import("@hardkas/simulator");
      if (!["simnet", "devnet", "testnet-10", "testnet-11"].includes(String(options.network))) {
        UI.error(`SIMULATOR_NETWORK_UNSUPPORTED: '${options.network}' (the simulator runs simnet, devnet or a testnet; mainnet is refused)`);
        process.exitCode = 2;
        return;
      }
      const sim = createKaspaSimulator({
        networkId: options.network,
        automine: options.automine !== false,
        bootstrapDevAccounts: true
      });
      const server = new SimulatorRpcServer(sim);
      const port = parseInt(options.port, 10);
      const info = await server.start({ port, host: options.host });
      if (options.json) {
        const { getOutput } = await import("../output.js");
        getOutput().writeJson({
          ok: true,
          status: "running",
          nodeKind: "kaspa-simulator",
          serverVersion: SIMULATOR_SERVER_VERSION,
          maturity: "experimental",
          wsUrl: info.wsUrl,
          httpUrl: info.httpUrl
        });
      } else {
        UI.success(`Kaspa simulator (EXPERIMENTAL, ${SIMULATOR_SERVER_VERSION}) running on ${info.wsUrl}`);
        UI.info(`HTTP JSON-RPC endpoint: ${info.httpUrl}`);
        UI.info(`Network: ${options.network} | Automine: ${options.automine !== false ? "enabled" : "disabled"}`);
        UI.info("Approximate rules: validate timelocks, covenants and transaction rules against rusty-kaspad on simnet.");
      }
    });

  const accountCmd = simulatorCmd.command("account").description("Manage synthetic simulated accounts");
  
  accountCmd
    .command("create <name>")
    // SIM-18: the simulator's maturity, as `simulator start` and `simulator fund` (it was labelled stable)
    .description(`Create a synthetic simulated account (a kaspa:sim_ identity without a real key, for the simulated network only) ${UI.maturity("experimental")}`)
    .option("--json", "Output as JSON", false)
    .action(async (name: string, options: any) => {
      const { withLock } = await import("@hardkas/core");
      try {
        await withLock(
          {
            rootDir: process.cwd(),
            name: "simulator",
            command: `hardkas simulator account create ${name}`,
            wait: false,
            timeoutMs: 30000
          },
          async () => {
            await runSimulatorAccountCreate(name, options);
          }
        );
      } catch (e) {
        throw e;
      }
    });

  simulatorCmd
    .command("fund <identifier>")
    // SIM-18: the simulator's maturity, as `simulator start` (it was labelled stable)
    .description(`Fund a synthetic simulated account (the project's default network must be the simulator; synthetic UTXOs, not a Kaspa node's) ${UI.maturity("experimental")}`)
    .option("--amount <kas>", "Amount in KAS, up to 8 decimals, above 0", "1000")
    .option("--json", "Output as JSON", false)
    .action(async (identifier: string, options: any) => {
      try {
        // Enforce synthetic constraint before proceeding
        const { loadHardkasConfig } = await import("@hardkas/config");
        const { config } = await loadHardkasConfig({});
        const { resolveHardkasAccount } = await import("@hardkas/accounts");
        
        const target = { mode: "simulator", domain: "kaspa-l1", network: "simnet" } as const;

        let account;
        try {
          account = resolveHardkasAccount({ nameOrAddress: identifier, config, executionTarget: target });
        } catch {
          // If it fails to resolve, let accounts fund logic handle it,
          // but we can enforce kaspa:sim_ prefix here
        }

        if (account) {
          const { assertExecutionCompatibility } = await import("@hardkas/core");
          assertExecutionCompatibility({
            operation: "fund",
            target,
            account
          });
        }

        const amountSompi = parseFundAmount(options.amount);
        
        // Reusing accounts fund logic which is already synthetic
        const result = await runAccountsFund({ identifier, amountSompi });
        
        if (options.json) {
          const { getOutput } = await import("../output.js");
          getOutput().writeJson({ ok: true, command: "simulator fund", result: result.success ? "success" : "failed" });
        } else {
          const { getOutput } = await import("../output.js");
          getOutput().writeLine(result.formatted);
        }
      } catch (e) {
        throw e;
      }
    });
}
