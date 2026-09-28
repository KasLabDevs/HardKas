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

import { isConfirmed, type DerivedTxStatus } from "@hardkas/artifacts";
import { SYNTHETIC_TXID, openSdkForTx, stateHeadline } from "./tx-status-runner.js";

export type TxWaitTarget = "accepted" | "confirmed";

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
}

export function targetReached(derived: DerivedTxStatus, until: TxWaitTarget): boolean {
  if (until === "accepted") {
    return derived.status === "ACCEPTED" || derived.status === "CONFIRMED" || derived.status === "FINALIZED";
  }
  return isConfirmed(derived);
}

export async function runTxWait(input: TxWaitRunnerInput): Promise<TxWaitRunnerResult> {
  const { HardkasCliError, HardkasExitCode } = await import("../cli-errors.js");
  const workspaceRoot = input.workspaceRoot ?? process.cwd();
  const opened = input.sdk
    ? { sdk: input.sdk, network: String(input.network ?? input.sdk.network) }
    : await openSdkForTx(input.txId, workspaceRoot, input.network);
  const { sdk, network } = opened;
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
        return { txId: input.txId, network, outcome: "reached", until: input.until, derived: last, looks, elapsedMs: now() - start, ...(lastObservationArtifactId ? { lastObservationArtifactId } : {}) };
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
