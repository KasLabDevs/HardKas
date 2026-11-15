import { HardkasError, isMainnetNetworkId, mainnetConnectionDisabledError, redactUrlCredentials } from '@hardkas/core';
import { officialRpcFactory } from '@hardkas/kaspa-rpc';
import { covenantIdOf, createUtxoContext, type UtxoContextHandle } from '@hardkas/tx-builder';
import { logger } from '@hardkas/observability';

/*
 * WalletToolkit.watch() observes the wallet's address through kaspa-wasm's UtxoProcessor +
 * UtxoContext (tx-builder `createUtxoContext`, which re-snapshots after every reconnect).
 * Surface Cut 3b: a subscription recovers future events after a reconnect but not what changed
 * while disconnected; the context's clear() → trackAddresses() does (gap experiment, 29-sep).
 */

/** An outpoint of the watched address, with its amount. */
export interface WalletOutpoint {
    transactionId: string;
    index: number;
    amountSompi: bigint;
}

/** A UTXO as the watch observes it. Coinbase UTXOs still in stasis are counted in balance(), not listed. */
export interface WalletWatchUtxo extends WalletOutpoint {
    state: "mature" | "pending";
    isCoinbase: boolean;
    blockDaaScore: bigint;
    /** COVENANT-UTXO-PAYMENT-FILTER-1C: set when the UTXO belongs to a covenant (KIP-20); a payment never spends it. */
    covenantId?: string;
}

/**
 * `transaction`: a change observed live, one per upstream transaction record. For outputs
 * received, `txid` is the transaction that created them; for outputs spent, upstream reports
 * the transaction whose outputs were spent (it does not know the spender).
 * `resync`: after a reconnect, the whole difference between what the watch showed before the
 * disconnection and the re-snapshot. The disconnected interval is never reported as `transaction`.
 */
export type WalletWatchEvent =
    | { type: "transaction"; txid: string; details: { added: WalletOutpoint[]; removed: WalletOutpoint[] } }
    | { type: "resync"; reason: "reconnect"; removed: WalletOutpoint[]; added: WalletOutpoint[] };

export type WalletWatchListener = (event: WalletWatchEvent) => void | Promise<void>;

export interface WalletWatchHandle {
    unwatch(): Promise<void>;
    /** The watched address's UTXOs: mature and pending. */
    utxos(): WalletWatchUtxo[];
    /** Amounts of the mature and pending UTXOs, and how many coinbase UTXOs are still in stasis. */
    balance(): { mature: bigint; pending: bigint; stasisCount: number };
}

// Upstream record data types that add or remove UTXOs of the address (kaspa-wasm TransactionDataType).
const ADDED = new Set(["incoming", "change", "transfer-incoming"]);
const REMOVED = new Set(["external", "reorg"]);
// Events that carry a record of live activity. `discovery` is what a scan finds and `stasis`
// is a coinbase not yet listed: neither is a transaction.
const LIVE = new Set(["pending", "maturity", "reorg"]);
const DEDUPE_LIMIT = 1000;
// The first connection is bounded like kaspa-rpc's default request timeout; reconnects are not (kaspa-wasm retries).
const CONNECT_TIMEOUT_MS = 30_000;
// G7 h (notes cross-check): each identity question (getServerInfo) is bounded like kaspa-rpc's default request timeout,
// and the first snapshot (processor start + the address's UTXOs) gets more room; a call that never settled used to block
// the watch (and every later reconnect) for ever.
const REQUEST_TIMEOUT_MS = 30_000;
const SNAPSHOT_TIMEOUT_MS = 120_000;

/** Bounds of the watch engine's own calls, in ms (defaults: connect 30 s, request 30 s, snapshot 120 s). */
export interface UtxoWatchEngineTimeouts {
    connectMs?: number;
    requestMs?: number;
    snapshotMs?: number;
}

/**
 * WATCH-CLI-1 · `maturity`: outputs the watch reported as received became mature (kaspa-wasm's `maturity` record of an
 * incoming transaction). Reported only by watchAddress (reportMaturity); WalletToolkit.watch() never emits it.
 */
export interface WalletWatchMaturityEvent {
    type: "maturity";
    txid: string;
    details: { matured: WalletOutpoint[] };
}
export type AddressWatchEvent = WalletWatchEvent | WalletWatchMaturityEvent;
export type AddressWatchListener = (event: AddressWatchEvent) => void | Promise<void>;

