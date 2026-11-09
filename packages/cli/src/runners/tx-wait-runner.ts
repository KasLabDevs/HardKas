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
// TX-WAIT-CHAINED-SPEND-1: an output spent since by a later transaction (a batch's next payment
// spending this one's change) is never listed again, so the view also reflects the transaction
// once an output of it is listed and none of its inputs is (see waitForUtxoView).

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
  /**
   * TX-WAIT-CHAINED-SPEND-1: addresses whose output of the tx the converged view no longer lists — the view lists another
   * output of it and none of its inputs, so it has applied the tx and that output was spent since.
   */
  outputsNoLongerListed?: string[];
  /** INT9 · C3: the view of a tx with no plan here (`--address`): its inputs are unknown, so they were not checked. */
  inputsUnknown?: true;
  looks: number;
}

export interface TxWaitRunnerInput {
  txId: string;
  until: TxWaitTarget;
  timeoutMs: number;
  intervalMs: number;
  network?: string;
  /**
   * STAGE-B-2 · C3: the virtual-chain cursor of the first look that succeeds (`tx status --since`'s contract); later looks
   * continue from the window a stored look verified.
   */
  since?: string;
  /**
   * INT9 · C3: addresses the transaction pays (`--address`), for a tx with no local cursor (no submission, no stored
   * look, no --since). See `externalCursor`.
   */
  addresses?: string[];
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
  /** INT9 · C3: the chain block the wait's first look scanned from, when the wait chose it (`--address`) or was given it. */
  cursor?: TxWaitCursor;
}

/**
 * INT9 · C3: where the virtual-chain scan of a wait starts when the wait itself had to choose. `wait-start`: the node's
 * sink at the wait's first look (chosen with `--address`, for a tx with no local cursor); `since`: the caller's --since.
 */
