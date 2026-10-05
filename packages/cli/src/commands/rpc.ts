import { handleError } from "../ui.js";
import { Command } from "commander";
import { runRpcInfo } from "../runners/rpc-info-runner.js";
import { runRpcHealth } from "../runners/rpc-health-runner.js";
import { runRpcDag } from "../runners/rpc-dag-runner.js";
import { runRpcUtxos } from "../runners/rpc-utxos-runner.js";
import { runRpcMempool } from "../runners/rpc-mempool-runner.js";

import { nodeRpcUrl } from "@hardkas/core";

// CANONICAL-RPC-URL: the help names the endpoint @hardkas/core declares canonical, never a copy.
const URL_OPTION = `Node wRPC endpoint (default: the canonical localnet, ${nodeRpcUrl()})`;

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
        getOutput().writeJson(
          res.info
            ? { ok: true, url: res.url, info: res.info }
            : { ok: false, code: "RPC_INFO_UNAVAILABLE", url: res.url, error: res.error, message: res.error }
        );
      } else {
        getOutput().writeLine(res.formatted);
      }
      if (!res.info) {
        // CLI-RUNTIME-CONTRACT-1: the verdict is typed (was an untyped "Command failed").
        const { HardkasCliError } = await import("../cli-errors.js");
        throw new HardkasCliError("RPC_INFO_UNAVAILABLE", `The node at ${res.url} did not answer: ${res.error ?? "unknown error"}`, { exitCode: 1 });
      }
    });

  rpcCmd
    .command("health")
    .description(`Check that the canonical localnet node (${nodeRpcUrl()}) answers and is ready`)
    .option("--wait", "Wait until healthy")
    .option("--timeout <ms>", "With --wait: how long to wait in ms (default: 60000)")
    .option("--json", "Output as JSON", false)
    .action(async (options: { wait?: boolean; timeout?: string; json: boolean }) => {
      try {
        const { getOutput } = await import("../output.js");
        const res = await runRpcHealth({
          wait: options.wait ?? false,
          timeout: options.timeout ? parseInt(options.timeout, 10) / 1000 : 60
        });
        if (options.json) {
          // CLI-RUNTIME-CONTRACT-1: the verdict carries `ok` (and a code when not ready); the
          // health fields are unchanged.
          getOutput().writeJson(
            res.result.ready ? { ok: true, ...res.result } : { ok: false, code: "RPC_NOT_READY", ...res.result }
          );
        } else {
          getOutput().writeLine(res.formatted);
        }
        if (!res.result.ready) {
          const { HardkasCliError } = await import("../cli-errors.js");
          throw new HardkasCliError("RPC_NOT_READY", `The Kaspa RPC at ${res.result.endpoint ?? "the configured endpoint"} is not ready`, { exitCode: 1 });
        }
      } catch (e) {
        throw e;
      }
    });

  rpcCmd
    .command("doctor")
    .description("Probe RPC endpoints: TCP, wRPC connection, server and DAG info (http:// endpoints without port 18210 are probed as EVM JSON-RPC)")
    .option("--endpoints <urls...>", "Endpoints to probe, separated by spaces (commas are not split)")
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
