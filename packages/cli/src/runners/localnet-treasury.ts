import fs from "node:fs";
import path from "node:path";
import { getOutput } from "../output.js";
import { UI } from "../ui.js";
import { HardkasCliError, HardkasExitCode } from "../cli-errors.js";
import { loadHardkasConfig } from "@hardkas/config";
import {
  assertExecutionCompatibility,
  formatSompiToKas,
  getCoinbaseMaturity,
  getHardkasHome,
  nodeRpcUrl,
  systemRuntimeContext,
  type NetworkId
} from "@hardkas/core";
import { requireNodeIdentity } from "@hardkas/node-runner";
import { JsonWrpcKaspaClient, isNodeNetworkIdentityError, isRpcRequestNotSentError } from "@hardkas/kaspa-rpc";
import {
  ensureDevAccounts,
  getLocalnetTreasuryAccount,
  listDevAccountsSync,
  resolveHardkasAccount,
  signTxPlanArtifact,
  type LocalnetTreasuryAccount
} from "@hardkas/accounts";
import {
  createTxPlanArtifact,
  getBroadcastableSignedTransaction,
  HardkasSchemas,
  nodeAlreadyHoldsTx,
  submitOutcomeOf
} from "@hardkas/artifacts";
import {
  filterMatureUtxos,
  GeneratorPlanError,
  isCovenantUtxo,
  planPaymentWithGenerator,
  type Utxo
} from "@hardkas/tx-builder";
import { createFundingStateReader, type FundingStateJson } from "./localnet-funding-state.js";
import {
  DEFAULT_DAG_SETTLE_TIMEOUT_MS,
  TOCCATA_MINER_CONTAINER,
  TOCCATA_PROFILE,
  getAddressFundingState,
  inspectDockerContainer,
  livenessMinerRewardAddress,
  restartToccataMiner,
  sleep,
  stopToccataMiner,
  waitForVirtualDagSettle,
  withOptionalSilentConsole
} from "./localnet-runners.js";

const SOMPI_PER_KAS = 100_000_000n;
export const DEFAULT_LOCALNET_SEED_AMOUNT_SOMPI = 100n * SOMPI_PER_KAS;
/** Reserve headroom mined alongside initial treasury funding so follow-up transfers settle in one block. */
const TREASURY_RESERVE_HEADROOM_SOMPI = 200n * SOMPI_PER_KAS;
const MIN_FEE_BUFFER_SOMPI = 1n * SOMPI_PER_KAS;
/** B6: a payment is split in two parts only while each part stays at or above this amount. */
const MIN_SPLIT_PART_SOMPI = 1n * SOMPI_PER_KAS;
const DEFAULT_TREASURY_TIMEOUT_MS = 300_000;

/** A10: where a workspace keeps the treasury transactions whose outcome is not known yet (see TreasuryPendingJournal). */
/**
 * The treasury's pending journal, relative to HARDKAS_HOME (`$HARDKAS_HOME`, else `~/.hardkas`). The managed localnet and
 * its treasury are one per machine, so the journal is too: a journal per workspace (or per current directory) let
 * `localnet seed` in one folder re-pay a recipient whose payment `fund --treasury` in another had left unknown (rc2
 * re-audit F1).
 */
export const LOCALNET_TREASURY_PENDING_FILE = path.join("localnet", "treasury-pending.json");

/** The machine's treasury journal directory root (HARDKAS_HOME). */
export function localnetTreasuryJournalRoot(): string {
  return getHardkasHome();
}

export interface LocalnetSeedOptions {
  amountSompi?: bigint;
  onlyEmpty?: boolean;
  accounts?: readonly string[];
  profile?: string;
  timeoutMs?: number;
  stopMiner?: boolean;
  json?: boolean;
  silentOutput?: boolean;
  workspaceRoot?: string;
}

export interface SeededAccountResult {
  name: string;
  address: string;
  beforeBalanceSompi: string;
  afterBalanceSompi: string;
  fundedSompi: string;
  skipped: boolean;
  txId?: string;
  /** B6: every treasury transaction that paid this account, when it took more than one. */
  txIds?: string[];
}

export interface LocalnetSeedResult {
  schema: typeof HardkasSchemas.LocalnetSeedV1;
  profile: string;
  status: string;
  treasuryAddress: string;
  amountPerAccountSompi: string;
  txIds: string[];
  accounts: SeededAccountResult[];
  miner: unknown;
  minerRewardAddress?: string;
  /** A10: treasury transactions of an earlier run (outcome unknown then) that this run sent again and saw confirmed. */
  resumedTxIds?: string[];
}

export interface TreasuryRecipient {
  name: string;
  address: string;
  beforeBalanceSompi: bigint;
  amountSompi: bigint;
}

/** The node reads and the broadcast the treasury distribution needs. In the CLI: the canonical localnet's client (B7). */
export interface TreasuryRpc {
  getUtxosByAddress(address: string): Promise<any[]>;
  getInfo(): Promise<any>;
  getBalanceByAddress(address: string): Promise<{ balanceSompi: bigint }>;
  submitTransaction(transaction: any, options?: any): Promise<any>;
}

/**
 * B2: how the distribution gets blocks produced, injectable. The CLI's producer is the canonical localnet's Docker miner
 * (createLocalnetDockerBlockProducer); a real-node test drives its own isolated node.
 */
export interface TreasuryBlockProducer {
  /**
   * Produces blocks whose coinbase pays `rewardAddress` until `done()` is true or `deadline` (epoch ms) passes. When it
   * returns, no block is being produced and the chain has settled; `settleProblem` says why it could not settle (only
   * when `done()` was never seen true: otherwise that is an error).
   */
  produceUntil(rewardAddress: string, done: () => Promise<boolean>, deadline: number): Promise<{ reached: boolean; settleProblem?: string }>;
  /** An address whose coinbase nobody can spend: the reward of the blocks that only confirm treasury transactions. */
  livenessRewardAddress(): Promise<string>;
  /** Leaves blocks being produced after the run (the localnet's liveness miner). */
  resumeLiveness(rewardAddress: string): Promise<void>;
  /** Stops block production (verified). */
  stop(): Promise<void>;
}

