import { handleError } from "../ui.js";
import { Command } from "commander";
import { runRpcInfo } from "../runners/rpc-info-runner.js";
import { runRpcHealth } from "../runners/rpc-health-runner.js";
import { runRpcDag } from "../runners/rpc-dag-runner.js";
import { runRpcUtxos } from "../runners/rpc-utxos-runner.js";
import { runRpcMempool } from "../runners/rpc-mempool-runner.js";

import { nodeRpcUrl } from "@hardkas/core";
import { resolveRpcTarget, RPC_NETWORK_OPTION } from "../runners/rpc-target.js";

// CANONICAL-RPC-URL: the help names the endpoint @hardkas/core declares canonical, never a copy.
const URL_OPTION = `Node wRPC endpoint (default: the canonical localnet, ${nodeRpcUrl()})`;

export function registerRpcCommands(program: Command) {
  const rpcCmd = program.command("rpc").description("Kaspa RPC diagnostics and queries");

  rpcCmd
    .command("info")
    .description("Show the node's network, version, sync state and UTXO index")
    .option("--url <url>", URL_OPTION)
    .option("--network <name>", RPC_NETWORK_OPTION)
    .option("--json", "Output as JSON", false)
    .action(async (options: { url?: string; network?: string; json: boolean }) => {
      const { getOutput } = await import("../output.js");
      const res = await runRpcInfo(await resolveRpcTarget(options));
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
    .description(`Check that a Kaspa node answers and is ready (default: the canonical localnet, ${nodeRpcUrl()}; --url or --network for another)`)
    .option("--url <url>", URL_OPTION)
    .option("--network <name>", RPC_NETWORK_OPTION)
    .option("--wait", "Wait until healthy")
    .option("--timeout <ms>", "With --wait: how long to wait in ms (default: 60000)")
    .option("--json", "Output as JSON", false)
    .action(async (options: { url?: string; network?: string; wait?: boolean; timeout?: string; json: boolean }) => {
      try {
        const { getOutput } = await import("../output.js");
        const res = await runRpcHealth({
          ...(await resolveRpcTarget(options)),
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
    .command("compare")
    .description(
      "Read several nodes side by side, read-only: identity, lag, the UTXOs of addresses, one look at a transaction. Differences the nodes' lag accounts for are lag, others disagreements (exit 1). Nothing is sent; agreement among nodes is not consensus validation"
    )
    .requiredOption("--endpoints <urls...>", "Node wRPC endpoints to read, separated by spaces (two or more)")
    .requiredOption("--network <id>", "The network every node must say it serves (e.g. simnet, testnet-10); a node serving another is not read")
    .option("--address <addresses...>", "Compare the UTXOs of these addresses")
    .option("--tx <txId>", "Look at this transaction on every node")
    .option("--since <hash>", "With --tx: a chain block every node holds to look from (default: each node's pruning point)")
    .option("--lag-threshold <daa>", "DAA score behind the most advanced synced node beyond which a node is lagging (default: 100)")
    .option("--json", "Output as JSON", false)
    .action(
      async (options: { endpoints: string[]; network: string; address?: string[]; tx?: string; since?: string; lagThreshold?: string; json: boolean }) => {
        const { getOutput } = await import("../output.js");
        const { HardkasCliError, HardkasExitCode } = await import("../cli-errors.js");
        if (options.lagThreshold !== undefined && !/^\d+$/.test(options.lagThreshold)) {
          throw new HardkasCliError("MULTINODE_LAG_THRESHOLD_INVALID", `--lag-threshold '${options.lagThreshold}' is not a DAA score difference. Nothing was contacted.`, {
            exitCode: HardkasExitCode.USAGE_ERROR
          });
        }
        const { runRpcCompare, formatRpcCompare } = await import("../runners/rpc-compare-runner.js");
        const r = await runRpcCompare({
          endpoints: options.endpoints,
          network: options.network,
          ...(options.address ? { addresses: options.address } : {}),
          ...(options.tx ? { txId: options.tx } : {}),
          ...(options.since ? { since: options.since } : {}),
          ...(options.lagThreshold !== undefined ? { lagThresholdDaa: BigInt(options.lagThreshold) } : {})
        });
        const code = r.errors.length > 0 ? r.errors[0]!.code : r.disagreements > 0 ? "MULTINODE_DISAGREEMENT" : undefined;
        if (options.json) {
          getOutput().writeJson({
            ok: code === undefined,
            ...(code ? { code } : {}),
            scope: r.set.scope,
            guarantee: r.set.guarantee,
            network: r.set.expectedNetwork,
            lagThresholdDaa: r.set.lagThresholdDaa,
            nodes: r.set.nodes,
            ...(r.set.reference ? { reference: r.set.reference } : {}),
            ...(r.utxos ? { utxos: r.utxos } : {}),
            ...(r.tx ? { tx: r.tx } : {}),
            ...(r.errors.length > 0 ? { errors: r.errors } : {})
          });
        } else {
          getOutput().writeLine(formatRpcCompare(r));
        }
        if (code) {
          // the report above is the outcome; the exit code says it found something to look at (or could not compare)
          throw new HardkasCliError(
            code,
            code === "MULTINODE_DISAGREEMENT" ? `${r.disagreements} disagreement(s) among the nodes (see the report). Nothing was sent.` : `${r.errors.map((e) => `${e.section}: ${e.message}`).join("; ")}`,
            { exitCode: 1 }
          );
        }
      }
    );

  rpcCmd
    .command("dag")
    .description("Show the node's DAG: network, virtual DAA score, sink and tips")
    .option("--url <url>", URL_OPTION)
    .option("--network <name>", RPC_NETWORK_OPTION)
    .option("--json", "Output as JSON", false)
    .action(async (options: { url?: string; network?: string; json: boolean }) => {
      const { getOutput } = await import("../output.js");
      const res = await runRpcDag(await resolveRpcTarget(options));
      if (options.json) {
        getOutput().writeJson({ ok: true, url: res.url, dag: res.dag });
      } else {
        getOutput().writeLine(res.formatted);
      }
    });

  rpcCmd
    .command("utxos <address>")
    .description("Show the UTXOs the node holds for an address")
    .option("--url <url>", URL_OPTION)
    .option("--network <name>", RPC_NETWORK_OPTION)
    .option("--json", "Output as JSON", false)
    .action(async (address: string, options: { url?: string; network?: string; json: boolean }) => {
      const { getOutput } = await import("../output.js");
      const res = await runRpcUtxos({ address, ...(await resolveRpcTarget(options)) });
      if (options.json) {
        getOutput().writeJson({
          ok: true,
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
    .option("--network <name>", RPC_NETWORK_OPTION)
    .option("--json", "Output as JSON", false)
    .action(async (txId: string | undefined, options: { url?: string; network?: string; json: boolean }) => {
      const { getOutput } = await import("../output.js");
      const res = await runRpcMempool({ txId, ...(await resolveRpcTarget(options)) });
      if (options.json) {
        getOutput().writeJson(
          res.txId !== undefined ? { ok: true, url: res.url, txId: res.txId, entry: res.entry } : { ok: true, url: res.url, entries: res.entries }
        );
      } else {
        getOutput().writeLine(res.formatted);
      }
    });
}