/** The engine's options: its bounds, and what watchAddress adds (all off for WalletToolkit.watch()). */
export interface UtxoWatchEngineOptions extends UtxoWatchEngineTimeouts {
    /** Report `maturity` events. */
    reportMaturity?: boolean;
    /** What the engine otherwise only logs: a failed or stalled re-snapshot, a node that changed its network (the watch then stops). */
    onError?: (error: unknown) => void;
    /** The connection went away (`disconnected`) or came back (`reconnected`: the re-snapshot follows, then a `resync`). */
    onConnection?: (state: "disconnected" | "reconnected") => void;
}

const keyOf = (o: { transactionId: string; index: number }) => `${o.transactionId}:${o.index}`;
const byOutpoint = (a: WalletOutpoint, b: WalletOutpoint) =>
    a.transactionId < b.transactionId ? -1 : a.transactionId > b.transactionId ? 1 : a.index - b.index;
const outpointOf = (u: WalletWatchUtxo): WalletOutpoint => ({ transactionId: u.transactionId, index: u.index, amountSompi: u.amountSompi });

function recordOf(data: any): any {
    try {
        return typeof data?.serialize === 'function' ? data.serialize() : data;
    } catch {
        return undefined;
    }
}

export class UtxoWatchEngine {
    /** WalletToolkit.watch() listeners, and watchAddress's (which alone may receive `maturity`, when asked for). */
    private readonly listeners = new Set<(event: any) => void | Promise<void>>();
    private rpc: any;
    private handle: UtxoContextHandle | null = null;
    private closed = false;
    private stasisCount = 0;
    /** What the watch showed when the connection went away; the next resync is measured from it. */
    private beforeGap: Map<string, WalletWatchUtxo> | null = null;
    private lastSeen = new Map<string, WalletWatchUtxo>();
    private readonly reported = new Set<string>();
    private readonly reportedOrder: string[] = [];
    /** A4: the network the first connection's node named; every later connection must name the same one. */
    private networkId: string | undefined;
    /** A4: false from a disconnect until the new connection's node has named that network again. */
    private identityVerified = true;
    /** G7 h: armed when a re-snapshot starts; fires if it has not finished within the snapshot bound. */
    private resyncWatchdog: ReturnType<typeof setTimeout> | undefined;
    private readonly connectMs: number;
    private readonly requestMs: number;
    private readonly snapshotMs: number;
    private readonly options: UtxoWatchEngineOptions;

    constructor(private readonly rpcUrl: string, private readonly getAddress: () => Promise<string>, timeouts: UtxoWatchEngineOptions = {}) {
        this.connectMs = timeouts.connectMs ?? CONNECT_TIMEOUT_MS;
        this.requestMs = timeouts.requestMs ?? REQUEST_TIMEOUT_MS;
        this.snapshotMs = timeouts.snapshotMs ?? SNAPSHOT_TIMEOUT_MS;
        this.options = timeouts;
    }

    /** WATCH-CLI-1 · the network the first connection's node named (undefined before it answered). */
    get nodeNetworkId(): string | undefined {
        return this.networkId;
    }

    /** WATCH-CLI-1 · the caller's error hook (watchAddress), never allowed to throw into the engine. */
    private report(error: unknown): void {
        try {
            this.options.onError?.(error);
        } catch {
            // the caller's hook failed: the engine keeps its own log
        }
    }

