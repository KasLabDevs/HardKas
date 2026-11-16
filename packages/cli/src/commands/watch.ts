import { Command } from "commander";
import { redactUrlCredentialsInText } from "@hardkas/core";
import { getOutput } from "../output.js";
import { UI } from "../ui.js";
import { HardkasCliError, HardkasExitCode } from "../cli-errors.js";

/*
 * WATCH-CLI-1 · `hardkas watch <address>`: the toolkit's UTXO watch (watchAddress: kaspa-wasm's UtxoProcessor +
 * UtxoContext, the engine WalletToolkit.watch() uses) for any address, from the CLI. One line per event — outputs added,
 * removed or matured; a `resync` (the whole difference) after every reconnect; connection notices; errors — readable, or
 * JSON lines with --json. A covenant's output is labelled (covenantBound, covenantId). Read-only: nothing is planned,
 * signed or sent. The node is the `rpc` commands' (resolveRpcTarget: --network's declared endpoint and identity, or
 * --url), every reconnection identified again; mainnet (a name, an alias that declares it, a mainnet address, a node that
 * says it) is refused before anything is tracked.
 */

interface WatchOptions {
  network?: string;
  url?: string;
  timeout?: string;
  until?: string;
  json?: boolean;
}

/** An output as a watch line shows it: its outpoint and amount, its state, and its covenant when it has one. */
interface WatchOutput {
  transactionId: string;
  index: number;
  amountSompi: string;
  state?: string;
  covenantBound: boolean;
  covenantId?: string;
}

const positive = (raw: string | undefined, flag: string, max: number): number | undefined => {
  if (raw === undefined) return undefined;
  if (!/^\d{1,7}$/.test(raw) || Number(raw) < 1 || Number(raw) > max) {
    throw new HardkasCliError("WATCH_OPTION_INVALID", `${flag} must be an integer in [1, ${max}], got '${raw}'. Nothing was watched.`, { exitCode: HardkasExitCode.USAGE_ERROR });
  }
  return Number(raw);
};

const sompiText = (v: string | bigint) => {
  const n = BigInt(v);
  const frac = (n % 100_000_000n).toString().padStart(8, "0").replace(/0+$/, "");
  return `${n / 100_000_000n}${frac ? "." + frac : ""} KAS`;
};

export function registerWatchCommand(program: Command) {
  program
    .command("watch <address>")
    .description(
      "Watch an address's UTXOs on a Kaspa node: one line per event (outputs added, removed, matured; a resync after every reconnect; errors), covenant outputs labelled. Read-only; mainnet is refused"
    )
    .option("--network <name>", "Network from the workspace config: its declared endpoint, and the node must prove it serves that network (default: the workspace's network; outside a workspace, the --url or the canonical localnet)")
    .option("--url <url>", "Node wRPC (JSON) endpoint")
    .option("--timeout <seconds>", "Stop after this many seconds (default: until interrupted)")
    .option("--until <n>", "Stop after n events (added, removed, matured or resync)")
    .option("--json", "JSON lines: one compact JSON document per event (snapshot first, end last)", false)
    .action(async (address: string, options: WatchOptions) => {
      if (options.json) UI.setJsonMode(true);
      await runWatch(address, options);
    });
}

