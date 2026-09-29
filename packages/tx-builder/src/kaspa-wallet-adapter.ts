/**
 * KaspaWalletAdapter (M10-A scaffolding)
 *
 * Thin adapter over the managed kaspa-wasm SDK (the pinned KASPA_WASM_REFERENCE). Purpose: give the rest
 * of HardKAS a place to consume upstream wallet/tx semantics (Generator,
 * UtxoContext, UtxoProcessor, estimateTransactions, getNetworkParams, RPC fee
 * estimate) WITHOUT adopting the managed `Wallet` lifecycle.
 *
 * Rule: wrap upstream primitives 1:1. Do not invent semantics. HardKAS keeps
 * lifecycle/evidence on top; this module is the single point where HardKAS
 * touches wallet-core semantics.
 *
 * Non-goal: introducing HardKAS artifacts here (this module returns upstream
 * types directly; plans are adapted in generator-plan.ts, artifacts wrapped in
 * @hardkas/accounts and @hardkas/sdk).
 *
 * Authority order: wallet-core (rusty-kaspa) > pinned kaspa-wasm (managed) > here.
 */
import { KASPA_WASM_REFERENCE, getCoinbaseMaturity, loadManagedKaspaWasmSync } from "@hardkas/core";

/** The managed WASM SDK, opaque to HardKAS callers. */
type KaspaWasm = ReturnType<typeof loadManagedKaspaWasmSync>;

/**
 * Generator settings passed through unchanged to the WASM SDK.
 * See kaspa-wasm's `IGeneratorSettingsObject` for the full field list. We
 * accept `any` for `entries`/`outputs`/`priorityFee` because the SDK accepts
 * multiple shapes (arrays, single object, `UtxoContext`, `PaymentOutput`, etc.);
 * validating here would drift from upstream.
 */
export interface GeneratorSettingsInput {
  readonly networkId: string;
  readonly entries: unknown;
  /** Payment outputs. Omit them (an empty list is refused) for a sweep: everything goes to `changeAddress`. */
  readonly outputs?: unknown;
  readonly changeAddress: string;
  /** Absolute extra fee in sompi (sender pays). Set it, even to 0, when there are outputs; leave it unset for a compound. */
  readonly priorityFee?: bigint | number | { amount: bigint };
  /** Fee rate in sompi per gram, applied by the Generator to every transaction it builds (never below the network minimum). */
  readonly feeRate?: number;
  readonly payload?: string | Uint8Array;
  readonly sigOpCount?: number;
  readonly minimumSignatures?: number;
}

function toWasmSettings(input: GeneratorSettingsInput): Record<string, unknown> {
  const s: Record<string, unknown> = {
    networkId: input.networkId,
    entries: input.entries,
    changeAddress: input.changeAddress
  };
  if (input.outputs !== undefined) s.outputs = input.outputs;
  if (input.priorityFee !== undefined) s.priorityFee = input.priorityFee;
  if (input.feeRate !== undefined) s.feeRate = input.feeRate;
  if (input.payload !== undefined) s.payload = input.payload;
  if (input.sigOpCount !== undefined) s.sigOpCount = input.sigOpCount;
  if (input.minimumSignatures !== undefined) s.minimumSignatures = input.minimumSignatures;
  return s;
}

/**
 * Iterates the WASM `Generator` and yields each `PendingTransaction`.
 * Consumer is responsible for signing (`pt.sign([keys])` or `pt.signInput(...)`)
 * and submission (`pt.submit(rpc)`).
 */
export async function* buildTransactions(input: GeneratorSettingsInput): AsyncGenerator<any> {
  const k: KaspaWasm = loadManagedKaspaWasmSync();
  const gen = new k.Generator(toWasmSettings(input));
  while (true) {
    const next = await gen.next();
    if (next === null || next === undefined) return;
    yield next;
  }
}

/**
 * `Generator.estimate()` — no invented conservative padding. Returns the
 * upstream `GeneratorSummary` (fees, mass, utxos, transactions count, ids).
 */