/** The localnet's own producer: the canonical miner container, verified stopped, and a bounded settle (B1). */
export function createLocalnetDockerBlockProducer(
  rpc: unknown,
  options: { pollIntervalMs?: number; settleTimeoutMs?: number } = {}
): TreasuryBlockProducer {
  const pollMs = options.pollIntervalMs ?? 500;
  const settleFloorMs = options.settleTimeoutMs ?? DEFAULT_DAG_SETTLE_TIMEOUT_MS;
  return {
    async produceUntil(rewardAddress, done, deadline) {
      let failure: unknown;
      let reached = false;
      try {
        await restartToccataMiner(rewardAddress);
        while (Date.now() < deadline) {
          if (await done()) {
            reached = true;
            break;
          }
          await sleep(pollMs);
        }
      } catch (e) {
        failure = e;
      }
      // Whatever happened above, the miner is stopped (verified) and the chain settles within a bounded time: the
      // caller's remaining time, never less than the settle floor (B1).
      let stopError: unknown;
      let settleError: unknown;
      try {
        await stopToccataMiner();
      } catch (e) {
        stopError = e;
      }
      if (stopError === undefined) {
        try {
          await waitForVirtualDagSettle(rpc, { timeoutMs: Math.max(settleFloorMs, deadline - Date.now()) });
        } catch (e) {
          settleError = e;
        }
      }
      if (failure !== undefined) throw failure;
      if (stopError !== undefined) throw stopError;
      if (!reached) reached = await done();
      if (settleError !== undefined) {
        if (reached) throw settleError;
        return { reached, settleProblem: messageOf(settleError) };
      }
      return { reached };
    },
    livenessRewardAddress: () => livenessMinerRewardAddress(),
    resumeLiveness: (rewardAddress) => restartToccataMiner(rewardAddress),
    stop: () => stopToccataMiner()
  };
}

/**
 * A10: a treasury transaction recorded before it is broadcast and removed once it is confirmed or refused. An entry left
 * behind is one whose outcome is not known (no answer, a confirmation timeout, a crash): the next run in the workspace
 * sends that same signed transaction again and waits for it, and never pays its recipients again.
 */
export interface TreasuryPendingEntry {
  txId: string;
  rawTransaction: string;
  recipients: Array<{ name: string; address: string; amountSompi: string; expectedBalanceSompi: string }>;
  recordedAt: string;
}

export interface TreasuryPendingJournal {
  /** Shown in messages. */
  readonly location: string;
  load(): TreasuryPendingEntry[];
  record(entry: TreasuryPendingEntry): void;
  clear(txId: string): void;
}

export function memoryTreasuryJournal(initial: TreasuryPendingEntry[] = []): TreasuryPendingJournal & { entries: TreasuryPendingEntry[] } {
  const journal = {
    location: "(in memory)",
    entries: [...initial],
    load: () => journal.entries.map((e) => ({ ...e, recipients: e.recipients.map((r) => ({ ...r })) })),
    record: (entry: TreasuryPendingEntry) => {
      journal.entries = [...journal.entries.filter((e) => e.txId !== entry.txId), entry];
    },
    clear: (txId: string) => {
      journal.entries = journal.entries.filter((e) => e.txId !== txId);
    }
  };
  return journal;
}

