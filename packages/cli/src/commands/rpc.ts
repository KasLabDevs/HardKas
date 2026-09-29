import { handleError } from "../ui.js";
import { Command } from "commander";
import { runRpcInfo } from "../runners/rpc-info-runner.js";
import { runRpcHealth } from "../runners/rpc-health-runner.js";
import { runRpcDag } from "../runners/rpc-dag-runner.js";
import { runRpcUtxos } from "../runners/rpc-utxos-runner.js";
import { runRpcMempool } from "../runners/rpc-mempool-runner.js";

const URL_OPTION = "Node wRPC endpoint (default: the canonical localnet, ws://127.0.0.1:18210)";

export function registerRpcCommands(program: Command) {
  const rpcCmd = program.command("rpc").description("Kaspa RPC diagnostics and queries");

  rpcCmd
    .command("info")
    .description("Show the node's network, version, sync state and UTXO index")
    .option("--url <url>", URL_OPTION)
    .option("--json", "Output as JSON", false)
    .action(async (options: { url?: string; json: boolean }) => {
      const { getOutput } = await import("../output.js");
      const res = await runRpcInfo({ url: options.url });
      if (options.json) {
        getOutput().writeJson(res.info ? { ok: true, url: res.url, info: res.info } : { ok: false, url: res.url, error: res.error });
      } else {
        getOutput().writeLine(res.formatted);
      }
      if (!res.info) {
        throw new Error("Command failed");
      }
    });

  rpcCmd
    .command("health")
    .description("Check RPC health")
    .option("--wait", "Wait until healthy")
    .option("--timeout <ms>", "Timeout in ms")
    .option("--json", "Output as JSON", false)
    .action(async (options: { wait?: boolean; timeout?: string; json: boolean }) => {
      try {
        const { getOutput } = await import("../output.js");
        const res = await runRpcHealth({
          wait: options.wait ?? false,
          timeout: options.timeout ? parseInt(options.timeout, 10) / 1000 : 60
        });
        if (options.json) {
          getOutput().writeJson(res.result);
        } else {
          getOutput().writeLine(res.formatted);
        }
        if (!res.result.ready) {
          throw new Error("Command failed");
        }
      } catch (e) {
        throw e;
      }
    });

  rpcCmd
    .command("doctor")
    .description("Run comprehensive RPC diagnostics")
    .option("--endpoints <urls...>", "Specific endpoints to audit")
    .action(async (options: { endpoints?: string[] }) => {
      const { runRpcDoctor } = await import("../runners/rpc-doctor-runner.js");
      try {
        await runRpcDoctor(options);
      } catch (e) {
        handleError(e);
      }
    });

  rpcCmd
    .command("dag")
    .description("Show the node's DAG: network, virtual DAA score, sink and tips")
    .option("--url <url>", URL_OPTION)
    .option("--json", "Output as JSON", false)
    .action(async (options: { url?: string; json: boolean }) => {
      const { getOutput } = await import("../output.js");
      const res = await runRpcDag({ url: options.url });
      if (options.json) {
        getOutput().writeJson({ url: res.url, dag: res.dag });
      } else {
        getOutput().writeLine(res.formatted);
      }
    });

  rpcCmd
    .command("utxos <address>")
    .description("Show the UTXOs the node holds for an address")
    .option("--url <url>", URL_OPTION)
    .option("--json", "Output as JSON", false)
    .action(async (address: string, options: { url?: string; json: boolean }) => {
      const { getOutput } = await import("../output.js");
      const res = await runRpcUtxos({ address, url: options.url });
      if (options.json) {
        getOutput().writeJson({
          url: res.url,
          address: res.address,
          totalSompi: res.totalSompi,
          utxos: res.utxos.map((u) => ({
            outpoint: u.outpoint,
            address: u.address,
            amountSompi: u.amountSompi,
            scriptPublicKey: u.scriptPublicKey,
            blockDaaScore: u.blockDaaScore,
            isCoinbase: u.isCoinbase,
            ...(u.covenantId ? { covenantId: u.covenantId } : {})
          }))
        });
      } else {
        getOutput().writeLine(res.formatted);
      }
    });

  rpcCmd
    .command("mempool [txId]")
    .description("Look up a transaction in the node's mempool, or list what the mempool holds")
    .option("--url <url>", URL_OPTION)
    .option("--json", "Output as JSON", false)
    .action(async (txId: string | undefined, options: { url?: string; json: boolean }) => {
      const { getOutput } = await import("../output.js");
      const res = await runRpcMempool({ txId, url: options.url });
      if (options.json) {
        getOutput().writeJson(
          res.txId !== undefined ? { url: res.url, txId: res.txId, entry: res.entry } : { url: res.url, entries: res.entries }
        );
      } else {
        getOutput().writeLine(res.formatted);
      }
    });
}