export async function estimateTransactionsUpstream(input: GeneratorSettingsInput): Promise<any> {
  const k: KaspaWasm = loadManagedKaspaWasmSync();
  const gen = new k.Generator(toWasmSettings(input));
  return await gen.estimate();
}

/**
 * `getNetworkParams(networkId)` as the SDK returns it: coinbase and user
 * maturity, coinbase stasis and additional compound-transaction mass. It has no
 * dust or minimum-relay value. HardKAS reads maturities through
 * `@hardkas/core` `sdkNetworkParams` / `getCoinbaseMaturity`.
 */
export function networkParamsUpstream(networkId: string): any {
  const k: KaspaWasm = loadManagedKaspaWasmSync();
  return k.getNetworkParams(networkId);
}

/**
 * The RPC fee estimate from the connected node (via wasm RpcClient). Non-cached.
 * Prefer this over any HardKAS-side default.
 */
export async function rpcFeeEstimate(wasmRpc: any): Promise<any> {
  if (!wasmRpc || typeof wasmRpc.getFeeEstimate !== "function") {
    const err = new Error("KASPA_WALLET_ADAPTER_INVALID_RPC: expected a kaspa-wasm RpcClient with getFeeEstimate");
    (err as any).code = "KASPA_WALLET_ADAPTER_INVALID_RPC";
    throw err;
  }
  return await wasmRpc.getFeeEstimate({});
}

/**
 * UtxoContext lifecycle handle. Wraps a `UtxoProcessor` and a `UtxoContext`,
 * tracks the given addresses, and exposes mature/pending/balance directly from
 * upstream. Callers are responsible for calling `stop()` on teardown.
 *
 * Requires an already-connected wasm `RpcClient` (obtain it from your own
 * caller code; this adapter does not open connections).
 *
 * Reconnects: kaspa-wasm's `UtxoContext.clear()` must be called when the node connection
 * comes back, followed by re-registering the addresses, or the context keeps a stale view
 * (Surface Cut 3b: resubscribing alone kept the inputs spent while disconnected and missed
 * the change). The handle does that on every reconnect: `clear()` → `trackAddresses()` on
 * the tracked addresses, one re-snapshot at a time; reconnects that arrive meanwhile are
 * merged into one more pass, and after `stop()` nothing is registered again.
 */
export interface UtxoContextHandle {
  readonly context: any;
  readonly processor: any;
  /** True while a post-reconnect re-snapshot is running; the context is not a complete view then. */
  readonly resyncing: boolean;
  trackAddresses(addresses: readonly (string | any)[]): Promise<void>;
  unregisterAddresses(addresses: readonly (string | any)[]): Promise<void>;
  matureRange(from: number, to: number): any[];
  pending(): any[];
  balance(): any | undefined;
  matureLength(): number;
  clear(): Promise<void>;
  /** Called once after a completed re-snapshot (merged reconnects give one call). Returns an unsubscribe. */
  onResync(listener: () => void): () => void;
  /** Called when a re-snapshot fails; the next reconnect re-snapshots again. Returns an unsubscribe. */
  onError(listener: (error: unknown) => void): () => void;
  stop(): Promise<void>;
}

export interface CreateUtxoContextInput {
  readonly wasmRpc: any;
  readonly networkId: string;
  readonly addresses?: readonly (string | any)[];
  /** Optional 32-byte hex id for the UtxoContext. If omitted, upstream generates one. */
  readonly id?: string;
}

/**
 * Constructs `UtxoProcessor(rpc, networkId)` + `UtxoContext(processor)`,
 * starts the processor, and (if `addresses` is given) tracks them. The
 * processor is stopped when `handle.stop()` is called.
 */