/** The journal file (LOCALNET_TREASURY_PENDING_FILE under `root`, HARDKAS_HOME by default), written atomically and removed when empty. */
export function fileTreasuryJournal(root: string = localnetTreasuryJournalRoot()): TreasuryPendingJournal {
  const file = path.join(root, LOCALNET_TREASURY_PENDING_FILE);
  const read = (): TreasuryPendingEntry[] => {
    if (!fs.existsSync(file)) return [];
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
      const entries = parsed?.entries;
      if (!Array.isArray(entries)) throw new Error("no entries list");
      for (const e of entries) {
        if (typeof e?.txId !== "string" || typeof e?.rawTransaction !== "string" || !Array.isArray(e?.recipients)) {
          throw new Error("an entry has no txId, rawTransaction or recipients");
        }
      }
      return entries;
    } catch (e) {
      throw new HardkasCliError(
        "LOCALNET_TREASURY_PENDING_UNRESOLVED",
        `Cannot read ${file} (${messageOf(e)}). It records treasury transactions whose outcome was not known; HardKAS pays ` +
          `nobody from the treasury on this machine until it is readable. Check the recipients' balances, then remove the file to pay them again.`
      );
    }
  };
  const write = (entries: TreasuryPendingEntry[]) => {
    if (entries.length === 0) {
      fs.rmSync(file, { force: true });
      return;
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    const body = {
      format: "hardkas-localnet-treasury-pending",
      version: 1,
      network: "simnet",
      note: "Treasury transactions sent (or about to be) whose confirmation was not seen. The next `hardkas localnet seed` or `localnet fund --treasury` on this machine, from any workspace, sends the same transaction again and waits for it; it never pays these recipients again.",
      entries
    };
    fs.writeFileSync(tmp, JSON.stringify(body, null, 2) + "\n", "utf8");
    fs.renameSync(tmp, file);
  };
  return {
    location: file,
    load: read,
    record: (entry) => write([...read().filter((e) => e.txId !== entry.txId), entry]),
    clear: (txId) => write(read().filter((e) => e.txId !== txId))
  };
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function compareOutpoints(a: Utxo, b: Utxo): number {
  if (a.amountSompi !== b.amountSompi) return a.amountSompi > b.amountSompi ? -1 : 1;
  const ta = a.outpoint.transactionId.toLowerCase();
  const tb = b.outpoint.transactionId.toLowerCase();
  if (ta !== tb) return ta < tb ? -1 : 1;
  return a.outpoint.index - b.outpoint.index;
}

async function readMatureSpendableUtxos(
  rpc: Pick<TreasuryRpc, "getUtxosByAddress" | "getInfo">,
  address: string
): Promise<{ utxos: Utxo[]; totalMatureSompi: bigint; outpointTxIds: Set<string> }> {
  const [rawUtxos, info] = await Promise.all([rpc.getUtxosByAddress(address), rpc.getInfo()]);
  const virtualDaaScore = BigInt((info as any)?.virtualDaaScore ?? 0);
  const normalized: Utxo[] = (rawUtxos ?? []).map((u: any) => ({
    outpoint: {
      transactionId: String(u.outpoint?.transactionId ?? ""),
      index: Number(u.outpoint?.index ?? 0)
    },
    address: String(u.address || address),
    amountSompi: BigInt(u.amountSompi ?? u.amount ?? 0),
    scriptPublicKey: typeof u.scriptPublicKey === "string" ? u.scriptPublicKey : String(u.scriptPublicKey?.script ?? ""),
    ...(u.blockDaaScore !== undefined && u.blockDaaScore !== null ? { blockDaaScore: BigInt(u.blockDaaScore) } : {}),
    ...(u.isCoinbase !== undefined ? { isCoinbase: Boolean(u.isCoinbase) } : {}),
    ...(u.covenantId !== undefined ? { covenantId: String(u.covenantId) } : {})
  }));
  const nonCovenant = normalized.filter((u) => !isCovenantUtxo(u));
  const filtered = filterMatureUtxos<Utxo>({
    networkId: "simnet",
    virtualDaaScore,
    utxos: nonCovenant,
    readEntry: (u) => ({
      amountSompi: u.amountSompi,
      blockDaaScore: u.blockDaaScore === undefined ? 0n : BigInt(u.blockDaaScore),
      isCoinbase: Boolean(u.isCoinbase)
    })
  });
  const maturityMargin = filtered.coinbaseMaturity + 10n;
  const spendable = filtered.mature
    .filter((u) => {
      if (!u.isCoinbase) return true;
      if (u.blockDaaScore === undefined) return false;
      return virtualDaaScore - BigInt(u.blockDaaScore) >= maturityMargin;
    })
    // largest first; equal amounts (coinbases) by outpoint, so the same UTXO set always gives the same plan (A10)
    .sort(compareOutpoints);

  const totalMatureSompi = spendable.reduce((sum, u) => sum + u.amountSompi, 0n);
  const outpointTxIds = new Set(normalized.map((u) => u.outpoint.transactionId.toLowerCase()));
  return { utxos: spendable, totalMatureSompi, outpointTxIds };
}

async function ensureTreasuryMatureFunds(
  rpc: TreasuryRpc,
  producer: TreasuryBlockProducer,
  treasuryAddress: string,
  minNeededSompi: bigint,
  timeoutMs: number
): Promise<{ utxos: Utxo[]; totalMatureSompi: bigint }> {
  const current = await readMatureSpendableUtxos(rpc, treasuryAddress);
  if (current.totalMatureSompi >= minNeededSompi) {
    return current;
  }

  // Mine to the treasury until its mature, spendable balance (coinbase maturity + 10 DAA) covers the need plus headroom,
  // or the time is up; B1: the producer returns with the chain stopped and settled, or says why it could not settle.
  const targetMature = minNeededSompi + TREASURY_RESERVE_HEADROOM_SOMPI;
  const { settleProblem } = await producer.produceUntil(
    treasuryAddress,
    async () => (await readMatureSpendableUtxos(rpc, treasuryAddress)).totalMatureSompi >= targetMature,
    Date.now() + Math.max(1_000, timeoutMs)
  );

  const settled = await readMatureSpendableUtxos(rpc, treasuryAddress);
  if (settled.totalMatureSompi < minNeededSompi) {
    throw new HardkasCliError(
      "LOCALNET_TREASURY_FUNDING_TIMEOUT",
      `Localnet treasury ${treasuryAddress} has only ${formatSompiToKas(settled.totalMatureSompi)} KAS mature ` +
        `(needed at least ${formatSompiToKas(minNeededSompi)} KAS) before timeout.` +
        (settleProblem ? ` ${settleProblem}` : "")
    );
  }
  return settled;
}

function selectMinimalUtxos(utxos: readonly Utxo[], targetSompi: bigint, count: number): Utxo[] {
  const chosen: Utxo[] = [];
  let sum = 0n;
  for (const u of utxos) {
    chosen.push(u);
    sum += u.amountSompi;
    if (chosen.length >= count && sum >= targetSompi) break;
  }
  return chosen;
}

/**
 * B2 (rc2 audit), found by the real-Generator test: when the largest-first inputs cover the payment almost exactly (all
 * but the last one leave a remainder of roughly 0.0003 to 0.006 KAS over it), the pinned Generator stops one input early
 * and refuses its own dust change ("Storage mass exceeds maximum" → CHANGE_BELOW_STANDARD_OUTPUT), however many
 * candidates it is given (it only consumes the prefix it needs). Measured: six 50 KAS + 30,000 sompi UTXOs for 250 KAS
 * fail, + 10,000 sompi plan (W2-debug3). The treasury then plans again with one more output of this amount back to
 * itself: the Generator has to take the next input, and the change is a normal output. Recipients are paid exactly the
 * same; the treasury keeps one more UTXO.
 */
const TREASURY_CHANGE_SPLIT_SOMPI = 1n * SOMPI_PER_KAS;

async function planTreasuryBatch(
  spendable: readonly Utxo[],
  treasuryAddress: string,
  batch: readonly TreasuryRecipient[]
) {
  const payments = batch.map((r) => ({ address: r.address, amountSompi: r.amountSompi }));
  try {
    return await planTreasuryOutputs(spendable, treasuryAddress, payments);
  } catch (e) {
    if (!(e instanceof GeneratorPlanError) || e.code !== "CHANGE_BELOW_STANDARD_OUTPUT") throw e;
    return await planTreasuryOutputs(spendable, treasuryAddress, [
      ...payments,
      { address: treasuryAddress, amountSompi: TREASURY_CHANGE_SPLIT_SOMPI }
    ]);
  }
}

async function planTreasuryOutputs(
  spendable: readonly Utxo[],
  treasuryAddress: string,
  outputs: ReadonlyArray<{ address: string; amountSompi: bigint }>
) {
  const totalOut = outputs.reduce((s, o) => s + o.amountSompi, 0n);

  let count = 1;
  while (count <= spendable.length) {
    const candidates = selectMinimalUtxos(spendable, totalOut + MIN_FEE_BUFFER_SOMPI, count);
    try {
      return await planPaymentWithGenerator({
        networkId: "simnet",
        utxos: candidates,
        outputs,
        changeAddress: treasuryAddress,
        version: 0
      });
    } catch (e: any) {
      if (e instanceof GeneratorPlanError && e.code === "MULTI_TRANSACTION_PLAN_REQUIRED") {
        throw e;
      }
      if (candidates.length >= spendable.length) {
        throw e;
      }
      count = Math.max(candidates.length + 1, count + 1);
    }
  }
  return await planPaymentWithGenerator({
    networkId: "simnet",
    utxos: [...spendable],
    outputs,
    changeAddress: treasuryAddress,
    version: 0
  });
}

type SubmitVerdict =
  | { kind: "accepted" }
  | { kind: "held" }
  | { kind: "rejected"; reason: string }
  | { kind: "unknown"; reason: string }
  | { kind: "not-sent"; reason: string };

/**
 * A10: what one broadcast established, classified as `tx.send` classifies it (submitOutcomeOf): the node's own refusal
 * is a rejection; an answer saying it already holds the transaction means it is in flight; a request that may have left
 * without an answer (a timeout, a lost connection, an answer naming no or another transaction) is an UNKNOWN outcome,
 * never a plain failure. A network-identity refusal (nothing was sent) is thrown as it is.
 */
async function submitTreasuryTransaction(rpc: TreasuryRpc, rawTransaction: string, txId: string): Promise<SubmitVerdict> {
  let answer: any;
  try {
    answer = await rpc.submitTransaction(rawTransaction as any, { expectedTxId: txId } as any);
  } catch (e) {
    if (isNodeNetworkIdentityError(e)) throw e;
    const reason = messageOf(e);
    if (isRpcRequestNotSentError(e)) return { kind: "not-sent", reason };
    return classifyAnswer({ accepted: false, error: reason });
  }
  if (answer?.accepted === false) {
    return classifyAnswer({ accepted: false, ...(typeof answer.error === "string" ? { error: answer.error } : {}) });
  }
  const named = typeof answer?.transactionId === "string" ? answer.transactionId.toLowerCase() : undefined;
  if (named === txId.toLowerCase()) return { kind: "accepted" };
  return { kind: "unknown", reason: named ? `the node answered transaction ${named}, not the one submitted` : "the node's answer names no transaction" };
}

function classifyAnswer(result: { accepted: false; error?: string }): SubmitVerdict {
  if (nodeAlreadyHoldsTx(result.error)) return { kind: "held" };
  const reason = result.error ?? "the node refused it";
  return submitOutcomeOf(result) === "rejected" ? { kind: "rejected", reason } : { kind: "unknown", reason };
}

function outcomeUnknownError(txId: string, reason: string, journal: TreasuryPendingJournal): HardkasCliError {
  return new HardkasCliError(
    "LOCALNET_TREASURY_SUBMIT_OUTCOME_UNKNOWN",
    `Treasury funding transaction ${txId}: outcome unknown (${reason}). The node may have received it. HardKAS did not ` +
      `send it again and did not pay again: it is recorded in ${journal.location}, and the next 'hardkas localnet seed' or ` +
      `'localnet fund --treasury' on this machine, from any workspace, sends that same transaction again and waits for it instead of paying anew.`,
    { context: { txId } }
  );
}

interface BatchProgress {
  txId: string;
  recipients: string[];
  /** confirmed: seen on-chain; broadcast: in flight, not seen confirmed; unknown: sent, no usable answer (A10). */
  state: "confirmed" | "broadcast" | "unknown";
  resumed: boolean;
}

/**
 * B4: a failure names what this run already did: the transactions broadcast (or resumed), the accounts confirmed funded,
 * those broadcast but not confirmed, and what was done with the miner. The original error code is kept.
 */
function withTreasuryProgress(e: unknown, progress: readonly BatchProgress[], minerNote: string | undefined, pending: number, journal: TreasuryPendingJournal): unknown {
  if (progress.length === 0 && !minerNote && pending === 0) return e;
  const label = (b: BatchProgress) => `${b.txId}${b.resumed ? " (resumed from an earlier run)" : ""}`;
  const names = (bs: readonly BatchProgress[]) => [...new Set(bs.flatMap((b) => b.recipients))];
  const confirmed = progress.filter((b) => b.state === "confirmed");
  const inFlight = progress.filter((b) => b.state === "broadcast");
  const unknown = progress.filter((b) => b.state === "unknown");
  const parts: string[] = [];
  const broadcast = [...confirmed, ...inFlight];
  parts.push(broadcast.length > 0 ? `Already broadcast by this run: ${broadcast.map(label).join(", ")}.` : "Nothing was broadcast by this run with a known outcome.");
  parts.push(names(confirmed).length > 0 ? `Funded and confirmed: ${names(confirmed).join(", ")}.` : "No account was confirmed funded.");
  if (inFlight.length > 0) parts.push(`Broadcast but not confirmed: ${inFlight.map((b) => `${b.recipients.join(", ")} (${b.txId})`).join("; ")}.`);
  if (unknown.length > 0) parts.push(`Sent with an unknown outcome: ${unknown.map((b) => `${b.recipients.join(", ")} (${b.txId})`).join("; ")}.`);
  const code0 = (e as { code?: unknown } | null)?.code;
  if (pending > 0 && code0 !== "LOCALNET_TREASURY_SUBMIT_OUTCOME_UNKNOWN") {
    parts.push(
      `${pending} treasury transaction(s) with no confirmation seen are recorded in ${journal.location}: the next run sends them again and waits for them, never a new payment to their recipients.`
    );
  }
  if (minerNote) parts.push(minerNote);
  const original = e as { code?: unknown; exitCode?: unknown } | null;
  const code = typeof original?.code === "string" && original.code ? original.code : "LOCALNET_TREASURY_INCOMPLETE";
  const exitCode = typeof original?.exitCode === "number" ? (original.exitCode as HardkasExitCode) : HardkasExitCode.RUNTIME_FAILURE;
  return new HardkasCliError(code, `${messageOf(e)} ${parts.join(" ")}`, {
    exitCode,
    cause: e,
    context: {
      broadcastTxIds: progress.map((b) => b.txId).join(","),
      fundedAccounts: names(confirmed).join(","),
      unconfirmedAccounts: names([...inFlight, ...unknown]).join(",")
    }
  });
}

export interface TreasuryDistributionResult {
  txIds: string[];
  /** A10: entries of the pending journal this run sent again and saw confirmed. */
  resumedTxIds: string[];
  finalBalances: Map<string, bigint>;
  minerRewardAddress?: string;
}

/**
 * Pays every recipient its exact amount from the deterministic simnet treasury: 1 → N transactions planned by the
 * Generator and signed with the treasury key, each confirmed before the next (B2: the RPC and the block producer are
 * injected; the CLI passes the canonical localnet's). Before paying anyone, the journal's entries (outcome unknown in an
 * earlier run) are sent again as they are and confirmed, and their recipients are not paid again (A10). A recipient
 * whose amount does not fit in one standard transaction is paid in several (B6). On a failure the liveness miner is
 * restored unless `stopMiner`, and the error names what was already broadcast and funded (B4).
 */
export async function distributeFromTreasury(params: {
  rpc: TreasuryRpc;
  producer: TreasuryBlockProducer;
  treasury: LocalnetTreasuryAccount;
  recipients: readonly TreasuryRecipient[];
  timeoutMs: number;
  stopMiner: boolean;
  journal?: TreasuryPendingJournal;
  onBroadcast?: (txId: string, paid: ReadonlyArray<{ name: string; address: string; amountSompi: bigint }>) => void;
}): Promise<TreasuryDistributionResult> {
  const { rpc, treasury, timeoutMs } = params;
  const journal = params.journal ?? memoryTreasuryJournal();
  const txIds: string[] = [];
  const resumedTxIds: string[] = [];
  const finalBalances = new Map<string, bigint>();
  const progress: BatchProgress[] = [];
  let livenessAddress: string | undefined;
  let touchedChain = false;
  const producer: TreasuryBlockProducer = {
    produceUntil: (address, done, deadline) => {
      touchedChain = true;
      return params.producer.produceUntil(address, done, deadline);
    },
    livenessRewardAddress: () => params.producer.livenessRewardAddress(),
    resumeLiveness: (address) => params.producer.resumeLiveness(address),
    stop: () => {
      touchedChain = true;
      return params.producer.stop();
    }
  };

  const balancesReach = async (targets: ReadonlyArray<{ address: string; expected: bigint }>): Promise<boolean> => {
    let all = true;
    for (const t of targets) {
      const bal = await rpc.getBalanceByAddress(t.address);
      const val = BigInt(bal?.balanceSompi ?? 0);
      finalBalances.set(t.address, val);
      if (val < t.expected) all = false;
    }
    return all;
  };

  try {
    // 1. A10: the treasury transactions an earlier run left without a seen confirmation — the same transaction again
    // What resumed transactions paid each address: this run pays only what is still owed (re-audit F2: a split payment
    // whose first part was resumed used to count the recipient as paid, so the second part was never sent).
    const resumedPaid = new Map<string, bigint>();
    for (const entry of journal.load()) {
      const targets = entry.recipients.map((r) => ({ address: r.address, expected: BigInt(r.expectedBalanceSompi) }));
      const verdict = await submitTreasuryTransaction(rpc, entry.rawTransaction, entry.txId);
      if (verdict.kind === "unknown" || verdict.kind === "not-sent") {
        progress.push({ txId: entry.txId, recipients: entry.recipients.map((r) => r.name), state: "unknown", resumed: true });
        throw outcomeUnknownError(entry.txId, verdict.reason, journal);
      }
      const entryTxIdLower = entry.txId.toLowerCase();
      let confirmed = false;
      if (verdict.kind === "rejected") {
        // Its inputs are gone: accepted earlier (its change is then the treasury's), or spent by another transaction.
        confirmed = (await readMatureSpendableUtxos(rpc, treasury.address)).outpointTxIds.has(entryTxIdLower);
        if (!confirmed) {
          throw new HardkasCliError(
            "LOCALNET_TREASURY_PENDING_UNRESOLVED",
            `Treasury transaction ${entry.txId} (recorded in ${journal.location} by an earlier run whose outcome was unknown) is ` +
              `refused by the node now (${verdict.reason}) and no output of it is found at the treasury. HardKAS cannot tell ` +
              `whether it was paid, so it pays nobody again on its own: check the balances of ` +
              `${entry.recipients.map((r) => r.name).join(", ")}, then remove that file to pay them again.`,
            { context: { txId: entry.txId } }
          );
        }
      }
      const step: BatchProgress = { txId: entry.txId, recipients: entry.recipients.map((r) => r.name), state: "broadcast", resumed: true };
      progress.push(step);
      if (!confirmed) {
        livenessAddress ??= await producer.livenessRewardAddress();
        const conf = await producer.produceUntil(
          livenessAddress,
          async () =>
            (await readMatureSpendableUtxos(rpc, treasury.address)).outpointTxIds.has(entryTxIdLower) || (await balancesReach(targets)),
          Date.now() + timeoutMs
        );
        if (!conf.reached) {
          throw new HardkasCliError(
            "LOCALNET_TREASURY_CONFIRM_TIMEOUT",
            `Timed out waiting for treasury transaction ${entry.txId} (resumed from an earlier run) to confirm on-chain.` +
              (conf.settleProblem ? ` ${conf.settleProblem}` : ""),
            { context: { txId: entry.txId } }
          );
        }
      }
      await balancesReach(targets);
      step.state = "confirmed";
      journal.clear(entry.txId);
      txIds.push(entry.txId);
      resumedTxIds.push(entry.txId);
      for (const r of entry.recipients) resumedPaid.set(r.address, (resumedPaid.get(r.address) ?? 0n) + BigInt(r.amountSompi));
      params.onBroadcast?.(
        entry.txId,
        entry.recipients.map((r) => ({ name: r.name, address: r.address, amountSompi: BigInt(r.amountSompi) }))
      );
    }

    // 2. The payments of this run, minus what an earlier run's transaction just paid each recipient (A10: never twice).
    const remaining = params.recipients.flatMap((r) => {
      const already = resumedPaid.get(r.address) ?? 0n;
      return already >= r.amountSompi ? [] : [{ ...r, amountSompi: r.amountSompi - already }];
    });
    const queue: TreasuryRecipient[][] = remaining.length > 0 ? [Array.from(remaining)] : [];
    const paidSoFar = new Map<string, bigint>();

    while (queue.length > 0) {
      const batch = queue.shift()!;
      const batchTotal = batch.reduce((s, r) => s + r.amountSompi, 0n);
      const { utxos: spendable } = await ensureTreasuryMatureFunds(
        rpc,
        producer,
        treasury.address,
        batchTotal + MIN_FEE_BUFFER_SOMPI,
        timeoutMs
      );

      let builderPlan;
      try {
        builderPlan = await planTreasuryBatch(spendable, treasury.address, batch);
      } catch (e: any) {
        if (e instanceof GeneratorPlanError && e.code === "MULTI_TRANSACTION_PLAN_REQUIRED") {
          if (batch.length > 1) {
            const mid = Math.ceil(batch.length / 2);
            queue.unshift(batch.slice(mid));
            queue.unshift(batch.slice(0, mid));
            continue;
          }
          // B6: one recipient whose amount needs more treasury UTXOs than one standard transaction holds: two parts,
          // each its own transaction (recursively), instead of the Generator's "consolidate first", which the treasury cannot.
          const only = batch[0]!;
          if (only.amountSompi >= 2n * MIN_SPLIT_PART_SOMPI) {
            const half = only.amountSompi / 2n;
            queue.unshift([{ ...only, amountSompi: only.amountSompi - half }]);
            queue.unshift([{ ...only, amountSompi: half }]);
            continue;
          }
          throw new HardkasCliError(
            "LOCALNET_TREASURY_TRANSFER_UNPLANNABLE",
            `The treasury cannot pay ${formatSompiToKas(only.amountSompi)} KAS to ${only.name} in one standard transaction ` +
              `and the amount is too small to split further (${messageOf(e)}).`
          );
        }
        throw e;
      }

      const firstRecipient = batch[0]!;
      const planArtifact = createTxPlanArtifact({
        networkId: "simnet" as NetworkId,
        mode: "localnet",
        from: { input: treasury.name, address: treasury.address, accountName: treasury.name },
        to: { input: firstRecipient.name, address: firstRecipient.address },
        amountSompi: batchTotal,
        plan: builderPlan,
        ctx: {
          ...systemRuntimeContext,
          plannerAuthority: "KASPA_WASM_GENERATOR"
        }
      }) as any;

      const signedArtifact = await signTxPlanArtifact({
        target: { domain: "kaspa-l1", mode: "localnet", network: "simnet" },
        planArtifact,
        account: treasury
      });
      const broadcastable = getBroadcastableSignedTransaction(signedArtifact);
      const expectedTxId = String(signedArtifact.txId || "").toLowerCase();

      // the balance each recipient must reach: before + everything this run sent it so far (B6: parts add up)
      const targets = batch.map((r) => {
        const paid = (paidSoFar.get(r.address) ?? 0n) + r.amountSompi;
        paidSoFar.set(r.address, paid);
        return { address: r.address, expected: r.beforeBalanceSompi + paid };
      });

      // A10: recorded BEFORE the broadcast, removed once confirmed or refused; left behind only when the outcome is unknown
      journal.record({
        txId: expectedTxId,
        rawTransaction: broadcastable.rawTransaction,
        recipients: batch.map((r, i) => ({
          name: r.name,
          address: r.address,
          amountSompi: r.amountSompi.toString(),
          expectedBalanceSompi: targets[i]!.expected.toString()
        })),
        recordedAt: new Date().toISOString()
      });
      let verdict: SubmitVerdict;
      try {
        verdict = await submitTreasuryTransaction(rpc, broadcastable.rawTransaction, expectedTxId);
      } catch (e) {
        journal.clear(expectedTxId); // a network-identity refusal: nothing was sent
        throw e;
      }
      if (verdict.kind === "rejected") {
        journal.clear(expectedTxId);
        throw new HardkasCliError(
          "LOCALNET_TREASURY_SUBMIT_FAILED",
          `Treasury funding transaction ${expectedTxId} was rejected by the node: ${verdict.reason}`,
          { context: { txId: expectedTxId } }
        );
      }
      if (verdict.kind === "not-sent") {
        journal.clear(expectedTxId);
        throw new HardkasCliError(
          "SUBMIT_NOT_SENT",
          `Treasury funding transaction ${expectedTxId} was not sent: the request never left this process (${verdict.reason}). Nothing reached the node.`,
          { context: { txId: expectedTxId } }
        );
      }
      if (verdict.kind === "unknown") {
        progress.push({ txId: expectedTxId, recipients: batch.map((r) => r.name), state: "unknown", resumed: false });
        throw outcomeUnknownError(expectedTxId, verdict.reason, journal);
      }

      // accepted, or the node already holds it (a re-run of the identical transaction): in flight either way
      txIds.push(expectedTxId);
      const step: BatchProgress = { txId: expectedTxId, recipients: batch.map((r) => r.name), state: "broadcast", resumed: false };
      progress.push(step);
      params.onBroadcast?.(
        expectedTxId,
        batch.map((r) => ({ name: r.name, address: r.address, amountSompi: r.amountSompi }))
      );

      livenessAddress ??= await producer.livenessRewardAddress();
      const conf = await producer.produceUntil(livenessAddress, () => balancesReach(targets), Date.now() + timeoutMs);
      if (!conf.reached) {
        throw new HardkasCliError(
          "LOCALNET_TREASURY_CONFIRM_TIMEOUT",
          `Timed out waiting for treasury funding transaction ${expectedTxId} to confirm on-chain.` +
            (conf.settleProblem ? ` ${conf.settleProblem}` : ""),
          { context: { txId: expectedTxId } }
        );
      }
      step.state = "confirmed";
      journal.clear(expectedTxId);
    }

    let minerRewardAddress: string | undefined;
    if (!params.stopMiner && touchedChain) {
      minerRewardAddress = livenessAddress ?? (await producer.livenessRewardAddress());
      await producer.resumeLiveness(minerRewardAddress);
    } else if (params.stopMiner && !touchedChain) {
      await producer.stop();
    }

    return { txIds, resumedTxIds, finalBalances, ...(minerRewardAddress ? { minerRewardAddress } : {}) };
  } catch (e) {
    // B4: the chain is never left stopped by a failure unless --stop-miner asked for it
    let minerNote: string | undefined;
    if (touchedChain && !params.stopMiner) {
      try {
        livenessAddress ??= await producer.livenessRewardAddress();
        await producer.resumeLiveness(livenessAddress);
        minerNote = `The liveness miner was restarted (its rewards go to ${livenessAddress}, an address nobody controls).`;
      } catch (restoreError) {
        minerNote = `Restarting the liveness miner failed too (${messageOf(restoreError)}): the chain may be stopped.`;
      }
    } else if (touchedChain) {
      minerNote = "The chain is left stopped (--stop-miner).";
    }
    let pending = 0;
    try {
      pending = journal.load().length;
    } catch {
      // the journal's own error is not the one to report here
    }
    throw withTreasuryProgress(e, progress, minerNote, pending, journal);
  }
}

/**
 * B7: the treasury's node client is the canonical localnet's (`nodeRpcUrl()`), the node `requireNodeIdentity` proved and
 * the one the funding reads and the miner use, demanding a simnet node — never a `networks.simnet.rpcUrl` the workspace
 * declares (the SDK's client followed it, so that endpoint got the broadcast while every check ran on the canonical node).
 */
const CANONICAL_TREASURY_RPC = () => ({ rpcUrl: nodeRpcUrl(), expectedNetworkId: "simnet" as const });

/** B4: `--timeout` (ms) is a positive whole number; anything else is a usage error before anything is contacted. */
export function assertLocalnetTimeoutMs(timeoutMs: unknown): void {
  if (typeof timeoutMs !== "number" || !Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new HardkasCliError(
      "LOCALNET_TIMEOUT_INVALID",
      `--timeout must be a positive whole number of milliseconds, got '${String(timeoutMs)}'. Nothing was done.`,
      { exitCode: HardkasExitCode.USAGE_ERROR }
    );
  }
}

export function formatLocalnetSeedHuman(result: LocalnetSeedResult): string {
  const lines = [
    `${result.status} (${result.accounts.filter((a) => !a.skipped).length} funded, ${result.accounts.filter((a) => a.skipped).length} skipped)`,
    `Treasury: ${result.treasuryAddress}`,
    `Amount per account: ${formatSompiToKas(BigInt(result.amountPerAccountSompi))} KAS`,
    ...(result.txIds.length > 0 ? [`Transactions: ${result.txIds.join(", ")}`] : []),
    ...(result.resumedTxIds && result.resumedTxIds.length > 0
      ? [`Resumed from an earlier run (outcome unknown then, now confirmed): ${result.resumedTxIds.join(", ")}`]
      : []),
    ...result.accounts.map(
      (a) =>
        `  ${a.name.padEnd(8)} ${a.skipped ? "skipped" : "funded "} ${formatSompiToKas(BigInt(a.afterBalanceSompi))} KAS (${a.address})`
    )
  ];
  return lines.join("\n");
}

/**
 * Funds local dev accounts with an exact non-coinbase amount from the deterministic simnet Treasury
 * in a batched 1 -> N transaction (single coinbase maturity wait when Treasury itself is empty).
 */
export async function runLocalnetSeed(opts: LocalnetSeedOptions = {}): Promise<LocalnetSeedResult> {
  const profile = opts.profile || TOCCATA_PROFILE;
  if (profile !== TOCCATA_PROFILE) {
    throw new Error(`Unsupported localnet funding profile: ${profile}`);
  }
  const amountSompi = opts.amountSompi ?? DEFAULT_LOCALNET_SEED_AMOUNT_SOMPI;
  if (amountSompi <= 0n) {
    throw new HardkasCliError("LOCALNET_SEED_INVALID_AMOUNT", "--amount must be positive.", {
      exitCode: HardkasExitCode.USAGE_ERROR
    });
  }
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TREASURY_TIMEOUT_MS;
  assertLocalnetTimeoutMs(timeoutMs);

  const wsRoot = opts.workspaceRoot || process.cwd();
  const { config } = await loadHardkasConfig({ workspaceRoot: wsRoot }).catch(() => ({ config: undefined }));
  await ensureDevAccounts(wsRoot);
  const devAccounts = listDevAccountsSync(wsRoot);
  const treasury = getLocalnetTreasuryAccount();

  const targetList: Array<{ name: string; address: string }> = [];
  if (opts.accounts && opts.accounts.length > 0) {
    const devByName = new Map(devAccounts.map((a) => [a.name, a]));
    const simTarget = { mode: "localnet", domain: "kaspa-l1", network: "simnet" } as const;
    for (const id of opts.accounts) {
      const dev = devByName.get(id);
      if (dev) {
        targetList.push({ name: dev.name, address: dev.address });
        continue;
      }
      let resolved;
      let address = id;
      try {
        resolved = resolveHardkasAccount({ nameOrAddress: id, config, executionTarget: simTarget });
        address = resolved.address || id;
      } catch {
        address = id;
      }
      if (resolved) {
        assertExecutionCompatibility({
          operation: "fund",
          target: simTarget,
          account: {
            kind: resolved.kind,
            network: (resolved as any).network,
            executionMode: (resolved as any).executionMode
          }
        });
      } else if (!address.startsWith("kaspasim:")) {
        throw new Error(`TOCCATA_FUNDING_REQUIRES_SIMNET_ADDRESS: ${address}`);
      }
      targetList.push({ name: resolved?.name || id, address });
    }
  } else {
    for (const acc of devAccounts) {
      targetList.push({ name: acc.name, address: acc.address });
    }
  }

  await requireNodeIdentity();

  const quiet = !!opts.json || !!opts.silentOutput;

  const { result } = await withOptionalSilentConsole(quiet, async () => {
    const rpc = new JsonWrpcKaspaClient(CANONICAL_TREASURY_RPC());
    try {
      const beforeBalances = new Map<string, bigint>();
      for (const acc of targetList) {
        const bal = await rpc.getBalanceByAddress(acc.address);
        beforeBalances.set(acc.address, BigInt(bal?.balanceSompi ?? 0));
      }

      const recipients: TreasuryRecipient[] = [];
      for (const acc of targetList) {
        const before = beforeBalances.get(acc.address) ?? 0n;
        if (opts.onlyEmpty && before > 0n) continue;
        recipients.push({
          name: acc.name,
          address: acc.address,
          beforeBalanceSompi: before,
          amountSompi
        });
      }

      const txsByAddress = new Map<string, string[]>();
      const fundedByAddress = new Map<string, bigint>();
      const afterBalances = new Map<string, bigint>(beforeBalances);

      const exec = await distributeFromTreasury({
        rpc,
        producer: createLocalnetDockerBlockProducer(rpc),
        treasury,
        recipients,
        timeoutMs,
        stopMiner: !!opts.stopMiner,
        journal: fileTreasuryJournal(),
        onBroadcast: (txId, paid) => {
          for (const r of paid) {
            txsByAddress.set(r.address, [...(txsByAddress.get(r.address) ?? []), txId]);
            fundedByAddress.set(r.address, (fundedByAddress.get(r.address) ?? 0n) + r.amountSompi);
          }
        }
      });
      for (const [addr, bal] of exec.finalBalances) afterBalances.set(addr, bal);

      const seededAccounts: SeededAccountResult[] = targetList.map((acc) => {
        const before = beforeBalances.get(acc.address) ?? 0n;
        const after = afterBalances.get(acc.address) ?? before;
        const accTxIds = [...new Set(txsByAddress.get(acc.address) ?? [])];
        const funded = fundedByAddress.get(acc.address) ?? 0n;
        return {
          name: acc.name,
          address: acc.address,
          beforeBalanceSompi: before.toString(),
          afterBalanceSompi: after.toString(),
          fundedSompi: funded.toString(),
          skipped: accTxIds.length === 0,
          ...(accTxIds.length > 0 ? { txId: accTxIds[0]! } : {}),
          ...(accTxIds.length > 1 ? { txIds: accTxIds } : {})
        };
      });

      const payload: LocalnetSeedResult = {
        schema: HardkasSchemas.LocalnetSeedV1,
        profile,
        status: exec.txIds.length === 0 ? "TOCCATA_ACCOUNTS_ALREADY_FUNDED" : "TOCCATA_ACCOUNTS_SEEDED",
        treasuryAddress: treasury.address,
        amountPerAccountSompi: amountSompi.toString(),
        txIds: exec.txIds,
        accounts: seededAccounts,
        miner: await inspectDockerContainer(TOCCATA_MINER_CONTAINER),
        ...(exec.minerRewardAddress ? { minerRewardAddress: exec.minerRewardAddress } : {}),
        ...(exec.resumedTxIds.length > 0 ? { resumedTxIds: exec.resumedTxIds } : {})
      };

      return { result: payload };
    } finally {
      await rpc.close().catch(() => {});
    }
  });

  if (!opts.silentOutput) {
    if (opts.json) {
      getOutput().writeJson(result);
    } else {
      UI.success(result.status);
      for (const line of formatLocalnetSeedHuman(result).split("\n").slice(1)) {
        UI.info(line);
      }
      UI.info(
        opts.stopMiner
          ? "Miner: stopped (--stop-miner): no new blocks until you mine again"
          : "Miner: running for block production; its rewards go to an unspendable address"
      );
    }
  }

  return result;
}

/**
 * Treasury-backed variant of `localnet fund <identifier>`: transfers an exact non-coinbase UTXO
 * from the deterministic Treasury and settles in one confirmation without coinbase pollution.
 */
export async function runLocalnetFundTreasury(opts: {
  address: string;
  identifier: string;
  amountSompi: bigint;
  profile: string;
  timeoutMs: number;
  stopMiner: boolean;
  json: boolean;
  workspaceRoot: string;
}): Promise<void> {
  if (opts.amountSompi <= 0n) {
    throw new HardkasCliError("LOCALNET_FUND_INVALID_AMOUNT", "--amount must be positive.", {
      exitCode: HardkasExitCode.USAGE_ERROR
    });
  }
  assertLocalnetTimeoutMs(opts.timeoutMs);

  const treasury = getLocalnetTreasuryAccount();
  const reader = createFundingStateReader(opts.address, getCoinbaseMaturity("simnet"));
  const before: FundingStateJson = await getAddressFundingState(reader, "balance-then-dag", opts.json);

  const execResult = await withOptionalSilentConsole(opts.json, async () => {
    const rpc = new JsonWrpcKaspaClient(CANONICAL_TREASURY_RPC());
    try {
      const bal = await rpc.getBalanceByAddress(opts.address);
      const beforeTotal = BigInt(bal?.balanceSompi ?? 0);
      return await distributeFromTreasury({
        rpc,
        producer: createLocalnetDockerBlockProducer(rpc),
        treasury,
        recipients: [
          {
            name: opts.identifier,
            address: opts.address,
            beforeBalanceSompi: beforeTotal,
            amountSompi: opts.amountSompi
          }
        ],
        timeoutMs: opts.timeoutMs,
        stopMiner: opts.stopMiner,
        journal: fileTreasuryJournal()
      });
    } finally {
      await rpc.close().catch(() => {});
    }
  });

  const current = await getAddressFundingState(reader, "balance-then-dag", opts.json);
  const status =
    BigInt(current.matureBalanceSompi) > BigInt(before.matureBalanceSompi)
      ? "TOCCATA_ACCOUNT_FUNDED"
      : "TOCCATA_FUNDING_PENDING_MATURITY";

  const payload = {
    schema: HardkasSchemas.LocalnetFundingV1,
    profile: opts.profile,
    status,
    address: opts.address,
    fundingSource: "treasury",
    treasuryAddress: treasury.address,
    txIds: execResult.txIds,
    ...(execResult.resumedTxIds.length > 0 ? { resumedTxIds: execResult.resumedTxIds } : {}),
    before,
    after: current,
    miner: await inspectDockerContainer(TOCCATA_MINER_CONTAINER),
    ...(execResult.minerRewardAddress ? { minerRewardAddress: execResult.minerRewardAddress } : {})
  };

  if (opts.json) {
    getOutput().writeJson(payload);
    return;
  }

  UI.success(status);
  UI.info(`Address: ${opts.address}`);
  UI.info(`Treasury tx: ${execResult.txIds.join(", ")}`);
  if (execResult.resumedTxIds.length > 0) {
    UI.info(`Resumed from an earlier run (outcome unknown then, now confirmed): ${execResult.resumedTxIds.join(", ")}`);
  }
  UI.info(`Mature balance: ${current.matureBalanceSompi.toString()} sompi`);
  UI.info(
    opts.stopMiner
      ? "Miner: stopped (--stop-miner): no new blocks until you mine again"
      : "Miner: running for block production; its rewards go to an unspendable address"
  );
}
