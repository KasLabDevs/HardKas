import { Command } from "commander";
import { getOutput } from "../output.js";
import { HardkasCliError, HardkasExitCode } from "../cli-errors.js";

/*
 * R3-D · ADDRESS-HISTORY-1 · `hardkas history <address>`: the history of an address over a bounded window of a Kaspa
 * node's selected chain (@hardkas/query readAddressHistory). A Kaspa node keeps no address history: the window is read
 * from the node's chain answer (getVirtualChainFromBlockV2, accepted transactions at verbosity High), and every result
 * says what it covered — where the window starts and ends, whether it reached the tip or the pruning point — and what it
 * did not. This workspace's own records (submissions, receipts) are merged in. Read-only: nothing is planned, signed or
 * sent. The node is the `rpc` commands' (resolveRpcTarget); mainnet (a name, an alias, the workspace's own, a mainnet
 * address, a node that says it) is refused before anything is read.
 */

interface HistoryOptions {
  since?: string;
  lookback?: string;
  maxBlocks?: string;
  limit?: string;
  cursor?: string;
  timeout?: string;
  network?: string;
  url?: string;
  workspaceRecords?: boolean;
  json?: boolean;
}

const wholeNumber = (raw: string | undefined, flag: string, min: number, max: number): number | undefined => {
  if (raw === undefined) return undefined;
  if (!/^\d{1,9}$/.test(raw.trim()) || Number(raw) < min || Number(raw) > max) {
    throw new HardkasCliError("ADDRESS_HISTORY_USAGE", `${flag} must be a whole number from ${min} to ${max}, got '${raw}'. Nothing was read.`, {
      exitCode: HardkasExitCode.USAGE_ERROR
    });
  }
  return Number(raw);
};