export async function createUtxoContext(input: CreateUtxoContextInput): Promise<UtxoContextHandle> {
  if (!input?.wasmRpc) {
    const err = new Error("KASPA_WALLET_ADAPTER_MISSING_RPC: createUtxoContext requires a wasm RpcClient");
    (err as any).code = "KASPA_WALLET_ADAPTER_MISSING_RPC";
    throw err;
  }
  const k: KaspaWasm = loadManagedKaspaWasmSync();
  const processor = new k.UtxoProcessor({ rpc: input.wasmRpc, networkId: input.networkId });
  await processor.start();
  const context = new k.UtxoContext({ processor, ...(input.id ? { id: input.id } : {}) });
  const tracked = new Map<string, string | any>();
  for (const a of input.addresses ?? []) tracked.set(String(a), a);
  if (tracked.size > 0) {
    await context.trackAddresses([...tracked.values()]);
  }

  const resyncListeners = new Set<() => void>();
  const errorListeners = new Set<(error: unknown) => void>();
  const notify = <A extends unknown[]>(listeners: Set<(...a: A) => void>, ...args: A) => {
    for (const l of [...listeners]) {
      try {
        l(...args);
      } catch {
        // A listener's failure is its own; the re-snapshot already happened.
      }
    }
  };
  let closed = false;
  let requested = false;
  let running: Promise<void> | null = null;
  const resnapshot = (): void => {
    if (running || closed) return;
    running = (async () => {
      let completed = false;
      try {
        while (requested && !closed) {
          requested = false;
          await context.clear();
          if (closed) return;
          if (tracked.size > 0) await context.trackAddresses([...tracked.values()]);
          if (closed) return;
          completed = true;
        }
      } catch (error) {
        completed = false;
        if (!closed) notify(errorListeners, error);
      } finally {
        running = null;
      }
      if (completed && !closed) notify(resyncListeners);
      // A reconnect that arrived after the last pass started needs one more.
      if (requested && !closed) resnapshot();
    })();
  };
  // Attached after the first registration: only reconnects re-snapshot.
  processor.addEventListener((event: any) => {
    if (event?.type !== "connect" || closed) return;
    requested = true;
    resnapshot();
  });

  return {
    context,
    processor,
    get resyncing() {
      return running !== null;
    },
    trackAddresses: async (addresses) => {
      for (const a of addresses) tracked.set(String(a), a);
      await context.trackAddresses([...addresses]);
    },
    unregisterAddresses: async (addresses) => {
      for (const a of addresses) tracked.delete(String(a));
      await context.unregisterAddresses([...addresses]);
    },
    matureRange: (from, to) => context.getMatureRange(from, to),
    pending: () => context.getPending(),
    balance: () => context.balance,
    matureLength: () => context.matureLength,
    clear: () => context.clear(),
    onResync: (listener) => {
      resyncListeners.add(listener);
      return () => resyncListeners.delete(listener);
    },
    onError: (listener) => {
      errorListeners.add(listener);
      return () => errorListeners.delete(listener);
    },
    stop: async () => {
      closed = true;
      resyncListeners.clear();
      errorListeners.clear();
      // A re-snapshot in flight finishes its current await and then stops (it checks `closed`).
      if (running) await running;
      try {
        await context.clear();
      } catch {}
      await processor.stop();
    }
  };
}

/**
 * One-shot UTXO discovery over a wasm RpcClient with **upstream-authoritative**
 * coinbase-maturity filtering (via `k.getNetworkParams(networkId)`). Replaces
 * the HardKAS pattern of calling `rpc.getUtxosByAddress(addr)` + filtering
 * `!u.isCoinbase || u.blockDaaScore + N < virt` with an inlined maturity `N`.
 *
 * Prefer {@link createUtxoContext} when the caller needs live UTXO tracking
 * (mature/pending) and event notifications. Use this helper only for a single
 * synchronous read.
 */
export interface DiscoverUtxosInput {
  readonly wasmRpc: any;
  readonly networkId: string;
  readonly address: string;
  /** When true, skip the mature-only filter and return all UTXOs (mature + immature coinbases). */
  readonly includeImmatureCoinbase?: boolean;
}

export interface DiscoverUtxosResult {
  readonly utxos: any[];
  readonly virtualDaaScore: bigint;
  readonly coinbaseMaturity: bigint;
  readonly immatureCoinbaseCount: number;
}

