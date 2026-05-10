import { Command } from "commander";
import { handleError } from "../ui.js";
import { runRpcInfo } from "../runners/rpc-info-runner.js";
import { runRpcHealth } from "../runners/rpc-health-runner.js";
import { runRpcDag } from "../runners/rpc-dag-runner.js";
import { runRpcUtxos } from "../runners/rpc-utxos-runner.js";
import { runRpcMempool } from "../runners/rpc-mempool-runner.js";

export function registerRpcCommands(program: Command) {
  const rpcCmd = program.command("rpc").description("Kaspa RPC diagnostics and queries");

  rpcCmd.command("info")
    .description("Show RPC connection info")
    .action(async () => { try { await runRpcInfo(); } catch (e) { handleError(e); } });

  rpcCmd.command("health")
    .description("Check RPC health")
    .action(async () => { try { await runRpcHealth({}); } catch (e) { handleError(e); } });

  rpcCmd.command("doctor")
    .description("Run comprehensive RPC diagnostics")
    .option("--endpoints <urls...>", "Specific endpoints to audit")
    .action(async (options: { endpoints?: string[] }) => { 
      const { runRpcDoctor } = await import("../runners/rpc-doctor-runner.js");
      try { await runRpcDoctor(options); } catch (e) { handleError(e); } 
    });

  rpcCmd.command("dag")
    .description("Show DAG information from node")
    .action(async () => { try { await runRpcDag(); } catch (e) { handleError(e); } });

  rpcCmd.command("utxos <address>")
    .description("Show UTXOs for an address from node")
    .action(async (address) => { try { await runRpcUtxos({ address }); } catch (e) { handleError(e); } });

  rpcCmd.command("mempool [txId]")
    .description("Show mempool status from node")
    .action(async (txId) => { try { await runRpcMempool({ txId: txId || "all" }); } catch (e) { handleError(e); } });
}
