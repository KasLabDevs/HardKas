// Demo-cut step 2 · Wave 2(f) / T-A14b — `hardkas tx wait` on the Q4 model.
//
// The previous runner declared "Settlement Proof: PASS / Status: CONFIRMED" as soon
// as a txId left the mempool (and, without --address, simply assumed it). It now
// polls the configured observer through `sdk.tx.observe` (one sealed observation per
// look) and stops when the DERIVED state reaches the requested target:
//   accepted  → ACCEPTED, CONFIRMED or FINALIZED (observed acceptance by a chain block)
//   confirmed → `isConfirmed(derived)`: blue-score depth ≥ the policy, or FINALIZED
// A rejected submission or conflicting observations end the wait as a failure; the
// timeout ends it as a failure that names the last derived state. Nothing is assumed.
//
// Demo-ready · post-confirmation view: once the derived state reaches the target, the wait
// continues — inside the same --timeout — until the same node's UTXO view reflects the
// transaction: an output of it is listed for every address the plan pays, and the inputs it
// spent are no longer listed for the sender. The node's UTXO index can trail acceptance by
// seconds, so balances read right after CONFIRMED could otherwise be stale. This is a view
// condition, not a transaction state: the derived state stays what the observations say.

import { isConfirmed, type DerivedTxStatus } from "@hardkas/artifacts";
import { SYNTHETIC_TXID, openSdkForTx, stateHeadline } from "./tx-status-runner.js";

export type TxWaitTarget = "accepted" | "confirmed";

export interface TxWaitUtxoView {
  /** False when the workspace holds no verifiable plan for the txId (nothing to compare with). */
  checked: boolean;
  converged: boolean;
  reason?: string;
  /** Addresses the plan pays (recipients and change) whose view must list an output of the tx. */
  addresses: string[];
  missingOutputsFor: string[];
  /** Outpoints (`txId:index`) the tx spends that the sender's view still listed at the last look. */
  inputsStillListed: string[];
  looks: number;
}