    async start(): Promise<void> {
        // Its own client, with kaspa-wasm's default Retry strategy, so the processor sees every
        // disconnect and reconnect and the context re-snapshots after each one. G7 i (notes cross-check): built by
        // kaspa-rpc's factory, the same JSON-encoded official RpcClient plus the process guard it installs
        // (useWsWebSocketForSdk: `ws` with an 'error' listener), so a disconnect after a connect that timed out
        // mid-handshake cannot end the process even when this is the process's first client.
        this.rpc = officialRpcFactory(this.rpcUrl);
        try {
            await this.connectWithin(this.connectMs);
            const { networkId } = await this.within<any>(this.rpc.getServerInfo(), this.requestMs, "getServerInfo (the node's identity)");
            // MAINNET TOTAL LOCKDOWN: this engine holds its own kaspa-wasm client (the processor needs it), so it applies
            // the transport's rule itself: a node that says mainnet is released after that one identity answer
            if (isMainnetNetworkId(networkId)) {
                throw mainnetConnectionDisabledError(`WalletToolkit.watch: the node at ${redactUrlCredentials(this.rpcUrl)} says it serves ${networkId}`, { observed: networkId }, "identity-only");
            }
            this.networkId = String(networkId);
            const address = await this.getAddress();
            // A4 (rc2 audit): every reconnection of this client is identified again before the context re-reads the address
            // from it (the transport's rule, session.ts): a node behind the URL that now names mainnet or another network
            // stops the watch, and nothing it answers is reported
            const handle = await this.within(
                createUtxoContext({ wasmRpc: this.rpc, networkId, addresses: [address], beforeResnapshot: () => this.reverifyIdentity() }),
                this.snapshotMs,
                "the first snapshot of the address (UtxoProcessor start + trackAddresses)",
                // a snapshot that completes after the bound was given up: release it
                (late) => void late.stop().catch(() => {})
            );
            this.handle = handle;
            this.lastSeen = this.read();
            handle.processor.addEventListener((event: any) => this.onUpstream(event));
            handle.onResync(() => this.onResync());
            handle.onError((error) => {
                this.disarmResyncWatchdog();
                logger.error("Wallet watch re-snapshot failed; the next reconnect retries", { error, code: (error as { code?: unknown } | null)?.code });
                this.report(error);
            });
        } catch (e) {
            await this.rpc.disconnect().catch(() => {});
            throw e;
        }
    }

    /**
     * A4: the identity of a resumed connection, before the re-snapshot reads anything from it. The node must name the
     * network the first connection's node named, and never mainnet; otherwise the watch stops (its listeners get nothing
     * more) and the re-snapshot is refused.
     */
    private async reverifyIdentity(): Promise<void> {
        // a failure here (the connection went away again) refuses this re-snapshot too; the next reconnect asks again.
        // G7 h: bounded, so a node that keeps the socket and stops answering fails this pass (WALLET_WATCH_NODE_TIMEOUT,
        // to onError) instead of holding the re-snapshot, and with it every later reconnect, for ever
        const observed: unknown = (await this.within<any>(this.rpc.getServerInfo(), this.requestMs, "getServerInfo after a reconnection"))?.networkId;
        if (isMainnetNetworkId(observed) || String(observed) !== this.networkId) {
            const where = redactUrlCredentials(this.rpcUrl);
            const err = isMainnetNetworkId(observed)
                ? mainnetConnectionDisabledError(`WalletToolkit.watch: after a reconnection the node at ${where} says it serves ${String(observed)}`, { observed }, "identity-only")
                : Object.assign(
                      new Error(
                          `WALLET_WATCH_NODE_NETWORK_CHANGED: after a reconnection the node at ${where} says it serves ${String(observed)}, not ${this.networkId}; the watch was stopped and nothing it answered was reported.`
                      ),
                      { code: "WALLET_WATCH_NODE_NETWORK_CHANGED", expected: this.networkId, observed }
                  );
            logger.error("Wallet watch stopped: the node changed its network", { expected: this.networkId, observed: String(observed) });
            this.report(err);
            void this.stop().catch(() => {});
            throw err;
        }
        this.identityVerified = true;
    }