export async function discoverUtxos(input: DiscoverUtxosInput): Promise<DiscoverUtxosResult> {
  if (!input?.wasmRpc || typeof input.wasmRpc.getUtxosByAddresses !== "function") {
    const err = new Error("KASPA_WALLET_ADAPTER_INVALID_RPC: expected a kaspa-wasm RpcClient");
    (err as any).code = "KASPA_WALLET_ADAPTER_INVALID_RPC";
    throw err;
  }
  const maturity = coinbaseMaturityOf(input.networkId);
  const dag = await input.wasmRpc.getBlockDagInfo();
  const virtualDaaScore = BigInt(dag.virtualDaaScore);
  const utxosResp = await input.wasmRpc.getUtxosByAddresses({ addresses: [input.address] });
  const entries: any[] = utxosResp?.entries ?? utxosResp?.utxos ?? [];
  let immature = 0;
  const filtered = input.includeImmatureCoinbase
    ? entries
    : entries.filter((u: any) => {
        const e = u?.utxoEntry ?? u;
        if (!e?.isCoinbase) return true;
        const blockDaa = BigInt(e.blockDaaScore ?? 0);
        const mature = (virtualDaaScore - blockDaa) >= maturity;
        if (!mature) immature += 1;
        return mature;
      });
  return { utxos: filtered, virtualDaaScore, coinbaseMaturity: maturity, immatureCoinbaseCount: immature };
}

/**
 * Pure filter over an already-fetched UTXO list, using **upstream** coinbase
 * maturity (`k.getNetworkParams(networkId).coinbaseTransactionMaturityPeriodDaa`).
 * Callers can supply UTXOs from any RPC client (@hardkas/kaspa-rpc,
 * wasm RpcClient, or a mock) — this function only classifies.
 *
 * Replaces the HardKAS pattern `!u.isCoinbase || u.blockDaaScore + N < virt`
 * with hardcoded `N` (600/100/1000). N is read from upstream network params.
 */
export interface FilterMatureUtxosInput {
  readonly networkId: string;
  readonly virtualDaaScore: bigint;
  readonly utxos: readonly any[];
  /** How to read the score / coinbase flag from each element. Defaults to `utxoEntry` wrapper shape. */
  readonly readEntry?: (u: any) => { blockDaaScore: bigint; isCoinbase: boolean };
}

export interface FilterMatureUtxosResult<T = any> {
  readonly mature: T[];
  readonly immature: T[];
  readonly coinbaseMaturity: bigint;
}

function defaultReadEntry(u: any): { blockDaaScore: bigint; isCoinbase: boolean } {
  const e = u?.utxoEntry ?? u;
  return {
    blockDaaScore: BigInt(e?.blockDaaScore ?? e?.block_daa_score ?? 0),
    isCoinbase: Boolean(e?.isCoinbase ?? e?.is_coinbase)
  };
}

/** Coinbase maturity in DAA blocks, from the SDK's network parameters (no HardKAS default). */
function coinbaseMaturityOf(networkId: string): bigint {
  return getCoinbaseMaturity(networkId);
}

export function filterMatureUtxos<T = any>(input: FilterMatureUtxosInput): FilterMatureUtxosResult<T> {
  const maturity = coinbaseMaturityOf(input.networkId);
  const read = input.readEntry ?? defaultReadEntry;
  const mature: T[] = [];
  const immature: T[] = [];
  for (const u of input.utxos) {
    const e = read(u);
    if (!e.isCoinbase || (input.virtualDaaScore - e.blockDaaScore) >= maturity) {
      mature.push(u as T);
    } else {
      immature.push(u as T);
    }
  }
  return { mature, immature, coinbaseMaturity: maturity };
}

/** The pinned WASM SDK version this adapter binds to, for evidence/provenance. */
export function adapterAuthority(): { sdk: string; version: string } {
  return { sdk: "kaspa-wasm", version: KASPA_WASM_REFERENCE.version };
}
