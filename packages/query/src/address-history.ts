// R3-D · ADDRESS-HISTORY-1 · the history of an address, read from a Kaspa node over an explicit, bounded window.
//
// A Kaspa node keeps no address history: there is no "transactions of this address" RPC. What rusty-kaspa v2.1.0 does
// serve is its selected chain, and for each chain block the transactions that block ACCEPTED:
// `getVirtualChainFromBlockV2(startHash, dataVerbosityLevel)` returns the chain blocks added after `startHash` (in
// batches of the node's choosing) and, per chain block, its accepted transactions. At verbosity "High" each output
// carries its address (`verboseData.scriptPublicKeyAddress`) and its covenant binding, and each input carries the UTXO
// entry it spent: amount, address, covenant id (`verboseData.utxoEntry`, populated by the node from its acceptance
// data). Checked on the isolated simnet (rusty-kaspad v2.1.0, address-history-node.simnet): a spend of an output created
// before the window names, in its input's entry, the address that output paid.
//
// So over a window of the selected chain this reader returns every transaction accepted in it that pays the address or
// spends an output of it, deduplicated by txid, with its accepting chain block and its depth (DAA score and blue score
// below the node's tip at the end of the read). An input that comes without its entry's address (a node that does not
// populate it) can only be matched against outputs created at the address inside the window; the coverage says so.
//
// What the window is, and what it is not, is in every result (`coverage`): where it starts (a chain block; the first DAA
// score it covers), where it ends, whether it reached the node's tip, whether it starts at the node's pruning point
// (nothing older is readable on this node), and that nothing outside it — before its start, after its end, or still in a
// mempool — is covered. The workspace's own records (submissions and receipts with their plans) are merged in, so a
// transaction the workspace made is listed even outside the window, labelled as a record.
//
// Bounded: one deadline for the whole read (`timeoutMs`); at most `maxChainBlocks` chain blocks walked back to find the
// start and at most `maxChainBlocks` read forward per call; at most `limit` entries per page. Read-only: nothing is ever
// written to a node. Mainnet is refused before anything is asked (MAINNET TOTAL LOCKDOWN); the simulator has no chain.

import {
  HardkasError,
  HardkasSchemas,
  addressPrefixNetworkHint,
  assertMainnetConnectionsDisabled,
  isMainnetNetworkId,
  networkFamilyOf
} from "@hardkas/core";
import {
  ProjectArtifactStore,
  checkArtifactIdentity,
  deriveTxStatus,
  enumerateWorkspaceArtifactsSync,
  submitOutcomeOf,
  type TxStatusKind
} from "@hardkas/artifacts";

/** The one kind of read the history needs: a generic RPC call (HardKAS's KaspaRpcClient `call`, or a scripted node). */
export interface AddressHistoryRpc {
  call<T = unknown>(method: string, params?: unknown): Promise<T>;
}

/** Chain blocks walked back from the node's sink for the default window. */
export const ADDRESS_HISTORY_DEFAULT_LOOKBACK = 1_000;
export const ADDRESS_HISTORY_MAX_LOOKBACK = 100_000;
/** Chain blocks one call may walk back to its start, and read forward from it (each bound applies apart). */
export const ADDRESS_HISTORY_DEFAULT_MAX_CHAIN_BLOCKS = 10_000;
export const ADDRESS_HISTORY_MAX_CHAIN_BLOCKS = 200_000;
export const ADDRESS_HISTORY_DEFAULT_LIMIT = 100;
export const ADDRESS_HISTORY_MAX_LIMIT = 1_000;
export const ADDRESS_HISTORY_DEFAULT_TIMEOUT_MS = 60_000;
export const ADDRESS_HISTORY_MAX_TIMEOUT_MS = 600_000;
/** Workspace-only entries whose accepting chain block is read for its depth (each is one getBlock). */
const WORKSPACE_HEADER_READS = 100;

export interface AddressHistoryOptions {
  readonly address: string;
  /** The network the caller reads as (declared; never adopted from the node). Mainnet is refused before any read. */
  readonly networkId: string;
  /**
   * Where the window starts: a chain block hash (64 hex: the transactions accepted by the chain blocks after it), or a
   * DAA score (decimal string, bigint or number: the transactions accepted by chain blocks at or above it). Default:
   * `lookback` chain blocks back from the node's sink. Never before the node's pruning point (a start below it is moved
   * up to it, and the coverage says so).
   */
  readonly since?: string | bigint | number | undefined;
  /** The default window, in chain blocks back from the sink (default 1000). */
  readonly lookback?: number | undefined;
  /** At most this many chain blocks walked back, and read forward, by this call (default 10000 each). */
  readonly maxChainBlocks?: number | undefined;
  /** Entries per page (default 100, at most 1000). */
  readonly limit?: number | undefined;
  /** A page cursor from a previous result (`page.nextCursor`): the same window, the next entries. */
  readonly cursor?: string | undefined;
  /** One deadline for the whole read, in ms (default 60000). */
  readonly timeoutMs?: number | undefined;
  /** The workspace whose own records (submissions, receipts and their plans) are merged in. */
  readonly workspaceRoot?: string | undefined;
  /** Test injection. */
  readonly now?: (() => number) | undefined;
}

export interface AddressHistoryOutput {
  /** The output's index in the transaction (absent for a workspace record: a plan does not fix the output order). */
  readonly index?: number | undefined;
  readonly amountSompi: string;
  /** KIP-20: the output is bound to a covenant (not plain KAS; no payment spends it). */
  readonly covenantId?: string | undefined;
  /** The transaction of this window that spent it, when the window holds one. */
  readonly spentBy?: string | undefined;
}

export interface AddressHistorySpend {
  /** `txId:index` of the output of the address that this transaction spent. */
  readonly outpoint: string;
  /** From the node's spent entry, or the workspace's plan (absent when neither gives it). */
  readonly amountSompi?: string | undefined;
  readonly covenantId?: string | undefined;
  readonly coinbase?: boolean | undefined;
  /** How the spend was attributed to the address: the node's spent entry, an output created at it in this window, or the workspace's plan. */
  readonly matchedBy: "node-entry" | "window-output" | "workspace-plan";
}

export interface AddressHistoryAcceptance {
  readonly chainBlockHash: string;
  readonly daaScore: string;
  readonly blueScore: string;
  /** The chain block before it on the selected chain, as read: a cursor that precedes this acceptance. */
  readonly previousChainBlockHash: string;
  /** Depth below the node's virtual DAA score at the end of the read. */
  readonly confirmationsDaa: string;
  /** Depth below the node's sink blue score at the end of the read (the unit of HardKAS's confirmation policy). */
  readonly confirmationsBlue: string;
}

export interface AddressHistoryWorkspaceRecord {
  readonly submissionArtifactId?: string | undefined;
  readonly receiptArtifactId?: string | undefined;
  readonly planArtifactId?: string | undefined;
  readonly submittedAt?: string | undefined;
  /** The state derived from the workspace's evidence (its submission and verified observations). */
  readonly state?: TxStatusKind | undefined;
  readonly acceptingBlockHash?: string | undefined;
}