    /** Retry keeps connect() pending until the node answers; without a bound, watch() would hang on a node that is down. */
    private async connectWithin(ms: number): Promise<void> {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
                // A3: the endpoint without its credentials (user:password, api_key=…), as everywhere else
                const err = new Error(`WALLET_WATCH_NODE_UNREACHABLE: watch() could not reach the node at ${redactUrlCredentials(this.rpcUrl)} within ${ms / 1000} s`);
                (err as any).code = "WALLET_WATCH_NODE_UNREACHABLE";
                reject(err);
            }, ms);
        });
        try {
            await Promise.race([this.rpc.connect({ blockAsyncConnect: true }), timeout]);
        } finally {
            clearTimeout(timer);
        }
    }

    /**
     * G7 h: `work`, or WALLET_WATCH_NODE_TIMEOUT after `ms`. The call itself cannot be cancelled: if it settles later,
     * its value goes to `onLate` (to release what it opened) and is otherwise ignored.
     */
    private async within<T>(work: Promise<T>, ms: number, operation: string, onLate?: (value: T) => void): Promise<T> {
        let timer: ReturnType<typeof setTimeout> | undefined;
        let timedOut = false;
        const timeout = new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
                timedOut = true;
                reject(
                    new HardkasError(
                        "WALLET_WATCH_NODE_TIMEOUT",
                        `WalletToolkit.watch: ${operation} got no answer from the node at ${redactUrlCredentials(this.rpcUrl)} within ${ms / 1000} s.`,
                        { metadata: { operation, timeoutMs: ms } }
                    )
                );
            }, ms);
        });
        work.then(
            (value) => {
                if (timedOut) onLate?.(value);
            },
            () => {}
        );
        try {
            return await Promise.race([work, timeout]);
        } finally {
            clearTimeout(timer);
        }
    }

    /**
     * G7 h: the re-snapshot after a reconnection runs in tx-builder's UtxoContext handle, whose trackAddresses() has no
     * bound of its own. If it has not finished within the snapshot bound, the watch says so (WALLET_WATCH_RESNAPSHOT_TIMEOUT,
     * logged): until it does, utxos() serves the view from before the disconnection and no event is reported.
     */
    private armResyncWatchdog(): void {
        if (this.resyncWatchdog !== undefined || this.closed) return;
        const ms = this.snapshotMs;
        this.resyncWatchdog = setTimeout(() => {
            this.resyncWatchdog = undefined;
            if (this.closed || !this.handle?.resyncing) return;
            const error = new HardkasError(
                "WALLET_WATCH_RESNAPSHOT_TIMEOUT",
                `WalletToolkit.watch: the re-snapshot after a reconnection to ${redactUrlCredentials(this.rpcUrl)} has not finished within ${ms / 1000} s. ` +
                    `Until it does, utxos() serves the view from before the disconnection and no event is reported.`,
                { metadata: { timeoutMs: ms } }
            );
            logger.error("Wallet watch re-snapshot is not finishing", { error, code: error.code });
            this.report(error);
        }, ms);
        (this.resyncWatchdog as { unref?: () => void }).unref?.();
    }

    private disarmResyncWatchdog(): void {
        if (this.resyncWatchdog !== undefined) clearTimeout(this.resyncWatchdog);
        this.resyncWatchdog = undefined;
    }

    add(listener: WalletWatchListener | AddressWatchListener): void {
        this.listeners.add(listener);
    }

    /** Removes a listener; returns how many remain. */
    remove(listener: WalletWatchListener | AddressWatchListener): number {
        this.listeners.delete(listener);
        return this.listeners.size;
    }

    utxos(): WalletWatchUtxo[] {
        const source = this.closed || !this.handle || this.handle.resyncing ? this.lastSeen : this.read();
        return [...source.values()];
    }

    balance(): { mature: bigint; pending: bigint; stasisCount: number } {
        const b = this.handle?.balance();
        return { mature: BigInt(b?.mature ?? 0), pending: BigInt(b?.pending ?? 0), stasisCount: this.stasisCount };
    }

    async stop(): Promise<void> {
        if (this.closed) return;
        this.closed = true;
        this.listeners.clear();
        this.disarmResyncWatchdog();
        try {
            // G7 h: the handle's stop() waits for a re-snapshot in flight; one that never settles would hold stop() (and
            // unwatch()) for ever, and the client would never be released. Bounded: the client is released either way.
            if (this.handle) await this.within(this.handle.stop(), this.requestMs, "stopping the watch (a re-snapshot was still in flight)");
        } finally {
            await this.rpc?.disconnect().catch(() => {});
        }
    }

    private read(): Map<string, WalletWatchUtxo> {
        const out = new Map<string, WalletWatchUtxo>();
        const h = this.handle;
        if (!h) return out;
        const lists: Array<[any[], WalletWatchUtxo["state"]]> = [
            [h.matureRange(0, h.matureLength()), "mature"],
            [h.pending(), "pending"]
        ];
        for (const [list, state] of lists) {
            for (const u of list) {
                const o = u?.outpoint ?? u?.entry?.outpoint;
                if (!o) continue;
                // kaspa-wasm puts a covenant's id on the reference's entry (UtxoEntry.covenantId)
                const covenantId = covenantIdOf(u);
                const utxo: WalletWatchUtxo = {
                    transactionId: String(o.transactionId),
                    index: Number(o.index),
                    amountSompi: BigInt(u.amount ?? 0),
                    state,
                    isCoinbase: Boolean(u.isCoinbase),
                    blockDaaScore: BigInt(u.blockDaaScore ?? 0),
                    ...(covenantId !== undefined ? { covenantId } : {})
                };
                out.set(keyOf(utxo), utxo);
            }
        }
        return out;
    }

    private onUpstream(event: any): void {
        if (this.closed || !this.handle) return;
        const type = event?.type;
        if (type === "balance") {
            this.stasisCount = Number(event.data?.balance?.stasisUtxoCount ?? 0);
            return;
        }
        if (type === "disconnect") {
            // Frozen until the reconnect's re-snapshot; later disconnects keep the first view.
            if (!this.beforeGap) this.beforeGap = this.handle.resyncing ? this.lastSeen : this.read();
            // A4: whatever answers next is unidentified until reverifyIdentity() names the same network again
            this.identityVerified = false;
            this.connection("disconnected");
            return;
        }
        if (type === "connect") {
            // G7 h: tx-builder's handle starts the re-snapshot on this same event (its listener comes first)
            if (this.handle.resyncing) this.armResyncWatchdog();
            this.connection("reconnected");
            return;
        }
        if (!LIVE.has(type) || this.beforeGap || this.handle.resyncing) return;
        const record = recordOf(event.data);
        const kind = String(record?.data?.type ?? "");
        // WATCH-CLI-1 (watchAddress only): received outputs that became mature
        if (type === "maturity" && this.options.reportMaturity === true && ADDED.has(kind)) {
            this.emitMaturity(record);
            return;
        }
        const direction = ADDED.has(kind) && type !== "maturity" ? "added" : REMOVED.has(kind) ? "removed" : null;
        if (!direction) return;
        const txid = String(record?.id ?? "");
        const entries: any[] = record?.data?.data?.utxoEntries ?? [];
        const outpoints = entries
            .map((u) => ({ transactionId: txid, index: Number(u.index), amountSompi: BigInt(u.amount ?? 0) }))
            .sort(byOutpoint);
        if (outpoints.length === 0) return;
        const dedupeKey = `${direction}|${txid}|${outpoints.map((o) => o.index).join(",")}`;
        if (this.reported.has(dedupeKey)) return;
        this.reported.add(dedupeKey);
        this.reportedOrder.push(dedupeKey);
        if (this.reportedOrder.length > DEDUPE_LIMIT) this.reported.delete(this.reportedOrder.shift()!);
        this.lastSeen = this.read();
        this.emit({
            type: "transaction",
            txid,
            details: direction === "added" ? { added: outpoints, removed: [] } : { added: [], removed: outpoints }
        });
    }

    private onResync(): void {
        this.disarmResyncWatchdog();
        if (this.closed || !this.handle || !this.identityVerified) return;
        const before = this.beforeGap ?? this.lastSeen;
        const now = this.read();
        this.beforeGap = null;
        this.lastSeen = now;
        const removed = [...before.values()].filter((u) => !now.has(keyOf(u))).map(outpointOf).sort(byOutpoint);
        const added = [...now.values()].filter((u) => !before.has(keyOf(u))).map(outpointOf).sort(byOutpoint);
        this.emit({ type: "resync", reason: "reconnect", removed, added });
    }

    /** WATCH-CLI-1 · the caller's connection hook (watchAddress), never allowed to throw into the engine. */
    private connection(state: "disconnected" | "reconnected"): void {
        try {
            this.options.onConnection?.(state);
        } catch {
            // the caller's hook failed: nothing else depends on it
        }
    }

    /** WATCH-CLI-1 · a `maturity` record of received outputs (reportMaturity), deduplicated like the live events. */
    private emitMaturity(record: any): void {
        const txid = String(record?.id ?? "");
        const entries: any[] = record?.data?.data?.utxoEntries ?? [];
        const matured = entries.map((u) => ({ transactionId: txid, index: Number(u.index), amountSompi: BigInt(u.amount ?? 0) })).sort(byOutpoint);
        if (matured.length === 0) return;
        const dedupeKey = `matured|${txid}|${matured.map((o) => o.index).join(",")}`;
        if (this.reported.has(dedupeKey)) return;
        this.reported.add(dedupeKey);
        this.reportedOrder.push(dedupeKey);
        if (this.reportedOrder.length > DEDUPE_LIMIT) this.reported.delete(this.reportedOrder.shift()!);
        this.lastSeen = this.read();
        this.emit({ type: "maturity", txid, details: { matured } });
    }

    private emit(event: AddressWatchEvent): void {
        for (const listener of [...this.listeners]) {
            try {
                const result = listener(event);
                if (result instanceof Promise) {
                    result.catch((error) => logger.error("Wallet watch listener failed", { error }));
                }
            } catch (error) {
                logger.error("Wallet watch listener failed", { error });
            }
        }
    }
}