async function runWatch(address: string, options: WatchOptions): Promise<void> {
  const { refuseMainnetConnection, workspaceConfigForGuard } = await import("../mainnet-guard.js");
  const config = await workspaceConfigForGuard();
  // MAINNET TOTAL LOCKDOWN: a mainnet network (any spelling, an alias, the workspace's own) or a mainnet address, first
  refuseMainnetConnection(config, [options.network], "hardkas watch", options.network === undefined && options.url === undefined);
  if (/^kaspa:/i.test(String(address).trim())) refuseMainnetConnection(config, ["mainnet"], `hardkas watch: ${address} is a mainnet address; nothing was contacted`);
  const timeoutSeconds = positive(options.timeout, "--timeout", 31_536_000);
  const until = positive(options.until, "--until", 1_000_000);
  const { resolveRpcTarget } = await import("../runners/rpc-target.js");
  const target = await resolveRpcTarget({ url: options.url, network: options.network });
  const { watchAddress } = await import("@hardkas/sdk");

  const out = getOutput();
  const line = (event: Record<string, unknown>) => {
    const doc = { at: new Date().toISOString(), ...event };
    if (options.json) {
      process.stdout.write(redactUrlCredentialsInText(JSON.stringify(doc, (_k, v) => (typeof v === "bigint" ? v.toString() : v))) + "\n");
      out.jsonWritten = true;
    } else {
      out.writeLine(human(doc));
    }
  };

  // the outputs the watch has shown, so a removed output keeps its covenant label
  let known = new Map<string, WatchOutput>();
  const keyOf = (o: { transactionId: string; index: number }) => `${o.transactionId}:${o.index}`;
  const view = (u: any): WatchOutput => ({
    transactionId: String(u.transactionId),
    index: Number(u.index),
    amountSompi: String(u.amountSompi),
    ...(u.state ? { state: String(u.state) } : {}),
    covenantBound: typeof u.covenantId === "string" && u.covenantId !== "",
    ...(typeof u.covenantId === "string" && u.covenantId !== "" ? { covenantId: u.covenantId } : {})
  });

  let handle: Awaited<ReturnType<typeof watchAddress>> | undefined;
  let events = 0;
  let finish: (r: { reason: string; error?: HardkasCliError }) => void = () => {};
  const finished = new Promise<{ reason: string; error?: HardkasCliError }>((resolve) => (finish = resolve));
  const current = () => new Map((handle?.utxos() ?? []).map((u) => [keyOf(u), view(u)]));
  const label = (o: { transactionId: string; index: number; amountSompi: bigint | string }, from: Map<string, WatchOutput>): WatchOutput =>
    from.get(keyOf(o)) ?? { transactionId: o.transactionId, index: o.index, amountSompi: String(o.amountSompi), covenantBound: false };
  const counted = () => {
    events += 1;
    if (until !== undefined && events >= until) finish({ reason: "until" });
  };

  try {
    handle = await watchAddress(
      target.url,
      address,
      (event: any) => {
        const before = known;
        const now = current();
        if (event.type === "transaction") {
          const added = event.details.added.map((o: any) => label(o, now));
          const removed = event.details.removed.map((o: any) => label(o, before));
          if (added.length > 0) line({ event: "added", txid: event.txid, outputs: added });
          if (removed.length > 0) line({ event: "removed", txid: event.txid, outputs: removed });
        } else if (event.type === "maturity") {
          line({ event: "matured", txid: event.txid, outputs: event.details.matured.map((o: any) => label(o, now)) });
        } else if (event.type === "resync") {
          line({ event: "resync", reason: event.reason, added: event.added.map((o: any) => label(o, now)), removed: event.removed.map((o: any) => label(o, before)) });
        } else {
          return;
        }
        known = now;
        counted();
      },
      {
        ...(target.expectedNetworkId ? { expectedNetworkId: target.expectedNetworkId } : {}),
        reportMaturity: true,
        onConnection: (state) => line({ event: state }),
        onError: (error: any) => {
          const code = String(error?.code ?? "WALLET_WATCH_ERROR");
          const fatal = code === "WALLET_WATCH_NODE_NETWORK_CHANGED" || /^MAINNET_/.test(code);
          line({ event: "error", code, message: String(error?.message ?? error), fatal });
          if (fatal) finish({ reason: "error", error: new HardkasCliError(code, String(error?.message ?? error), { exitCode: HardkasExitCode.RUNTIME_FAILURE }) });
        }
      }
    );
  } catch (e: any) {
    // nothing was tracked: the typed refusal (mainnet node, network or address mismatch, node unreachable) as it is
    if (e instanceof HardkasCliError) throw e;
    const code = String(e?.code ?? "WALLET_WATCH_FAILED");
    throw new HardkasCliError(code, String(e?.message ?? e).replace(new RegExp(`^${code}:\\s*`), ""), {
      exitCode: /^MAINNET_/.test(code) ? HardkasExitCode.POLICY_DENIED : code.endsWith("_MISMATCH") ? HardkasExitCode.USAGE_ERROR : HardkasExitCode.RUNTIME_FAILURE
    });
  }

  known = current();
  const balance = handle.balance();
  line({ event: "snapshot", address, network: handle.networkId, utxos: [...known.values()], balance: { mature: String(balance.mature), pending: String(balance.pending), stasisCount: balance.stasisCount } });
  const timer = timeoutSeconds !== undefined ? setTimeout(() => finish({ reason: "timeout" }), timeoutSeconds * 1000) : undefined;
  const onSignal = () => finish({ reason: "interrupted" });
  process.once("SIGINT", onSignal);
  if (until !== undefined && events >= until) finish({ reason: "until" });
  const result = await finished;
  if (timer) clearTimeout(timer);
  process.removeListener("SIGINT", onSignal);
  await handle.stop().catch(() => {});
  line({ event: "end", reason: result.reason, events });
  if (result.error) throw result.error;
}

function human(doc: Record<string, any>): string {
  const out = (o: WatchOutput) =>
    `${o.transactionId}:${o.index} ${sompiText(o.amountSompi)}${o.state ? ` (${o.state})` : ""}${o.covenantBound ? ` [covenant ${o.covenantId}]` : ""}`;
  switch (doc.event) {
    case "snapshot":
      return [`watching ${doc.address} on ${doc.network}: ${doc.utxos.length} output(s), mature ${sompiText(doc.balance.mature)}, pending ${sompiText(doc.balance.pending)}`, ...doc.utxos.map((o: WatchOutput) => `  = ${out(o)}`)].join("\n");
    case "added":
      return doc.outputs.map((o: WatchOutput) => `+ ${out(o)} (tx ${doc.txid})`).join("\n");
    case "removed":
      return doc.outputs.map((o: WatchOutput) => `- ${out(o)}`).join("\n");
    case "matured":
      return doc.outputs.map((o: WatchOutput) => `* matured ${out(o)}`).join("\n");
    case "resync":
      return [`~ resync after reconnect: ${doc.added.length} added, ${doc.removed.length} removed`, ...doc.added.map((o: WatchOutput) => `  + ${out(o)}`), ...doc.removed.map((o: WatchOutput) => `  - ${out(o)}`)].join("\n");
    case "disconnected":
      return "! disconnected from the node (the watch resyncs when it reconnects)";
    case "reconnected":
      return "! reconnected (resyncing)";
    case "error":
      return `! error ${doc.code}${doc.fatal ? " (fatal)" : ""}: ${doc.message}`;
    case "end":
      return `watch ended (${doc.reason}) after ${doc.events} event(s)`;
    default:
      return JSON.stringify(doc);
  }
}