export interface AddressHistoryEntry {
  readonly txId: string;
  /** `node`: read in the window; `node+workspace`: read in the window and recorded here; `workspace`: a record only. */
  readonly source: "node" | "node+workspace" | "workspace";
  /** in: pays the address and spends nothing of it; out: spends and pays nothing back; self: both. */
  readonly direction: "in" | "out" | "self";
  /** Plain KAS paid to the address (covenant-bound outputs are in covenantBoundReceivedSompi). */
  readonly receivedSompi: string;
  readonly covenantBoundReceivedSompi: string;
  /** What it spent of the address; absent when an amount is unknown (see `spends`). */
  readonly spentSompi?: string | undefined;
  /** received (plain and covenant-bound) − spent, when both are known. */
  readonly netSompi?: string | undefined;
  readonly outputs: readonly AddressHistoryOutput[];
  readonly spends: readonly AddressHistorySpend[];
  readonly coinbase: boolean;
  /** An output or a spent entry of this transaction at the address is bound to a covenant. */
  readonly covenantBound: boolean;
  readonly acceptance?: AddressHistoryAcceptance | undefined;
  readonly workspace?: AddressHistoryWorkspaceRecord | undefined;
  /** For a `workspace` entry: why the window does not show it. */
  readonly outsideWindow?: string | undefined;
}

export interface AddressHistoryWindow {
  /** What the caller asked for. */
  readonly requested: { readonly kind: "block" | "daaScore" | "default" | "cursor"; readonly value?: string | undefined; readonly lookback?: number | undefined };
  /** The window starts AFTER this chain block: it covers the transactions accepted by the chain blocks that follow it. */
  readonly from: { readonly hash: string; readonly daaScore: string };
  /** The lowest DAA score a covered acceptance can have (from.daaScore + 1). */
  readonly firstCoveredDaaScore: string;
  /** The last chain block read (absent when none was). */
  readonly to?: { readonly hash: string; readonly daaScore: string } | undefined;
  readonly chainBlocks: number;
  /** The node had no chain block after the last one read. */
  readonly reachedTip: boolean;
  /** The window starts at the node's pruning point: nothing older is readable on this node. */
  readonly startsAtPruningPoint: boolean;
  /** A start below the pruning point (asked for) was moved up to it. */
  readonly clampedToPruningPoint: boolean;
  /** The requested start (a DAA score, or the lookback) was not reached within the walk bound or the deadline: the window starts later. */
  readonly requestedStartNotReached: boolean;
  /** The start block was not on the node's selected chain: the window starts at its selected-chain ancestor. */
  readonly startOffSelectedChain: boolean;
  readonly stoppedBy: "tip" | "max-chain-blocks" | "deadline" | "read-failed" | "page-end";
  /** When the window did not reach the tip: pass it as `since` to read the next window. */
  readonly continueFrom?: string | undefined;
  readonly pruningPoint: { readonly hash: string; readonly daaScore: string; readonly isGenesis: boolean };
}

export interface AddressHistoryCoverage {
  readonly window: AddressHistoryWindow;
  /**
   * `node-entries`: every input read came with the node's spent entry (its address), so every spend in the window of an
   * output of the address is listed, whenever that output was created. `window-outputs-only`: some inputs came without
   * it; those can only be matched against outputs created at the address in the window (`inputsWithoutEntry`).
   */
  readonly spends: "node-entries" | "window-outputs-only";
  readonly inputsWithoutEntry: number;
  /** The node's tip at the end of the read: the confirmations are measured from it. */
  readonly point: { readonly virtualDaaScore: string; readonly sinkHash: string; readonly sinkBlueScore: string };
  /** What the node said about itself (getServerInfo), when it answered. */
  readonly node: { readonly networkId?: string | undefined; readonly isSynced?: boolean | undefined; readonly serverVersion?: string | undefined };
  readonly workspace: { readonly merged: boolean; readonly records: number; readonly outsideWindow: number; readonly rejected: number };
  readonly reads: { readonly getBlock: number; readonly getVirtualChainFromBlockV2: number; readonly other: number };
  /** What this result does not cover, in words. */
  readonly notCovered: readonly string[];
}

export interface AddressHistoryResult {
  readonly schema: typeof HardkasSchemas.AddressHistoryV1;
  readonly address: string;
  readonly networkId: string;
  /** This page: oldest acceptance first; workspace records with no known acceptance last. */
  readonly entries: readonly AddressHistoryEntry[];
  /** Entries in the whole window (and the workspace's records), over every page. */
  readonly total: number;
  readonly page: { readonly offset: number; readonly limit: number; readonly nextCursor?: string | undefined };
  readonly coverage: AddressHistoryCoverage;
}

// ---------------------------------------------------------------------------------------------------------------------

const HEX64 = /^[0-9a-f]{64}$/;
const NO_BLOCK = new Set(["", "0".repeat(64), "f".repeat(64), "fe".repeat(32)]);
// bech32 charset (no 1, b, i, o)
const KASPA_ADDRESS = /^[a-z]+:[02-9ac-hj-np-z]{40,}$/;
/** Errors that are decisions, never "a read failed": they pass through unchanged. */
const DECISION_CODE = /^(MAINNET_(CONNECTION|SIGNING|BROADCAST)_DISABLED|NODE_NETWORK_\w+|NODE_NOT_SYNCED|NETWORK_ENDPOINT_REQUIRED|ADDRESS_HISTORY_\w+)$/;

function usage(message: string, metadata?: Record<string, unknown>): HardkasError {
  return new HardkasError("ADDRESS_HISTORY_USAGE", `${message} Nothing was read.`, metadata ? { metadata } : undefined);
}

function intOption(value: unknown, name: string, min: number, max: number, fallback: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw usage(`${name} must be a whole number from ${min} to ${max}, got ${String(value)}.`);
  }
  return value;
}

function u64(value: unknown): bigint | undefined {
  if (typeof value === "bigint") return value >= 0n ? value : undefined;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  if (typeof value === "string" && /^\d{1,20}$/.test(value)) return BigInt(value);
  return undefined;
}

const lower = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() : "");
const messageOf = (e: unknown) => String((e as { message?: unknown } | null | undefined)?.message ?? e);
const codeOf = (e: unknown) => String((e as { code?: unknown } | null | undefined)?.code ?? "");
const passThrough = (e: unknown) => {
  if (DECISION_CODE.test(codeOf(e))) throw e;
};
const networkKey = (v: unknown) => lower(v).replace(/^kaspa-/, "");

interface CursorBody {
  v: 1;
  a: string;
  f: string;
  t?: string;
  o: number;
}

function encodeCursor(body: CursorBody): string {
  return Buffer.from(JSON.stringify(body), "utf8").toString("base64url");
}