const sompiText = (v: string) => {
  const n = BigInt(v);
  const neg = n < 0n;
  const a = neg ? -n : n;
  const frac = (a % 100_000_000n).toString().padStart(8, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${a / 100_000_000n}${frac ? "." + frac : ""} KAS`;
};

export const HISTORY_SINCE_HELP =
  "Start of the window: a chain block hash (64 hex: the transactions accepted after it) or a DAA score (the transactions accepted at or above it). Default: the last --lookback chain blocks. Never before the node's pruning point";

export function registerHistoryCommand(program: Command) {
  program
    .command("history <address>")
    .description(
      "The history of an address over a bounded window of a Kaspa node's selected chain: every transaction accepted in it that pays the address or spends an output of it, with its depth; this workspace's own records merged in. The result says what the window covered and what it did not. Read-only; mainnet is refused"
    )
    .option("--since <blockOrDaa>", HISTORY_SINCE_HELP)
    .option("--lookback <chainBlocks>", "Default window: chain blocks back from the node's sink (default 1000, at most 100000)")
    .option("--max-blocks <n>", "Chain blocks this call may walk back to the start, and read forward from it (default 10000 each, at most 200000); the rest is the result's continueFrom")
    .option("--limit <n>", "Entries per page (default 100, at most 1000)")
    .option("--cursor <cursor>", "The next page of the same window (page.nextCursor of a previous result)")
    .option("--timeout <seconds>", "Deadline for the whole read (default 60, at most 600): a window cut short by it says so")
    .option("--network <name>", "Network from the workspace config: its declared endpoint, and the node must prove it serves that network (default: the workspace's network; outside a workspace, the --url or the canonical localnet)")
    .option("--url <url>", "Node wRPC (JSON) endpoint")
    .option("--no-workspace-records", "Do not merge this workspace's own records (submissions, receipts) into the history")
    .option("--json", "Output as JSON", false)
    .action(async (address: string, options: HistoryOptions) => {
      await runHistory(address, options);
    });
}

export async function runHistory(address: string, options: HistoryOptions): Promise<unknown> {
  const { refuseMainnetConnection, workspaceConfigForGuard } = await import("../mainnet-guard.js");
  const { invocationWorkspaceRoot } = await import("../workspace-root.js");
  // a workspace whose config cannot be read is refused before anything is contacted: its network (mainnet, perhaps) is
  // unknown, and the endpoint must never fall back to the canonical localnet in its place
  {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const root = invocationWorkspaceRoot();
    // the same file names the workspace-root walk and loadHardkasConfig use (one list, in @hardkas/config)
    const { HARDKAS_CONFIG_FILENAMES } = await import("@hardkas/config");
    const present = HARDKAS_CONFIG_FILENAMES.some((f) => fs.existsSync(path.join(root, f)));
    if (present) {
      try {
        const { loadHardkasConfig } = await import("@hardkas/config");
        await loadHardkasConfig({ workspaceRoot: root });
      } catch (e: any) {
        if (/^MAINNET_/.test(String(e?.code ?? ""))) throw e;
        throw new HardkasCliError("HARDKAS_CONFIG_ERROR", `hardkas history: the workspace config at ${root} cannot be read (${String(e?.message ?? e).slice(0, 300)}). Nothing was contacted.`, {
          exitCode: HardkasExitCode.USAGE_ERROR
        });
      }
    }
  }
  const config = await workspaceConfigForGuard();
  // MAINNET TOTAL LOCKDOWN: a mainnet network (any spelling, an alias, the workspace's own) or a mainnet address, first
  refuseMainnetConnection(config, [options.network], "hardkas history", options.network === undefined && options.url === undefined);
  if (/^kaspa:/i.test(String(address).trim())) refuseMainnetConnection(config, ["mainnet"], `hardkas history: ${address} is a mainnet address; nothing was contacted`);

  const lookback = wholeNumber(options.lookback, "--lookback", 1, 100_000);
  const maxChainBlocks = wholeNumber(options.maxBlocks, "--max-blocks", 1, 200_000);
  const limit = wholeNumber(options.limit, "--limit", 1, 1_000);
  let timeoutMs: number | undefined;
  if (options.timeout !== undefined) {
    const s = /^\s*(\d+(?:\.\d+)?)\s*$/.exec(options.timeout);
    const n = s ? Number(s[1]) : NaN;
    if (!(n > 0 && n <= 600)) {
      throw new HardkasCliError("ADDRESS_HISTORY_USAGE", `--timeout must be a number of seconds above 0 and at most 600, got '${options.timeout}'. Nothing was read.`, {
        exitCode: HardkasExitCode.USAGE_ERROR
      });
    }
    timeoutMs = Math.ceil(n * 1000);
  }

  const { resolveRpcTarget } = await import("../runners/rpc-target.js");
  const target = await resolveRpcTarget({ url: options.url, network: options.network });
  // the network the history reads as: the one the node must prove; for a raw endpoint, the one the address names
  const core = await import("@hardkas/core");
  const hint = core.addressPrefixNetworkHint(String(address).trim());
  const networkId = target.expectedNetworkId ?? (hint === "simnet" || hint === "devnet" ? hint : undefined);
  if (!networkId) {
    throw new HardkasCliError(
      "ADDRESS_HISTORY_USAGE",
      `Which network ${address} is read on is not known from the address alone${hint === "testnet" ? " (every testnet uses kaspatest:)" : ""}: pass --network <name> (e.g. testnet-10, declared in the workspace). Nothing was read.`,
      { exitCode: HardkasExitCode.USAGE_ERROR }
    );
  }
  refuseMainnetConnection(config, [networkId], "hardkas history");

  const { JsonWrpcKaspaClient } = await import("@hardkas/kaspa-rpc");
  const { readAddressHistory } = await import("@hardkas/sdk");
  const client = new JsonWrpcKaspaClient({
    rpcUrl: target.url,
    ...(target.expectedNetworkId ? { expectedNetworkId: target.expectedNetworkId } : {}),
    timeoutMs: Math.min(timeoutMs ?? 60_000, 30_000)
  });
  let result: Awaited<ReturnType<typeof readAddressHistory>>;
  try {
    result = await readAddressHistory(client, {
      address: String(address).trim(),
      networkId,
      ...(options.since !== undefined ? { since: options.since } : {}),
      ...(lookback !== undefined ? { lookback } : {}),
      ...(maxChainBlocks !== undefined ? { maxChainBlocks } : {}),
      ...(limit !== undefined ? { limit } : {}),
      ...(options.cursor !== undefined ? { cursor: options.cursor } : {}),
      ...(timeoutMs !== undefined ? { timeoutMs } : {}),
      ...(options.workspaceRecords !== false ? { workspaceRoot: invocationWorkspaceRoot() } : {})
    });
  } catch (e: any) {
    if (e instanceof HardkasCliError) throw e;
    const code = String(e?.code ?? "ADDRESS_HISTORY_READ_FAILED");
    const usage = /^(ADDRESS_HISTORY_(USAGE|NETWORK_MISMATCH|SINCE_UNAVAILABLE|REQUIRES_NODE)|NETWORK_ENDPOINT_(REQUIRED|INVALID))$/.test(code);
    throw new HardkasCliError(code, String(e?.message ?? e).replace(new RegExp(`^${code}:\\s*`), ""), {
      exitCode: /^MAINNET_/.test(code) ? HardkasExitCode.POLICY_DENIED : usage || code.endsWith("_MISMATCH") ? HardkasExitCode.USAGE_ERROR : HardkasExitCode.RUNTIME_FAILURE
    });
  } finally {
    await client.close().catch(() => {});
  }

  const out = getOutput();
  if (options.json || out.mode === "json") {
    out.writeJson({ ok: true, command: "history", mode: "cli", ...result });
    return result;
  }
  const w = result.coverage.window;
  const lines: string[] = [];
  lines.push(`History of ${result.address} on ${result.networkId}`);
  lines.push(
    `Window:  the chain blocks after ${w.from.hash} (DAA score ${w.from.daaScore}${w.startsAtPruningPoint ? `, the node's pruning point${w.pruningPoint.isGenesis ? " = its genesis: its whole history" : ""}` : ""})` +
      (w.to ? ` up to ${w.to.hash} (DAA score ${w.to.daaScore})` : "") +
      `: ${w.chainBlocks} chain block(s), ${w.reachedTip ? "reached the node's tip" : `stopped (${w.stoppedBy}); continue with --since ${w.continueFrom}`}`
  );
  lines.push(`Depths:  from the node's tip at DAA score ${result.coverage.point.virtualDaaScore}, sink blue score ${result.coverage.point.sinkBlueScore}`);
  lines.push(`Entries: ${result.entries.length} of ${result.total}${result.page.offset > 0 ? ` (from #${result.page.offset + 1})` : ""}`);
  for (const e of result.entries) {
    const net = e.netSompi !== undefined ? sompiText(e.netSompi) : `+${sompiText(e.receivedSompi)}, spent unknown`;
    const where = e.acceptance
      ? `DAA ${e.acceptance.daaScore} · ${e.acceptance.confirmationsBlue} blue / ${e.acceptance.confirmationsDaa} DAA confirmations`
      : `not located on the chain`;
    const tags = [e.coinbase ? "coinbase" : "", e.covenantBound ? `covenant ${[...e.outputs, ...e.spends].find((x) => x.covenantId)?.covenantId ?? ""}`.trim() : "", e.source !== "node" ? e.source : ""]
      .filter(Boolean)
      .join(", ");
    lines.push(`  ${e.txId}  ${e.direction.padEnd(4)} ${net.padStart(18)}  ${where}${tags ? `  [${tags}]` : ""}`);
    if (e.outsideWindow) lines.push(`      outside the window: ${e.outsideWindow}`);
  }
  if (result.coverage.notCovered.length > 0) {
    lines.push("Not covered:");
    for (const n of result.coverage.notCovered) lines.push(`  - ${n}`);
  }
  if (result.page.nextCursor) lines.push(`Next page: hardkas history ${result.address} --cursor ${result.page.nextCursor}`);
  out.writeLine(lines.join("\n"));
  return result;
}
