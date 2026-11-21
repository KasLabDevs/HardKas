import { declaredNetworkIdOf } from "@hardkas/core";
import { HardkasCliError, HardkasExitCode } from "./cli-errors.js";
import { getOutput } from "./output.js";

/*
 * Wave 2(e) · AUX-11 — the confirmation every CLI broadcast needs, `tx send`'s rule shared by every command that sends a
 * transaction (BETA-FIX W2: `tx batch`, `wallet hd send`, `escrow fund | release | rescue-v1 broadcast`, `kcc20 deploy |
 * transfer`, the Silver on-chain commands, `accounts consolidate --execute`): without `--yes` on a network other than the
 * simulator or a local simnet nothing is planned, signed, broadcast or written, and the result is an explicit refusal
 * (exit 3 = POLICY_DENIED, code TX_SEND_CONFIRMATION_REQUIRED, `outcome: "not_executed"` in JSON) — never a dry run that
 * reads as success. Mainnet is refused before this, by each command's own lockdown guard (MAINNET_*), whatever --yes says.
 */

/** The code of a broadcast refused for want of `--yes` (every command's, `tx send`'s since AUX-11). */
export const TX_SEND_CONFIRMATION_REQUIRED = "TX_SEND_CONFIRMATION_REQUIRED";

/** The networks a broadcast needs no `--yes` on: the simulator and a local simnet (`tx send`'s rule). */
export function broadcastConfirmationExempt(network: string | undefined): boolean {
  return network === "simulated" || network === "simnet";
}

/** The `--yes` help of a broadcasting command: what is refused without it. */
export function broadcastYesHelp(what: string): string {
  return `Confirm the broadcast. Required unless the network is simulated or simnet: without it ${what} is refused (NOT EXECUTED, exit 3, TX_SEND_CONFIRMATION_REQUIRED) and nothing is sent or written`;
}

/** The invocation as typed, with `--yes` added: the command that confirms it. */
export function retryWithYes(argv: readonly string[] = process.argv.slice(2)): string {
  const quoted = argv.map((a) => (/^[\w@%+=:,./\\-]+$/.test(a) ? a : JSON.stringify(a)));
  return ["hardkas", ...quoted, "--yes"].join(" ");
}

export interface BroadcastConfirmationRefusal {
  /** The command as the user names it ("tx send", "escrow fund", …). */
  readonly command: string;
  /** The network the broadcast would go to (as the command resolved it). */
  readonly network: string;
  readonly json?: boolean | undefined;
  /** The command that confirms it (default: this invocation with --yes). */
  readonly retry?: string | undefined;
  /** What was not done (default: "Nothing was planned, signed, broadcast or written."). */
  readonly nothingDone?: string | undefined;
}

/** The AUX-11 refusal: one JSON envelope in JSON mode, then TX_SEND_CONFIRMATION_REQUIRED (exit 3). */
export function declineUnconfirmedBroadcast(args: BroadcastConfirmationRefusal): never {
  const retry = args.retry ?? retryWithYes();
  const message =
    `NOT EXECUTED: '${args.command}' on ${args.network} requires explicit confirmation. ` +
    `${args.nothingDone ?? "Nothing was planned, signed, broadcast or written."} To execute, re-run with --yes.`;
  if (args.json) {
    getOutput().writeJson({
      ok: false,
      command: args.command,
      mode: "cli",
      outcome: "not_executed",
      code: TX_SEND_CONFIRMATION_REQUIRED,
      network: args.network,
      message,
      nextSteps: [retry]
    });
  }
  throw new HardkasCliError(TX_SEND_CONFIRMATION_REQUIRED, message, {
    exitCode: HardkasExitCode.POLICY_DENIED,
    suggestion: retry,
    context: { network: args.network }
  });
}

/**
 * Refuses the broadcast (declineUnconfirmedBroadcast) unless `yes` is given or the network is exempt. With `config`, a
 * network name that is a config entry counts as the network it declares (an alias of simnet is simnet).
 */
export function requireBroadcastConfirmation(
  args: BroadcastConfirmationRefusal & { readonly yes: boolean | undefined; readonly config?: Record<string, any> | undefined }
): void {
  const network = args.config !== undefined ? (declaredNetworkIdOf(args.config as any, args.network) ?? args.network) : args.network;
  if (args.yes === true || broadcastConfirmationExempt(network)) return;
  declineUnconfirmedBroadcast({ ...args, network });
}