export interface TxWaitRunnerInput {
  txId: string;
  until: TxWaitTarget;
  timeoutMs: number;
  intervalMs: number;
  network?: string;
  workspaceRoot?: string;
  /** Test injection: an opened SDK whose RPC is scripted. */
  sdk?: any;
  /** Called once per change of the derived headline. */
  onUpdate?: (line: string, derived: DerivedTxStatus) => void;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export interface TxWaitRunnerResult {
  txId: string;
  network: string;
  outcome: "reached" | "synthetic";
  until: TxWaitTarget;
  derived: DerivedTxStatus;
  looks: number;
  elapsedMs: number;
  /** The observation persisted by the last look (absent for a simulator txId). */
  lastObservationArtifactId?: string;
  /** The node's UTXO view after the target was reached (absent for a simulator txId). */
  utxoView?: TxWaitUtxoView;
}

const outpointKey = (o: { transactionId: string; index: number | string }) => `${o.transactionId}:${Number(o.index)}`;

/**
 * Waits, bounded by `deadline`, until the node's UTXO view reflects `txId` for the plan the
 * workspace recorded for it. Always takes at least one look. RPC errors count as "not yet".
 */
async function waitForUtxoView(args: {
  sdk: any;
  txId: string;
  deadline: number;
  intervalMs: number;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
}): Promise<TxWaitUtxoView> {
  const { sdk, txId } = args;
  let plan: any;
  try {
    const submission: any = await sdk.artifacts.read({ tx: txId });
    const planId = submission?.fee?.planArtifactId ?? submission?.lineage?.rootArtifactId;
    if (typeof planId !== "string") throw Object.assign(new Error("the recorded submission names no plan"), { code: "PLAN_UNKNOWN" });
    plan = await sdk.artifacts.read({ artifact: planId });
  } catch (e: any) {
    return {
      checked: false,
      converged: false,
      reason: `no verifiable plan for this transaction in the workspace (${e?.code ?? e?.message ?? String(e)}), so there is nothing to compare the node's UTXO view with`,
      addresses: [],
      missingOutputsFor: [],
      inputsStillListed: [],
      looks: 0
    };
  }
  const paid = [
    ...(Array.isArray(plan?.outputs) ? plan.outputs : []),
    ...(plan?.change ? [plan.change] : [])
  ].filter((o: any) => typeof o?.address === "string" && BigInt(o.amountSompi ?? 0) > 0n);
  const addresses = [...new Set<string>(paid.map((o: any) => o.address))];
  const sender: string | undefined = typeof plan?.from?.address === "string" ? plan.from.address : undefined;
  const spent: string[] = (Array.isArray(plan?.inputs) ? plan.inputs : []).map((i: any) => outpointKey(i.outpoint));

  let looks = 0;
  let missing = addresses;
  let still = spent;
  let lastError: string | undefined;
  for (;;) {
    looks++;
    try {
      const views = new Map<string, any[]>();
      for (const a of new Set([...addresses, ...(sender ? [sender] : [])])) views.set(a, (await sdk.rpc.getUtxosByAddress(a)) ?? []);
      missing = addresses.filter((a) => !(views.get(a) ?? []).some((u: any) => u?.outpoint?.transactionId === txId));
      const listed = new Set((sender ? views.get(sender) ?? [] : []).map((u: any) => outpointKey(u.outpoint)));
      still = spent.filter((k) => listed.has(k));
      lastError = undefined;
      if (missing.length === 0 && still.length === 0) {
        return { checked: true, converged: true, addresses, missingOutputsFor: [], inputsStillListed: [], looks };
      }
    } catch (e: any) {
      lastError = `${e?.code ? `[${e.code}] ` : ""}${e?.message ?? String(e)}`;
    }
    if (args.now() >= args.deadline) break;
    await args.sleep(args.intervalMs);
  }
  return {
    checked: true,
    converged: false,
    ...(lastError ? { reason: `the UTXO view could not be read: ${lastError}` } : {}),
    addresses,
    missingOutputsFor: missing,
    inputsStillListed: still,
    looks
  };
}

export function targetReached(derived: DerivedTxStatus, until: TxWaitTarget): boolean {
  if (until === "accepted") {
    return derived.status === "ACCEPTED" || derived.status === "CONFIRMED" || derived.status === "FINALIZED";
  }
  return isConfirmed(derived);
}

export async function runTxWait(input: TxWaitRunnerInput): Promise<TxWaitRunnerResult> {
  const workspaceRoot = input.workspaceRoot ?? process.cwd();
  const opened = input.sdk
    ? { sdk: input.sdk, network: String(input.network ?? input.sdk.network) }
    : await openSdkForTx(input.txId, workspaceRoot, input.network);
  const { sdk, network } = opened;
  // RESOURCE-LIFECYCLE-1: an SDK opened here is released here, whatever the wait ends with (RL-I1/RL-I3); an injected
  // one is its caller's (RL-I2).
  try {
    return await waitOn(input, sdk, network);
  } finally {
    if (!input.sdk) await sdk.close();
  }
}

async function waitOn(input: TxWaitRunnerInput, sdk: any, network: string): Promise<TxWaitRunnerResult> {
  const { HardkasCliError, HardkasExitCode } = await import("../cli-errors.js");
  const sleep = input.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = input.now ?? (() => Date.now());
  const start = now();

  if (SYNTHETIC_TXID.test(input.txId)) {
    const derived: DerivedTxStatus = await sdk.tx.status(input.txId);
    input.onUpdate?.(`${derived.status} — executed by the HardKAS simulator; there is no network to wait for`, derived);
    return { txId: input.txId, network, outcome: "synthetic", until: input.until, derived, looks: 0, elapsedMs: 0 };
  }

  let looks = 0;
  let last: DerivedTxStatus | undefined;
  let lastHeadline = "";
  let lastError: string | undefined;
  let lastObservationArtifactId: string | undefined;
  for (;;) {
    try {
      const r = await sdk.tx.observe(input.txId);
      looks++;
      last = r.derived as DerivedTxStatus;
      lastObservationArtifactId = r.observation?.contentHash;
      lastError = undefined;
      const headline = stateHeadline(last);
      if (headline !== lastHeadline) {
        lastHeadline = headline;
        input.onUpdate?.(headline, last);
      }
      if (targetReached(last, input.until)) {
        const reached = last;
        const utxoView = await waitForUtxoView({ sdk, txId: input.txId, deadline: start + input.timeoutMs, intervalMs: input.intervalMs, sleep, now });
        if (utxoView.checked && !utxoView.converged) {
          const gaps = [
            utxoView.missingOutputsFor.length > 0 ? `no output of the transaction is listed for ${utxoView.missingOutputsFor.join(", ")}` : undefined,
            utxoView.inputsStillListed.length > 0 ? `${utxoView.inputsStillListed.length} input(s) it spent are still listed for the sender` : undefined,
            utxoView.reason
          ].filter(Boolean);
          throw new HardkasCliError(
            "TX_WAIT_UTXO_VIEW_STALE",
            `${input.txId} is ${stateHeadline(reached)} according to the recorded observations, but after ${Math.round((now() - start) / 1000)}s the node's UTXO view still does not reflect it (${gaps.join("; ")}). ` +
              `Balances read from this node now would be stale; wait again, with a larger --timeout if needed.`,
            { exitCode: HardkasExitCode.RUNTIME_FAILURE }
          );
        }
        return {
          txId: input.txId,
          network,
          outcome: "reached",
          until: input.until,
          derived: reached,
          looks,
          elapsedMs: now() - start,
          ...(lastObservationArtifactId ? { lastObservationArtifactId } : {}),
          utxoView
        };
      }
      if (last.status === "REJECTED_BY_NODE" || last.status === "CONFLICTING_OBSERVATIONS") {
        throw new HardkasCliError(
          "TX_WAIT_FAILED",
          `The derived state of ${input.txId} is ${last.status}: it cannot reach ${input.until.toUpperCase()} (${last.reasons.join(" · ")}).`,
          { exitCode: HardkasExitCode.RUNTIME_FAILURE }
        );
      }
    } catch (e: any) {
      if (e?.name === "HardkasCliError") throw e;
      lastError = `${e?.code ? `[${e.code}] ` : ""}${e?.message ?? String(e)}`;
    }
    if (now() - start >= input.timeoutMs) break;
    await sleep(input.intervalMs);
  }

  const lastState = last ? stateHeadline(last) : "nothing derived (no observation succeeded)";
  throw new HardkasCliError(
    "TX_WAIT_TIMEOUT",
    `Timed out after ${Math.round(input.timeoutMs / 1000)}s waiting for ${input.txId} to be ${input.until.toUpperCase()}; last derived state: ${lastState}${lastError ? `; last observer error: ${lastError}` : ""}.`,
    { exitCode: HardkasExitCode.RUNTIME_FAILURE }
  );
}