/** WATCH-CLI-1 · what watchAddress returns. */
export interface AddressWatchHandle {
    /** Stops the watch and releases its client. */
    stop(): Promise<void>;
    /** The address's UTXOs (mature and pending) as the watch sees them now. */
    utxos(): WalletWatchUtxo[];
    balance(): { mature: bigint; pending: bigint; stasisCount: number };
    /** The network the node named. */
    readonly networkId: string;
}

/** The network type a Kaspa address prefix names. */
function prefixNetwork(address: string): "mainnet" | "testnet" | "simnet" | "devnet" | undefined {
    const prefix = String(address).split(":")[0]!.toLowerCase();
    return prefix === "kaspa" ? "mainnet" : prefix === "kaspatest" ? "testnet" : prefix === "kaspasim" ? "simnet" : prefix === "kaspadev" ? "devnet" : undefined;
}

const nodeNetworkType = (networkId: string) => {
    const n = String(networkId).toLowerCase().replace(/^kaspa-/, "");
    return n.startsWith("testnet") ? "testnet" : n.startsWith("simnet") ? "simnet" : n.startsWith("devnet") ? "devnet" : n.startsWith("mainnet") ? "mainnet" : n;
};

/**
 * WATCH-CLI-1 · watches ANY address (WalletToolkit.watch() watches its own wallet's) with the same engine: kaspa-wasm's
 * UtxoProcessor + UtxoContext, a re-snapshot (`resync`) after every reconnect, every reconnection identified again.
 * Refused before any connection: a mainnet address (MAINNET_CONNECTION_DISABLED). After the node's first answer: a node
 * that says mainnet (the engine's own refusal), a node of another network than `expectedNetworkId`
 * (WATCH_NODE_NETWORK_MISMATCH), an address of another network than the node's (WATCH_ADDRESS_NETWORK_MISMATCH); nothing
 * is tracked then. Events: `transaction` (outputs added or removed), `resync`, and `maturity` with `reportMaturity`.
 */