export interface TxWaitCursor {
  hash: string;
  origin: "wait-start" | "since";
  /** The DAA score of that chain block, read from its header (absent when the node did not serve it). */
  daaScore?: string;
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
  /** INT9 · C3: `--address` — with no plan here, the view is checked at these addresses (outputs only). */
  addresses?: string[];
}): Promise<TxWaitUtxoView> {
  const { sdk, txId } = args;
  let plan: any;
  try {
    const submission: any = await sdk.artifacts.read({ tx: txId });
    const planId = submission?.fee?.planArtifactId ?? submission?.lineage?.rootArtifactId;
    if (typeof planId !== "string") throw Object.assign(new Error("the recorded submission names no plan"), { code: "PLAN_UNKNOWN" });
    plan = await sdk.artifacts.read({ artifact: planId });
  } catch (e: any) {
    if (args.addresses && args.addresses.length > 0) return waitForExternalUtxoView({ ...args, addresses: args.addresses });
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
      // TX-WAIT-CHAINED-SPEND-1: kaspad's UTXO index applies a transaction's spent inputs and its new outputs in one
      // diff, so a view that lists an output of the tx and none of its inputs has applied it, and an output it does not
      // list was spent since (a later payment spending this one's change, a recipient spending what it received). A view
      // that lists no output of the tx proves nothing (lagging, empty or rebuilding): the wait goes on, as it does while
      // an input is still listed.
      if (still.length === 0 && (missing.length === 0 || missing.length < addresses.length)) {
        return {
          checked: true,
          converged: true,
          addresses,
          missingOutputsFor: [],
          inputsStillListed: [],
          ...(missing.length > 0 ? { outputsNoLongerListed: missing } : {}),
          looks
        };
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

/**
 * INT9 · C3: the UTXO view of a tx with no plan here, at the `--address` addresses it pays. kaspad's index applies a
 * transaction's outputs in one diff, so an output of it listed at one of them means the view has applied it; the inputs
 * it spent are not known here and are not checked (the row says so). Bounded like waitForUtxoView.
 */
async function waitForExternalUtxoView(args: {
  sdk: any;
  txId: string;
  deadline: number;
  intervalMs: number;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  addresses: string[];
}): Promise<TxWaitUtxoView> {
  const addresses = [...new Set(args.addresses)];
  const reason = "no plan for this transaction in the workspace: only its outputs at the --address addresses are checked (the inputs it spent are unknown here)";
  let looks = 0;
  let missing = addresses;
  let lastError: string | undefined;
  for (;;) {
    looks++;
    try {
      const listedAt: string[] = [];
      for (const a of addresses) {
        if (((await args.sdk.rpc.getUtxosByAddress(a)) ?? []).some((u: any) => u?.outpoint?.transactionId === args.txId)) listedAt.push(a);
      }
      missing = addresses.filter((a) => !listedAt.includes(a));
      lastError = undefined;
      if (listedAt.length > 0) {
        return {
          checked: true,
          converged: true,
          reason,
          inputsUnknown: true,
          addresses,
          missingOutputsFor: [],
          inputsStillListed: [],
          ...(missing.length > 0 ? { outputsNoLongerListed: missing } : {}),
          looks
        };
      }
    } catch (e: unknown) {
      const err = e as { code?: unknown; message?: unknown } | null | undefined;
      lastError = `${err?.code ? `[${String(err.code)}] ` : ""}${String(err?.message ?? e)}`;
    }
    if (args.now() >= args.deadline) break;
    await args.sleep(args.intervalMs);
  }
  return {
    checked: true,
    converged: false,
    reason: lastError ?`${reason}; the UTXO view could not be read: ${lastError}` : reason,
    inputsUnknown: true,
    addresses,
    missingOutputsFor: missing,
    inputsStillListed: [],
    looks
  };
}

/** INT9 · C3: whether this workspace already gives the observer a cursor for `txId` (a recorded submission or a stored look). */
async function hasLocalCursor(sdk: any, txId: string): Promise<boolean> {
  try {
    if (await sdk.artifacts.read({ tx: txId })) return true;
  } catch (e: unknown) {
    if ((e as { code?: unknown } | null | undefined)?.code !== "RECEIPT_NOT_FOUND") return true;
  }
  try {
    const { ProjectArtifactStore } = await import("@hardkas/artifacts");
    return new ProjectArtifactStore(sdk.workspace.root).listObservationsByTxId(txId).observations.length > 0;
  } catch {
    return false;
  }
}

/** INT9 · C3: the node's sink now, with its header's DAA score (a cursor for a wait that starts before the acceptance). */
async function sinkNow(sdk: any): Promise<TxWaitCursor> {
  const raw: any = await sdk.rpc.call("getBlockDagInfo", {});
  const info: any = raw?.getBlockDagInfoResponse ?? raw;
  const hash = String(info?.sink ?? info?.sinkHash ?? "");
  if (!/^[0-9a-f]{64}$/.test(hash)) throw new Error("the node's getBlockDagInfo named no sink");
  return { hash, origin: "wait-start", ...(await headerDaaOf(sdk, hash)) };
}

async function headerDaaOf(sdk: any, hash: string): Promise<{ daaScore?: string }> {
  try {
    const raw: any = await sdk.rpc.call("getBlock", { hash, includeTransactions: false });
    const header: any = raw?.block?.header ?? raw?.getBlockResponse?.block?.header ?? raw?.header;
    return header?.daaScore !== undefined && header?.daaScore !== null ? { daaScore: BigInt(header.daaScore).toString() } : {};
  } catch {
    return {};
  }
}

/** INT9 · C3: the outputs of `txId` the node lists at `addresses`, with the DAA score each was accepted at. */
async function listedOutputsOf(sdk: any, txId: string, addresses: string[]): Promise<Array<{ outpoint: string; address: string; blockDaaScore?: bigint }>> {
  const found: Array<{ outpoint: string; address: string; blockDaaScore?: bigint }> = [];
  for (const a of [...new Set(addresses)]) {
    for (const u of ((await sdk.rpc.getUtxosByAddress(a)) ?? []) as any[]) {
      if (u?.outpoint?.transactionId !== txId) continue;
      const daa = u?.blockDaaScore ?? u?.utxoEntry?.blockDaaScore;
      found.push({ outpoint: `${txId}:${Number(u.outpoint.index)}`, address: a, ...(daa !== undefined && daa !== null ? { blockDaaScore: BigInt(daa) } : {}) });
    }
  }
  return found;
}

/** The `UTXO View` row of `tx wait`'s human output (a view, not a state). */
export function utxoViewRow(view: TxWaitUtxoView): string {
  if (!view.checked) return `not checked: ${view.reason}`;
  const spentSince = view.outputsNoLongerListed ?? [];
  if (view.inputsUnknown) {
    return (
      `reflects this transaction: an output of it is listed at ${view.addresses.length - spentSince.length} of ${view.addresses.length} --address address(es)` +
      ` (no plan here: the inputs it spent are not known, so they were not checked) (${view.looks} look(s))`
    );
  }
  return spentSince.length === 0
    ? `reflects this transaction: an output of it is listed for ${view.addresses.length} address(es) and the inputs it spent are no longer listed (${view.looks} look(s))`
    : `reflects this transaction: an output of it is listed for ${view.addresses.length - spentSince.length} of ${view.addresses.length} address(es) ` +
        `(the output for ${spentSince.join(", ")} was spent since) and the inputs it spent are no longer listed (${view.looks} look(s))`;
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
    : // INT9-A (I-3b): waiting needs the current chain state: every look asks a node that says it is synced. A look the
      // node refuses that way (NODE_NOT_SYNCED) records nothing and the wait keeps trying until its timeout, which names it.
      await openSdkForTx(input.txId, workspaceRoot, input.network, { requireSyncedNode: true });
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
  // STAGE-B-2 · C3: an explicit cursor applies until one look has been recorded (a transport error before that must not
  // drop it, or the next look would scan from the pruning point); from then on the stored window is the cursor.
  let since = input.since;
  // INT9 · C3 (`--address`): a tx with no local cursor — no submission recorded, no stored look, no --since — is scanned
  // from the node's sink at the wait's first look, instead of from its pruning point. That cursor is right only for a tx
  // accepted after the wait started, so each look that has not found the acceptance yet reads the UTXOs at --address: an
  // output of the tx listed there carries the DAA score of its accepting chain block, and one at or before the cursor's
  // means the acceptance is behind the scan — the wait ends at once (TX_WAIT_ACCEPTED_BEFORE_CURSOR), claiming nothing.
  const addresses = [...new Set(input.addresses ?? [])];
  let cursor: TxWaitCursor | undefined;
  let needCursor = false;
  if (addresses.length > 0) {
    if (since !== undefined) cursor = { hash: since, origin: "since", ...(await headerDaaOf(sdk, since)) };
    else needCursor = !(await hasLocalCursor(sdk, input.txId));
  }
  for (;;) {
    try {
      if (needCursor && !cursor) {
        cursor = await sinkNow(sdk);
        since = cursor.hash;
      }
      const r = await sdk.tx.observe(input.txId, since !== undefined ? { since } : {});
      since = undefined;
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
        const utxoView = await waitForUtxoView({
          sdk,
          txId: input.txId,
          deadline: start + input.timeoutMs,
          intervalMs: input.intervalMs,
          sleep,
          now,
          ...(addresses.length > 0 ? { addresses } : {})
        });
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
          utxoView,
          ...(cursor ? { cursor } : {})
        };
      }
      // INT9 · C3: not accepted in the window scanned so far — is its acceptance behind the cursor?
      if (cursor?.daaScore !== undefined && !["ACCEPTED", "CONFIRMED", "FINALIZED", "REORGED"].includes(last.status)) {
        const listed = await listedOutputsOf(sdk, input.txId, addresses).catch(() => []);
        const behind = listed.find((o) => o.blockDaaScore !== undefined && o.blockDaaScore <= BigInt(cursor!.daaScore!));
        if (behind) {
          throw new HardkasCliError(
            "TX_WAIT_ACCEPTED_BEFORE_CURSOR",
            `${input.txId} was accepted before the chain block this wait scans from: the node lists its output ${behind.outpoint} at ${behind.address}, accepted at DAA score ${behind.blockDaaScore}, ` +
              `and the scan starts at ${cursor.hash} (DAA score ${cursor.daaScore}, ${cursor.origin === "wait-start" ? "the node's sink when this wait started" : "--since"}). ` +
              `Scanning forward cannot find that acceptance, so no state is claimed. Give --since <a chain block before DAA score ${behind.blockDaaScore}>.`,
            { exitCode: HardkasExitCode.RUNTIME_FAILURE }
          );
        }
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
      // TESTNET-PORT-COLLISION-1: no endpoint chosen for this public network — waiting cannot change that, so the wait
      // ends now with the typed refusal (nothing was contacted) instead of timing out on it
      if (e?.code === "NETWORK_ENDPOINT_REQUIRED") throw e;
      // STAGE-B-2 · C3: the node cannot serve the chain from the explicit --since (unknown or pruned); waiting cannot
      // change that, and the observer recorded nothing — end now with its typed refusal
      if (e?.code === "OBSERVE_SINCE_UNAVAILABLE") throw e;
      lastError = `${e?.code ? `[${e.code}] ` : ""}${e?.message ?? String(e)}`;
    }
    if (now() - start >= input.timeoutMs) break;
    await sleep(input.intervalMs);
  }

  const lastState = last ? stateHeadline(last) : "nothing derived (no observation succeeded)";
  // STAGE-B-2 · C3: only when it is the cause — nothing here says where the tx is (no submission recorded, no --since)
  // and the looks have not found it — say how the scan proceeds and how to start it where the tx is.
  const noCursor =
    input.since === undefined && last !== undefined && !last.evidence.submissionArtifactId && last.status === "INSUFFICIENT_EVIDENCE";
  throw new HardkasCliError(
    "TX_WAIT_TIMEOUT",
    `Timed out after ${Math.round(input.timeoutMs / 1000)}s waiting for ${input.txId} to be ${input.until.toUpperCase()}; last derived state: ${lastState}${lastError ? `; last observer error: ${lastError}` : ""}.` +
      (noCursor
        ? addresses.length > 0
          ? ` No submission of this txId is recorded in this workspace: the looks scanned the node's virtual chain from ${cursor ? `${cursor.hash} (${cursor.origin === "wait-start" ? "its sink when this wait started" : "--since"})` : "no cursor (the node's sink could not be read)"} and did not find its acceptance, and no output of it is listed at ${addresses.join(", ")}. ` +
            `It may not be accepted yet, or its outputs there were spent: run the wait again to continue, or pass --since <a chain block before its acceptance>.`
          : ` No submission of this txId is recorded in this workspace and no --since was given, so the looks scan the node's virtual chain from its pruning point onward, each one resuming where the previous one stopped. ` +
            `Pass --since <chainBlockHash> (a chain block before the tx's acceptance) to start there, or --address <an address it pays> to start at the node's sink when the wait starts (a tx accepted after that), or run the wait again to continue.`
        : ""),
    { exitCode: HardkasExitCode.RUNTIME_FAILURE }
  );
}