function decodeCursor(cursor: string, address: string): CursorBody {
  let body: any;
  try {
    body = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    throw usage("the page cursor cannot be read (pass page.nextCursor exactly as a previous result gave it).");
  }
  if (body?.v !== 1 || typeof body.a !== "string" || !HEX64.test(String(body.f)) || (body.t !== undefined && !HEX64.test(String(body.t))) || !Number.isInteger(body.o) || body.o < 0) {
    throw usage("the page cursor is not one this reader gave.");
  }
  if (body.a !== address) throw usage(`the page cursor is for ${body.a}, not ${address}.`);
  return body as CursorBody;
}

type Since = { kind: "block"; hash: string } | { kind: "daaScore"; daaScore: bigint };

/** Parses `since`: a 64-hex chain block hash, or a DAA score. Undefined when it is neither. */
export function parseAddressHistorySince(raw: unknown): Since | undefined {
  if (typeof raw === "string" && HEX64.test(raw.trim().toLowerCase())) return { kind: "block", hash: raw.trim().toLowerCase() };
  const daa = u64(typeof raw === "string" ? raw.trim() : raw);
  return daa === undefined ? undefined : { kind: "daaScore", daaScore: daa };
}

/** Validates the declaration before anything is read: network (mainnet refused first), address, options. */
function validate(options: AddressHistoryOptions) {
  const networkId = typeof options?.networkId === "string" ? options.networkId.trim() : "";
  // MAINNET TOTAL LOCKDOWN: refused first, whatever else is wrong, before any read
  assertMainnetConnectionsDisabled([networkId], "address history: reading it would contact a mainnet node");
  const address = typeof options?.address === "string" ? options.address.trim() : "";
  const hint = addressPrefixNetworkHint(address);
  if (hint === "mainnet") assertMainnetConnectionsDisabled(["mainnet"], `address history: ${address} is a mainnet address; nothing was contacted`);
  const family = networkFamilyOf(networkId);
  if (!family) throw usage(`'${networkId}' is not a Kaspa network id (simnet, devnet, testnet-<n>).`);
  if (family === "simulated") {
    throw new HardkasError(
      "ADDRESS_HISTORY_REQUIRES_NODE",
      "An address history reads a Kaspa node's selected chain; the HardKAS simulator has none. Use a node network (simnet, devnet, testnet-<n>). Nothing was read.",
      { metadata: { networkId } }
    );
  }
  if (!hint || !KASPA_ADDRESS.test(address)) throw usage(`'${address.slice(0, 120)}' is not a Kaspa address.`);
  if (hint !== family) {
    throw new HardkasError("ADDRESS_HISTORY_NETWORK_MISMATCH", `${address} is a ${hint} address; this history reads ${networkId}. Nothing was read.`, {
      metadata: { address, networkId, addressNetwork: hint }
    });
  }
  const lookback = intOption(options.lookback, "lookback", 1, ADDRESS_HISTORY_MAX_LOOKBACK, ADDRESS_HISTORY_DEFAULT_LOOKBACK);
  const maxChainBlocks = intOption(options.maxChainBlocks, "maxChainBlocks", 1, ADDRESS_HISTORY_MAX_CHAIN_BLOCKS, ADDRESS_HISTORY_DEFAULT_MAX_CHAIN_BLOCKS);
  const limit = intOption(options.limit, "limit", 1, ADDRESS_HISTORY_MAX_LIMIT, ADDRESS_HISTORY_DEFAULT_LIMIT);
  const timeoutMs = intOption(options.timeoutMs, "timeoutMs", 1, ADDRESS_HISTORY_MAX_TIMEOUT_MS, ADDRESS_HISTORY_DEFAULT_TIMEOUT_MS);
  let since: Since | undefined;
  if (options.since !== undefined) {
    since = parseAddressHistorySince(options.since);
    if (!since) throw usage(`since must be a chain block hash (64 hex) or a DAA score (a whole number), got '${String(options.since).slice(0, 80)}'.`);
  }
  let cursor: CursorBody | undefined;
  if (options.cursor !== undefined) {
    if (options.since !== undefined || options.lookback !== undefined) throw usage("a page cursor names its own window: it cannot be combined with since or lookback.");
    cursor = decodeCursor(String(options.cursor), address);
  }
  return { networkId, address, lookback, maxChainBlocks, limit, timeoutMs, since, cursor };
}

interface Header {
  hash: string;
  daaScore: bigint;
  blueScore: bigint;
  selectedParent: string;
  isGenesis: boolean;
}

interface Collected {
  txId: string;
  outputs: Array<{ index: number; amount: bigint; covenantId?: string }>;
  spends: Array<{ outpoint: string; amount?: bigint; covenantId?: string; coinbase?: boolean; matchedBy: "node-entry" | "window-output" }>;
  coinbase: boolean;
  block: { hash: string; daaScore: bigint; blueScore: bigint; previous: string };
  order: number;
}

class Reader {
  readonly reads = { getBlock: 0, getVirtualChainFromBlockV2: 0, other: 0 };
  constructor(
    private readonly rpc: AddressHistoryRpc,
    private readonly deadline: number,
    private readonly now: () => number
  ) {}

  timeLeft(): number {
    return this.deadline - this.now();
  }