export async function watchAddress(
    rpcUrl: string,
    address: string,
    listener: AddressWatchListener,
    options: UtxoWatchEngineOptions & { expectedNetworkId?: string | undefined } = {}
): Promise<AddressWatchHandle> {
    const addressNetwork = prefixNetwork(address);
    if (addressNetwork === "mainnet" || isMainnetNetworkId(options.expectedNetworkId)) {
        throw mainnetConnectionDisabledError(`watchAddress: ${addressNetwork === "mainnet" ? `${address} is a mainnet address` : `network ${options.expectedNetworkId}`}; nothing was contacted`, {}, "identity-only");
    }
    if (addressNetwork === undefined) {
        throw new HardkasError("WATCH_ADDRESS_INVALID", `watchAddress: '${address}' is not a Kaspa address (kaspasim:, kaspatest:, kaspadev:). Nothing was contacted.`);
    }
    const { expectedNetworkId, ...engineOptions } = options;
    let engine: UtxoWatchEngine;
    engine = new UtxoWatchEngine(
        rpcUrl,
        async () => {
            // asked after the node named its network (mainnet already refused by the engine) and before anything is tracked
            const observed = String(engine.nodeNetworkId);
            if (expectedNetworkId !== undefined && observed.toLowerCase() !== String(expectedNetworkId).toLowerCase()) {
                throw new HardkasError(
                    "WATCH_NODE_NETWORK_MISMATCH",
                    `watchAddress: the node at ${redactUrlCredentials(rpcUrl)} says it serves ${observed}, not ${expectedNetworkId}. Nothing was tracked.`,
                    { metadata: { expected: expectedNetworkId, observed } }
                );
            }
            if (nodeNetworkType(observed) !== addressNetwork) {
                throw new HardkasError(
                    "WATCH_ADDRESS_NETWORK_MISMATCH",
                    `watchAddress: ${address} is a ${addressNetwork} address and the node at ${redactUrlCredentials(rpcUrl)} serves ${observed}. Nothing was tracked.`,
                    { metadata: { address, observed } }
                );
            }
            return address;
        },
        engineOptions
    );
    engine.add(listener);
    await engine.start();
    return {
        stop: () => engine.stop(),
        utxos: () => engine.utxos(),
        balance: () => engine.balance(),
        networkId: String(engine.nodeNetworkId)
    };
}
