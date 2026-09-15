/**
 * KaspaWalletAdapter (M10-A scaffolding)
 *
 * Thin adapter over the managed kaspa-wasm SDK (v2.0.1). Purpose: give the rest
 * of HardKAS a place to consume upstream wallet/tx semantics (Generator,
 * UtxoContext, UtxoProcessor, estimateTransactions, getNetworkParams, RPC fee
 * estimate) WITHOUT adopting the managed `Wallet` lifecycle.
 *
 * Rule: wrap upstream primitives 1:1. Do not invent semantics. HardKAS keeps
 * lifecycle/evidence on top; this module is the single point where HardKAS
 * touches wallet-core semantics.
 *
 * Non-goals (out of scope for M10-A):
 * - Replacing existing coin-selector.ts / fee-estimator.ts / send-transfer
 *   pipeline (those migrations are M10-B/C/D).
 * - Introducing HardKAS artifacts here (this module returns upstream types
 *   directly; artifact wrapping happens in @hardkas/accounts and @hardkas/sdk).
 *
 * Authority order: wallet-core (rusty-kaspa) > kaspa-wasm 2.0.1 (managed) > here.
 */
import { loadManagedKaspaWasmSync } from "@hardkas/core";

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
  readonly outputs: unknown;
  readonly changeAddress: string;
  readonly priorityFee?: bigint | number | { amount: bigint } | { rate: bigint };
  readonly payload?: string | Uint8Array;
  readonly sigOpCount?: number;
  readonly minimumSignatures?: number;
}

function toWasmSettings(input: GeneratorSettingsInput): Record<string, unknown> {
  const s: Record<string, unknown> = {
    networkId: input.networkId,
    entries: input.entries,
    outputs: input.outputs,
    changeAddress: input.changeAddress
  };
  if (input.priorityFee !== undefined) s.priorityFee = input.priorityFee;
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
 * `getNetworkParams(networkId)` — dust threshold, min-relay, coinbase maturity
 * and other per-network parameters. Replaces every HardKAS hardcoded constant
 * (dust=600n, min-relay=100n, coinbase-maturity=1000n) once callers migrate.
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
 */
export interface UtxoContextHandle {
  readonly context: any;
  readonly processor: any;
  trackAddresses(addresses: readonly (string | any)[]): Promise<void>;
  unregisterAddresses(addresses: readonly (string | any)[]): Promise<void>;
  matureRange(from: number, to: number): any[];
  pending(): any[];
  balance(): any | undefined;
  matureLength(): number;
  clear(): Promise<void>;
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
  if (input.addresses && input.addresses.length > 0) {
    await context.trackAddresses([...input.addresses]);
  }

  return {
    context,
    processor,
    trackAddresses: (addresses) => context.trackAddresses([...addresses]),
    unregisterAddresses: (addresses) => context.unregisterAddresses([...addresses]),
    matureRange: (from, to) => context.getMatureRange(from, to),
    pending: () => context.getPending(),
    balance: () => context.balance,
    matureLength: () => context.matureLength,
    clear: () => context.clear(),
    stop: async () => {
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
  const k: KaspaWasm = loadManagedKaspaWasmSync();
  const params = k.getNetworkParams(input.networkId);
  const maturity: bigint = BigInt(params.coinbaseTransactionMaturityPeriod ?? params.coinbaseMaturity ?? 1000);
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
 * maturity (`k.getNetworkParams(networkId).coinbaseTransactionMaturityPeriod`
 * or equivalent). Callers can supply UTXOs from any RPC client (@hardkas/kaspa-rpc,
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

export function filterMatureUtxos<T = any>(input: FilterMatureUtxosInput): FilterMatureUtxosResult<T> {
  const k: KaspaWasm = loadManagedKaspaWasmSync();
  const params = k.getNetworkParams(input.networkId);
  const maturity: bigint = BigInt(params.coinbaseTransactionMaturityPeriod ?? params.coinbaseMaturity ?? 1000);
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
  return { sdk: "kaspa-wasm", version: "2.0.1" };
}