  async ask<T>(method: string, params: unknown): Promise<T> {
    const left = this.timeLeft();
    if (left <= 0) throw new HardkasError("ADDRESS_HISTORY_TIMEOUT", `The history's deadline passed before ${method} could be asked.`);
    if (method === "getBlock") this.reads.getBlock++;
    else if (method === "getVirtualChainFromBlockV2") this.reads.getVirtualChainFromBlockV2++;
    else this.reads.other++;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new HardkasError("ADDRESS_HISTORY_TIMEOUT", `${method} did not answer before the history's deadline.`)), left);
    });
    try {
      return await Promise.race([this.rpc.call<T>(method, params), timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  /** A block's header facts; undefined when the node does not serve it (unknown, pruned). */
  async header(hash: string): Promise<Header | undefined> {
    let raw: any;
    try {
      raw = await this.ask<any>("getBlock", { hash, includeTransactions: false });
    } catch (e) {
      passThrough(e);
      if (/not found|cannot find|unknown block|prun|data is missing|no such/i.test(messageOf(e))) return undefined;
      throw e;
    }
    const block = raw?.block ?? raw?.getBlockResponse?.block ?? raw;
    const h = block?.header;
    const daaScore = u64(h?.daaScore);
    if (!h || daaScore === undefined) return undefined;
    const levelZero = Array.isArray(h.parentsByLevel) ? h.parentsByLevel[0] : undefined;
    const isGenesis = Array.isArray(h.parentsByLevel) && (!Array.isArray(levelZero) || levelZero.length === 0);
    const parent = lower(block?.verboseData?.selectedParentHash);
    return {
      hash: lower(h.hash) || hash,
      daaScore,
      blueScore: u64(h.blueScore ?? block?.verboseData?.blueScore) ?? 0n,
      selectedParent: isGenesis || NO_BLOCK.has(parent) || !HEX64.test(parent) ? "" : parent,
      isGenesis
    };
  }
}

function nodeUnsupported(what: string, e?: unknown): HardkasError {
  return new HardkasError(
    "ADDRESS_HISTORY_NODE_UNSUPPORTED",
    `This node cannot bound or serve an address history: ${what}${e !== undefined ? ` (${messageOf(e).slice(0, 300)})` : ""}. ` +
      "It needs getBlockDagInfo (sink, pruning point), getBlock and getVirtualChainFromBlockV2 with accepted transactions (rusty-kaspa v2.1.0). Nothing else was read.",
    e !== undefined ? { cause: e } : undefined
  );
}

function readFailed(what: string, e: unknown): HardkasError {
  return new HardkasError("ADDRESS_HISTORY_READ_FAILED", `The node did not answer ${what}: ${messageOf(e).slice(0, 300)}. Nothing was read.`, { cause: e });
}

const sinceUnavailable = (hash: string, why: string) =>
  new HardkasError(
    "ADDRESS_HISTORY_SINCE_UNAVAILABLE",
    `The node cannot serve its selected chain from ${hash} (${why}): unknown, or pruned. Give a chain block it still holds (at or after its pruning point), or a DAA score. Nothing was read.`,
    { metadata: { since: hash } }
  );

const incoherent = (startHash: string, why: string) =>
  new HardkasError(
    "ADDRESS_HISTORY_CHAIN_ANSWER_INCOHERENT",
    `The node's chain answer from ${startHash} is not coherent (${why}). It was rejected whole; read the history again.`,
    { metadata: { startHash } }
  );

type Scanned = AddressHistoryEntry & { sortDaa: bigint; sortOrder: number };

interface Scan {
  readonly opts: ReturnType<typeof validate>;
  readonly entries: Scanned[];
  readonly from: Header;
  readonly to?: { hash: string; daaScore: string } | undefined;
  readonly offset: number;
  readonly coverage: AddressHistoryCoverage;
}

/**
 * The window and every entry in it (and the workspace's records), before paging. Throws only before the window is
 * known (usage, mainnet, a node that cannot serve it, a start it does not hold); once reading, the deadline, the read
 * bound or a failed later batch ends the window early, and the coverage says where.
 */
async function scanAddressHistory(rpc: AddressHistoryRpc, options: AddressHistoryOptions): Promise<Scan> {
  const opts = validate(options);
  if (!rpc || typeof rpc.call !== "function") throw nodeUnsupported("the client given offers no generic RPC call");
  const now = options.now ?? (() => Date.now());
  const reader = new Reader(rpc, now() + opts.timeoutMs, now);

  // 1. Who the node says it is, its point and its pruning point: what bounds every window.
  let node: AddressHistoryCoverage["node"] = {};
  try {
    const server: any = await reader.ask<any>("getServerInfo", {});
    const s = server?.getServerInfoResponse ?? server;
    node = {
      ...(typeof s?.networkId === "string" ? { networkId: s.networkId } : {}),
      ...(typeof s?.isSynced === "boolean" ? { isSynced: s.isSynced } : {}),
      ...(typeof s?.serverVersion === "string" ? { serverVersion: s.serverVersion } : {})
    };
  } catch (e) {
    passThrough(e);
    node = {};
  }
  if (node.networkId !== undefined) {
    if (isMainnetNetworkId(node.networkId)) assertMainnetConnectionsDisabled([node.networkId], `address history: the node says it serves ${node.networkId}`);
    if (networkKey(node.networkId) !== networkKey(opts.networkId)) {
      throw new HardkasError("ADDRESS_HISTORY_NETWORK_MISMATCH", `The node says it serves ${node.networkId}; this history reads ${opts.networkId}. Nothing else was read.`, {
        metadata: { expected: opts.networkId, observed: node.networkId }
      });
    }
  }
  let dag: any;
  try {
    dag = await reader.ask<any>("getBlockDagInfo", {});
  } catch (e) {
    passThrough(e);
    throw readFailed("getBlockDagInfo", e);
  }
  const info = dag?.getBlockDagInfoResponse ?? dag;
  const sink = lower(info?.sink ?? info?.sinkHash);
  const pruningPointHash = lower(info?.pruningPointHash);
  if (!HEX64.test(sink) || !HEX64.test(pruningPointHash)) throw nodeUnsupported("its getBlockDagInfo names no sink or no pruning point");
  const pp = await reader.header(pruningPointHash);
  if (!pp) throw nodeUnsupported(`it does not serve its own pruning point ${pruningPointHash}`);
  /** A read whose failure (a timeout included) leaves a value unknown, never a decision (those pass through). */
  const bounded = async <T>(f: () => Promise<T>): Promise<T | undefined> => {
    try {
      return await f();
    } catch (e) {
      if (codeOf(e) !== "ADDRESS_HISTORY_TIMEOUT") passThrough(e);
      return undefined;
    }
  };
  const blueOf = (raw: any) => u64(raw?.blueScore ?? raw?.getSinkBlueScoreResponse?.blueScore ?? raw);
  // the depth point at the start: kept when the deadline leaves no time to read it again at the end
  const startBlue = blueOf(await bounded(() => reader.ask<any>("getSinkBlueScore", {})));

  // 2. The start of the window.
  let from: Header;
  let requested: AddressHistoryWindow["requested"];
  let clampedToPruningPoint = false;
  let requestedStartNotReached = false;
  let pinnedTo: string | undefined;
  let offset = 0;
  /** Along the selected chain (getBlock → selected parent), from the sink, until `stop`, the pruning point or `maxSteps`. */
  const walkBack = async (stop: (h: Header) => boolean, maxSteps: number): Promise<{ at: Header; done: boolean }> => {
    let at = await reader.header(sink);
    if (!at) throw nodeUnsupported(`it does not serve its own sink ${sink}`);
    let steps = 0;
    for (;;) {
      if (stop(at) || at.hash === pp.hash || at.isGenesis) return { at, done: true };
      if (!at.selectedParent || steps >= maxSteps || reader.timeLeft() <= 0) return { at, done: false };
      let parent: Header | undefined;
      try {
        parent = await reader.header(at.selectedParent);
      } catch (e) {
        if (codeOf(e) === "ADDRESS_HISTORY_TIMEOUT") return { at, done: false };
        throw e;
      }
      if (!parent) return { at, done: false };
      if (parent.daaScore > at.daaScore) throw incoherent(at.hash, `chain block ${parent.hash}'s DAA score is above its chain child's`);
      at = parent;
      steps++;
    }
  };

  if (opts.cursor) {
    requested = { kind: "cursor", value: opts.cursor.f };
    const h = await reader.header(opts.cursor.f);
    if (!h) throw sinceUnavailable(opts.cursor.f, "the page cursor's start is no longer served");
    from = h;
    pinnedTo = opts.cursor.t;
    offset = opts.cursor.o;
  } else if (opts.since?.kind === "block") {
    requested = { kind: "block", value: opts.since.hash };
    const h = await reader.header(opts.since.hash);
    if (!h) throw sinceUnavailable(opts.since.hash, "getBlock does not serve it");
    if (h.daaScore < pp.daaScore) {
      from = pp;
      clampedToPruningPoint = true;
    } else from = h;
  } else if (opts.since?.kind === "daaScore") {
    const wanted = opts.since.daaScore;
    requested = { kind: "daaScore", value: wanted.toString() };
    if (wanted <= pp.daaScore) {
      // nothing below the pruning point is readable: the window starts there (the genesis holds no earlier history)
      from = pp;
      clampedToPruningPoint = !pp.isGenesis && wanted < pp.daaScore + 1n;
    } else {
      // the first chain block below the requested score: every chain block after it is at or above it
      const walk = await walkBack((h) => h.daaScore < wanted, opts.maxChainBlocks);
      from = walk.at;
      if (!walk.done) requestedStartNotReached = true;
    }
  } else {
    requested = { kind: "default", lookback: opts.lookback };
    const steps = Math.min(opts.lookback, opts.maxChainBlocks);
    let walked = 0;
    const walk = await walkBack(() => walked++ >= steps, steps + 1);
    from = walk.at;
    // short of the lookback asked: the walk bound (maxChainBlocks) or the deadline stopped it before the pruning point
    const atBottom = from.hash === pp.hash || from.isGenesis;
    if (!atBottom && (!walk.done || opts.lookback > opts.maxChainBlocks)) requestedStartNotReached = true;
  }
  const startsAtPruningPoint = from.hash === pp.hash;

  // 3. The window, forward from its start, in the node's batches, up to the read bound, the deadline or the tip.
  const budget = opts.maxChainBlocks;
  const processed: Array<{ hash: string; daaScore: bigint; blueScore: bigint; previous: string }> = [];
  const byTx = new Map<string, Collected>();
  // outputs created at the address in this window, outpoint → txId (for inputs that come without the node's entry)
  const created = new Map<string, string>();
  let inputsWithoutEntry = 0;
  let order = 0;
  let reachedTip = false;
  let stoppedBy: AddressHistoryWindow["stoppedBy"] = "tip";
  let startOffSelectedChain = false;
  let cursorHash = from.hash;
  const address = opts.address;
  const isAddress = (v: unknown) => lower(v) === address;
  const covenantOf = (v: any): string | undefined => {
    const id = lower(v?.covenantId ?? v?.covenant_id);
    return HEX64.test(id) && !/^0{64}$/.test(id) ? id : undefined;
  };

  const take = (blockHash: string, header: any, txs: any[], previous: string) => {
    const daaScore = u64(header?.daaScore);
    const blueScore = u64(header?.blueScore);
    if (daaScore === undefined || blueScore === undefined) throw incoherent(cursorHash, `chain block ${blockHash} came without its DAA or blue score`);
    const block = { hash: blockHash, daaScore, blueScore, previous };
    processed.push(block);
    for (const tx of txs) {
      const txId = lower(tx?.verboseData?.transactionId);
      if (!HEX64.test(txId)) throw incoherent(cursorHash, `an accepted transaction of ${blockHash} names no transaction id`);
      const inputs: any[] = Array.isArray(tx?.inputs) ? tx.inputs : [];
      const outputs: any[] = Array.isArray(tx?.outputs) ? tx.outputs : [];
      const coinbase = inputs.length === 0 || String(tx?.subnetworkId ?? "").startsWith("01");
      const mine: Collected["outputs"] = [];
      outputs.forEach((o, index) => {
        if (!isAddress(o?.verboseData?.scriptPublicKeyAddress)) return;
        const amount = u64(o?.value ?? o?.amount);
        if (amount === undefined) throw incoherent(cursorHash, `output ${txId}:${index} came without its amount`);
        const covenantId = covenantOf(o?.covenant);
        mine.push({ index, amount, ...(covenantId ? { covenantId } : {}) });
      });
      const spends: Collected["spends"] = [];
      for (const input of inputs) {
        const op = input?.previousOutpoint ?? input?.previous_outpoint;
        const opTx = lower(op?.transactionId ?? op?.transaction_id);
        const opIndex = Number(op?.index);
        const outpoint = HEX64.test(opTx) && Number.isInteger(opIndex) && opIndex >= 0 ? `${opTx}:${opIndex}` : undefined;
        const entry = input?.verboseData?.utxoEntry;
        const entryAddress = entry?.verboseData?.scriptPublicKeyAddress;
        if (typeof entryAddress === "string" && entryAddress !== "") {
          if (!isAddress(entryAddress)) continue;
          if (!outpoint) throw incoherent(cursorHash, `an input of ${txId} spends an output of the address but names no outpoint`);
          const amount = u64(entry?.amount);
          const covenantId = covenantOf(entry);
          spends.push({
            outpoint,
            ...(amount !== undefined ? { amount } : {}),
            ...(covenantId ? { covenantId } : {}),
            ...(typeof entry?.isCoinbase === "boolean" ? { coinbase: entry.isCoinbase } : {}),
            matchedBy: "node-entry"
          });
        } else {
          inputsWithoutEntry++;
          if (outpoint && created.has(outpoint)) spends.push({ outpoint, matchedBy: "window-output" });
        }
      }
      if (mine.length === 0 && spends.length === 0) continue;
      // one acceptance per transaction on one chain; a transaction seen again (after a reorg) keeps the latest
      byTx.set(txId, { txId, outputs: mine, spends, coinbase, block, order: order++ });
      for (const o of mine) created.set(`${txId}:${o.index}`, txId);
    }
  };

  const dropRemoved = (removed: string[]) => {
    const gone = new Set(removed);
    for (let i = processed.length - 1; i >= 0; i--) if (gone.has(processed[i]!.hash)) processed.splice(i, 1);
    for (const [txId, c] of byTx) if (gone.has(c.block.hash)) byTx.delete(txId);
    for (const [outpoint, txId] of created) if (!byTx.has(txId)) created.delete(outpoint);
  };

  let first = true;
  outer: for (;;) {
    if (reader.timeLeft() <= 0) {
      stoppedBy = "deadline";
      break;
    }
    let answer: any;
    try {
      answer = await reader.ask<any>("getVirtualChainFromBlockV2", { startHash: cursorHash, dataVerbosityLevel: "High" });
    } catch (e) {
      if (codeOf(e) === "ADDRESS_HISTORY_TIMEOUT") {
        stoppedBy = "deadline";
        break;
      }
      passThrough(e);
      const m = messageOf(e);
      // a missing method or verbosity first ("method not found" would read as an unknown block below)
      if (first && /method not found|unknown variant|not implemented|unknown method/i.test(m)) throw nodeUnsupported("it does not serve getVirtualChainFromBlockV2 at verbosity High", e);
      if (first && /cannot find|not found|unknown block|prun|data is missing|source on its chain/i.test(m)) throw sinceUnavailable(cursorHash, m.slice(0, 200));
      if (first) throw readFailed(`the history's first chain read from ${cursorHash}`, e);
      // a later batch failed: the window ends at the last chain block read, and says so
      stoppedBy = "read-failed";
      break;
    }
    const r = answer?.getVirtualChainFromBlockV2Response ?? answer;
    const added: string[] | undefined = Array.isArray(r?.addedChainBlockHashes) ? r.addedChainBlockHashes.map(lower) : undefined;
    const removed: string[] | undefined = Array.isArray(r?.removedChainBlockHashes) ? r.removedChainBlockHashes.map(lower) : undefined;
    const accepted: any[] | undefined = Array.isArray(r?.chainBlockAcceptedTransactions) ? r.chainBlockAcceptedTransactions : undefined;
    if (!added || !removed || !accepted) throw incoherent(cursorHash, "its chain block lists are missing");
    // rusty-kaspa truncates `added` to the acceptance data it returns: one entry per added block, in order
    if (added.length !== accepted.length) throw incoherent(cursorHash, `${added.length} added chain blocks but acceptance data for ${accepted.length}`);
    for (let i = 0; i < added.length; i++) {
      const named = lower(accepted[i]?.chainBlockHeader?.hash);
      if (named !== added[i]) throw incoherent(cursorHash, `acceptance entry ${i} names ${named || "no block"}, not the added chain block ${added[i]}`);
    }
    if (removed.length > 0) {
      if (first && processed.length === 0) startOffSelectedChain = true;
      else dropRemoved(removed);
    }
    first = false;
    if (added.length === 0) {
      reachedTip = true;
      stoppedBy = "tip";
      break;
    }
    for (let i = 0; i < added.length; i++) {
      if (processed.length >= budget) {
        stoppedBy = "max-chain-blocks";
        break outer;
      }
      const previous = i > 0 ? added[i - 1]! : processed.length > 0 ? processed[processed.length - 1]!.hash : from.hash;
      const entry = accepted[i];
      take(added[i]!, entry?.chainBlockHeader, Array.isArray(entry?.acceptedTransactions) ? entry.acceptedTransactions : [], previous);
      if (pinnedTo !== undefined && added[i] === pinnedTo) {
        stoppedBy = "page-end";
        break outer;
      }
    }
    cursorHash = added[added.length - 1]!;
  }

  // 4. The point the depths are measured from: the node's tip after the read (the start's, if it cannot be read again:
  //    then every depth is a lower bound).
  const point = { virtualDaaScore: u64(info?.virtualDaaScore) ?? 0n, sinkHash: sink };
  const end: any = await bounded(() => reader.ask<any>("getBlockDagInfo", {}));
  const endInfo = end?.getBlockDagInfoResponse ?? end;
  if (HEX64.test(lower(endInfo?.sink))) {
    point.sinkHash = lower(endInfo.sink);
    point.virtualDaaScore = u64(endInfo?.virtualDaaScore) ?? point.virtualDaaScore;
  }
  const sinkBlue: bigint =
    blueOf(await bounded(() => reader.ask<any>("getSinkBlueScore", {}))) ?? startBlue ?? (await bounded(() => reader.header(point.sinkHash)))?.blueScore ?? 0n;
  const depth = (a: bigint, b: bigint) => (a > b ? a - b : 0n).toString();

  // 5. Entries from the window, with what spent what inside it.
  const spentBy = new Map<string, string>();
  for (const c of byTx.values()) for (const s of c.spends) spentBy.set(s.outpoint, c.txId);
  const entries = new Map<string, Scanned>();
  for (const c of [...byTx.values()].sort((a, b) => a.order - b.order)) {
    const plain = c.outputs.filter((o) => !o.covenantId).reduce((s, o) => s + o.amount, 0n);
    const bound = c.outputs.filter((o) => o.covenantId).reduce((s, o) => s + o.amount, 0n);
    const spentKnown = c.spends.every((s) => s.amount !== undefined);
    const spent = c.spends.reduce((s, x) => s + (x.amount ?? 0n), 0n);
    entries.set(c.txId, {
      txId: c.txId,
      source: "node",
      direction: c.spends.length === 0 ? "in" : c.outputs.length === 0 ? "out" : "self",
      receivedSompi: plain.toString(),
      covenantBoundReceivedSompi: bound.toString(),
      ...(spentKnown ? { spentSompi: spent.toString(), netSompi: (plain + bound - spent).toString() } : {}),
      outputs: c.outputs.map((o) => {
        const by = spentBy.get(`${c.txId}:${o.index}`);
        return { index: o.index, amountSompi: o.amount.toString(), ...(o.covenantId ? { covenantId: o.covenantId } : {}), ...(by ? { spentBy: by } : {}) };
      }),
      spends: c.spends.map((s) => ({
        outpoint: s.outpoint,
        ...(s.amount !== undefined ? { amountSompi: s.amount.toString() } : {}),
        ...(s.covenantId ? { covenantId: s.covenantId } : {}),
        ...(s.coinbase !== undefined ? { coinbase: s.coinbase } : {}),
        matchedBy: s.matchedBy
      })),
      coinbase: c.coinbase,
      covenantBound: c.outputs.some((o) => o.covenantId) || c.spends.some((s) => s.covenantId),
      acceptance: {
        chainBlockHash: c.block.hash,
        daaScore: c.block.daaScore.toString(),
        blueScore: c.block.blueScore.toString(),
        previousChainBlockHash: c.block.previous,
        confirmationsDaa: depth(point.virtualDaaScore, c.block.daaScore),
        confirmationsBlue: depth(sinkBlue, c.block.blueScore)
      },
      sortDaa: c.block.daaScore,
      sortOrder: c.order
    });
  }
  const last = processed[processed.length - 1];
  const to = last ? { hash: last.hash, daaScore: last.daaScore.toString() } : undefined;

  // 6. The workspace's own records: merged into the window's entries, or listed as records outside it.
  let records = 0;
  let outsideWindow = 0;
  let rejected = 0;
  const merged = typeof options.workspaceRoot === "string" && options.workspaceRoot !== "";
  if (merged) {
    const found = workspaceRecordsFor(options.workspaceRoot!, address);
    rejected = found.rejected;
    let headerReads = 0;
    for (const rec of found.records) {
      records++;
      const seen = entries.get(rec.txId);
      if (seen) {
        entries.set(rec.txId, { ...seen, source: "node+workspace", workspace: rec.workspace });
        continue;
      }
      outsideWindow++;
      let acceptance: AddressHistoryAcceptance | undefined;
      let sortDaa = 1n << 64n;
      if (rec.workspace.acceptingBlockHash && headerReads < WORKSPACE_HEADER_READS && reader.timeLeft() > 0) {
        headerReads++;
        const h = await bounded(() => reader.header(rec.workspace.acceptingBlockHash!));
        if (h) {
          sortDaa = h.daaScore;
          acceptance = {
            chainBlockHash: h.hash,
            daaScore: h.daaScore.toString(),
            blueScore: h.blueScore.toString(),
            previousChainBlockHash: h.selectedParent,
            confirmationsDaa: depth(point.virtualDaaScore, h.daaScore),
            confirmationsBlue: depth(sinkBlue, h.blueScore)
          };
        }
      }
      const state = rec.workspace.state ?? "unknown";
      const why = acceptance
        ? BigInt(acceptance.daaScore) <= from.daaScore
          ? `accepted at DAA score ${acceptance.daaScore}, before the window (it covers DAA scores above ${from.daaScore.toString()})`
          : to && BigInt(acceptance.daaScore) > BigInt(to.daaScore)
            ? `accepted at DAA score ${acceptance.daaScore}, after the window's last chain block (DAA score ${to.daaScore})`
            : `its accepting chain block by the workspace's evidence (${acceptance.chainBlockHash}) is not in the window's chain answer (state ${state})`
        : `the workspace's evidence locates no accepting chain block for it (state ${state}): the window does not hold its acceptance`;
      entries.set(rec.txId, {
        txId: rec.txId,
        source: "workspace",
        direction: rec.direction,
        receivedSompi: rec.receivedSompi.toString(),
        covenantBoundReceivedSompi: rec.covenantBoundReceivedSompi.toString(),
        spentSompi: rec.spentSompi.toString(),
        netSompi: (rec.receivedSompi + rec.covenantBoundReceivedSompi - rec.spentSompi).toString(),
        outputs: rec.outputs.map((o) => ({ amountSompi: o.amount.toString(), ...(o.covenantId ? { covenantId: o.covenantId } : {}) })),
        spends: rec.spends.map((s) => ({ outpoint: s.outpoint, amountSompi: s.amount.toString(), ...(s.covenantId ? { covenantId: s.covenantId } : {}), matchedBy: "workspace-plan" as const })),
        coinbase: false,
        covenantBound: rec.outputs.some((o) => o.covenantId) || rec.spends.some((s) => s.covenantId),
        ...(acceptance ? { acceptance } : {}),
        workspace: rec.workspace,
        outsideWindow: why,
        sortDaa,
        sortOrder: Number.MAX_SAFE_INTEGER
      });
    }
  }

  // 7. The coverage.
  const window: AddressHistoryWindow = {
    requested,
    from: { hash: from.hash, daaScore: from.daaScore.toString() },
    firstCoveredDaaScore: (from.daaScore + 1n).toString(),
    ...(to ? { to } : {}),
    chainBlocks: processed.length,
    reachedTip,
    startsAtPruningPoint,
    clampedToPruningPoint,
    requestedStartNotReached,
    startOffSelectedChain,
    stoppedBy,
    ...(!reachedTip ? { continueFrom: to?.hash ?? from.hash } : {}),
    pruningPoint: { hash: pp.hash, daaScore: pp.daaScore.toString(), isGenesis: pp.isGenesis }
  };
  const notCovered: string[] = [];
  if (!(startsAtPruningPoint && pp.isGenesis)) {
    notCovered.push(
      `transactions accepted at or below DAA score ${from.daaScore.toString()}: the window starts after chain block ${from.hash}` +
        (startsAtPruningPoint ? ", the node's pruning point (nothing older is readable on this node)" : "")
    );
  }
  if (requestedStartNotReached) {
    notCovered.push(`the requested start (${requested.kind === "daaScore" ? `DAA score ${requested.value}` : `${requested.lookback} chain blocks back`}) was not reached within the walk bound (${opts.maxChainBlocks} chain blocks) or the deadline: the window starts later`);
  }
  if (!reachedTip) notCovered.push(`transactions accepted after chain block ${to?.hash ?? from.hash} (stopped: ${stoppedBy}); read on with since = ${window.continueFrom}`);
  notCovered.push("transactions not yet accepted by a chain block (a mempool is not history)");
  if (inputsWithoutEntry > 0) {
    notCovered.push(
      `${inputsWithoutEntry} input(s) came without the node's spent entry: a spend among them of an output created before the window cannot be attributed to the address (a Kaspa P2PK unlock does not name its key)`
    );
  }
  if (node.isSynced !== true) notCovered.push(`the node ${node.isSynced === false ? "says it is not synced" : "did not say it is synced"}: what it has not seen yet is not covered`);
  if (merged) notCovered.push("records of other workspaces and wallets (only this workspace's own records are merged)");

  return {
    opts,
    entries: [...entries.values()].sort((a, b) => (a.sortDaa < b.sortDaa ? -1 : a.sortDaa > b.sortDaa ? 1 : a.sortOrder - b.sortOrder || (a.txId < b.txId ? -1 : 1))),
    from,
    to,
    offset,
    coverage: {
      window,
      spends: inputsWithoutEntry > 0 ? "window-outputs-only" : "node-entries",
      inputsWithoutEntry,
      point: { virtualDaaScore: point.virtualDaaScore.toString(), sinkHash: point.sinkHash, sinkBlueScore: sinkBlue.toString() },
      node,
      workspace: { merged, records, outsideWindow, rejected },
      reads: { ...reader.reads },
      notCovered
    }
  };
}

const strip = ({ sortDaa: _d, sortOrder: _o, ...e }: Scanned): AddressHistoryEntry => e;

/**
 * The history of `address` over a window of the node's selected chain, one page of it (see the module comment). Throws
 * only before the window is known; once reading, a deadline or the read bound ends the window early, and the coverage
 * says where. `page.nextCursor` gives the next page of the same window.
 */
export async function readAddressHistory(rpc: AddressHistoryRpc, options: AddressHistoryOptions): Promise<AddressHistoryResult> {
  const scan = await scanAddressHistory(rpc, options);
  const { limit, address, networkId } = scan.opts;
  const next = scan.offset + limit;
  const nextCursor = next < scan.entries.length ? encodeCursor({ v: 1, a: address, f: scan.from.hash, ...(scan.to ? { t: scan.to.hash } : {}), o: next }) : undefined;
  return {
    schema: HardkasSchemas.AddressHistoryV1,
    address,
    networkId,
    entries: scan.entries.slice(scan.offset, next).map(strip),
    total: scan.entries.length,
    page: { offset: scan.offset, limit, ...(nextCursor ? { nextCursor } : {}) },
    coverage: scan.coverage
  };
}

/**
 * R3-D item 3 · where the acceptance of `txId` is, found through the history of an address it pays or spends from: its
 * accepting chain block and the chain block before it (a cursor that precedes the acceptance, for the observer).
 * `found: false` says which window was read; it is never an absence beyond that window.
 */
export async function locateTransactionByAddress(
  rpc: AddressHistoryRpc,
  options: Omit<AddressHistoryOptions, "limit" | "cursor" | "workspaceRoot"> & { readonly txId: string }
): Promise<{ found: boolean; acceptance?: AddressHistoryAcceptance | undefined; entry?: AddressHistoryEntry | undefined; coverage: AddressHistoryCoverage }> {
  const txId = lower(options.txId);
  if (!HEX64.test(txId)) throw usage(`txId must be 64 hex, got '${String(options.txId).slice(0, 80)}'.`);
  const { txId: _t, ...rest } = options;
  const scan = await scanAddressHistory(rpc, rest);
  const hit = scan.entries.find((e) => e.txId === txId);
  return hit ? { found: true, acceptance: hit.acceptance, entry: strip(hit), coverage: scan.coverage } : { found: false, coverage: scan.coverage };
}

// ---------------------------------------------------------------------------------------------------------------------
// The workspace's own records

export interface AddressHistoryWorkspaceMatch {
  readonly txId: string;
  readonly direction: AddressHistoryEntry["direction"];
  readonly receivedSompi: bigint;
  readonly covenantBoundReceivedSompi: bigint;
  readonly spentSompi: bigint;
  readonly outputs: ReadonlyArray<{ amount: bigint; covenantId?: string }>;
  readonly spends: ReadonlyArray<{ outpoint: string; amount: bigint; covenantId?: string }>;
  readonly workspace: AddressHistoryWorkspaceRecord;
}

/**
 * The transactions this workspace recorded (a submission the node did not reject, or a receipt) whose verified plan
 * spends from `address` or pays it, with the state the workspace's own evidence derives. Only artifacts whose identity
 * verifies are used; submissions and receipts that do not are counted in `rejected`.
 */
export function workspaceRecordsFor(workspaceRoot: string, address: string): { records: AddressHistoryWorkspaceMatch[]; rejected: number } {
  const target = lower(address);
  const byId = new Map<string, any>();
  let rejected = 0;
  const submissions: Array<{ id: string; a: any }> = [];
  const receipts: Array<{ id: string; a: any }> = [];
  for (const entry of enumerateWorkspaceArtifactsSync(workspaceRoot)) {
    const a: any = entry.artifact;
    const schema = String(a?.schema ?? "");
    const record = schema === HardkasSchemas.TxSubmissionV1 || schema === HardkasSchemas.TxReceipt;
    if (!record && !schema.startsWith(HardkasSchemas.TxPlan) && !schema.startsWith(HardkasSchemas.SignedTx)) continue;
    const check = checkArtifactIdentity(a);
    if (!check.ok) {
      if (record) rejected++;
      continue;
    }
    byId.set(check.artifactId, a);
    if (schema === HardkasSchemas.TxSubmissionV1) submissions.push({ id: check.artifactId, a });
    else if (schema === HardkasSchemas.TxReceipt) receipts.push({ id: check.artifactId, a });
  }
  const isPlan = (id: unknown) => typeof id === "string" && String(byId.get(id)?.schema ?? "").startsWith(HardkasSchemas.TxPlan);
  const planOf = (a: any): { plan: any; planId: string } | undefined => {
    const signed = typeof a?.signedArtifactId === "string" ? byId.get(a.signedArtifactId) : undefined;
    for (const id of [a?.fee?.planArtifactId, signed?.lineage?.parentArtifactId, a?.lineage?.rootArtifactId, signed?.lineage?.rootArtifactId]) {
      if (isPlan(id)) return { plan: byId.get(id), planId: id };
    }
    return undefined;
  };
  const store = new ProjectArtifactStore(workspaceRoot);
  const out = new Map<string, AddressHistoryWorkspaceMatch>();
  const consider = (txId: string, plan: any, workspace: AddressHistoryWorkspaceRecord) => {
    if (!HEX64.test(txId) || out.has(txId) || !plan) return;
    const planned: any[] = Array.isArray(plan.outputs) ? [...plan.outputs] : [];
    if (plan.change && !planned.some((o: any) => o?.role === "change")) planned.push(plan.change);
    const outputs: Array<{ amount: bigint; covenantId?: string }> = [];
    for (const o of planned) {
      if (lower(o?.address) !== target) continue;
      const amount = u64(o?.amountSompi);
      if (amount === undefined || amount === 0n) continue;
      const covenantId = lower(o?.covenant?.covenantId);
      outputs.push({ amount, ...(HEX64.test(covenantId) ? { covenantId } : {}) });
    }
    const spends: Array<{ outpoint: string; amount: bigint; covenantId?: string }> = [];
    for (const i of Array.isArray(plan.inputs) ? plan.inputs : []) {
      if ((lower(i?.address) || lower(plan?.from?.address)) !== target) continue;
      const amount = u64(i?.amountSompi);
      const opTx = lower(i?.outpoint?.transactionId);
      const opIndex = Number(i?.outpoint?.index);
      if (amount === undefined || !HEX64.test(opTx) || !Number.isInteger(opIndex)) continue;
      const covenantId = lower(i?.covenantId);
      spends.push({ outpoint: `${opTx}:${opIndex}`, amount, ...(HEX64.test(covenantId) ? { covenantId } : {}) });
    }
    if (outputs.length === 0 && spends.length === 0) return;
    let state: TxStatusKind | undefined;
    let acceptingBlockHash: string | undefined;
    try {
      const derived = deriveTxStatus({
        txId,
        ...(workspace.submissionArtifactId ? { submission: byId.get(workspace.submissionArtifactId) } : {}),
        observations: store.listObservationsByTxId(txId).observations
      });
      state = derived.status;
      acceptingBlockHash = derived.acceptingBlockHash;
    } catch {
      state = undefined;
    }
    out.set(txId, {
      txId,
      direction: spends.length === 0 ? "in" : outputs.length === 0 ? "out" : "self",
      receivedSompi: outputs.filter((o) => !o.covenantId).reduce((s, o) => s + o.amount, 0n),
      covenantBoundReceivedSompi: outputs.filter((o) => o.covenantId).reduce((s, o) => s + o.amount, 0n),
      spentSompi: spends.reduce((s, x) => s + x.amount, 0n),
      outputs,
      spends,
      workspace: { ...workspace, ...(state ? { state } : {}), ...(acceptingBlockHash ? { acceptingBlockHash } : {}) }
    });
  };
  for (const { id, a } of submissions) {
    // a submission the node rejected is not history; an accepted one, or one whose outcome is unknown, may be
    if (submitOutcomeOf(a?.submitResult) === "rejected") continue;
    const p = planOf(a);
    if (!p) continue;
    consider(lower(a.txId), p.plan, { submissionArtifactId: id, planArtifactId: p.planId, ...(typeof a.submittedAt === "string" ? { submittedAt: a.submittedAt } : {}) });
  }
  for (const { id, a } of receipts) {
    const txId = lower(a?.txId);
    if (a?.status === "failed" || out.has(txId)) continue;
    const p = planOf(a);
    // a receipt without a plan here: what it says it paid to the address (its inputs are not known, so it names no spend)
    const plan = p?.plan ?? (lower(a?.to?.address) === target && u64(a?.amountSompi) !== undefined ? { outputs: [{ address: a.to.address, amountSompi: a.amountSompi }], inputs: [] } : undefined);
    consider(txId, plan, { receiptArtifactId: id, ...(p ? { planArtifactId: p.planId } : {}), ...(typeof a?.submittedAt === "string" ? { submittedAt: a.submittedAt } : {}) });
  }
  return { records: [...out.values()], rejected };
}
