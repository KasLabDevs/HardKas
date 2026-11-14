import { loadManagedKaspaWasmSync, isMainnetNetworkId, mainnetConnectionDisabledError, redactUrlCredentials } from '@hardkas/core';
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
// The first connection is bounded like kaspa-rpc's default request timeout; reconnects are not.
const CONNECT_TIMEOUT_MS = 30_000;

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
    private readonly listeners = new Set<WalletWatchListener>();
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

    constructor(private readonly rpcUrl: string, private readonly getAddress: () => Promise<string>) {}

    async start(): Promise<void> {
        const k: any = loadManagedKaspaWasmSync();
        // Its own client, with kaspa-wasm's default Retry strategy, so the processor sees every
        // disconnect and reconnect and the context re-snapshots after each one.
        this.rpc = new k.RpcClient({ url: this.rpcUrl, encoding: k.Encoding.SerdeJson });
        try {
            await this.connectWithin(CONNECT_TIMEOUT_MS);
            const { networkId } = await this.rpc.getServerInfo();
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
            const handle = await createUtxoContext({ wasmRpc: this.rpc, networkId, addresses: [address], beforeResnapshot: () => this.reverifyIdentity() });
            this.handle = handle;
            this.lastSeen = this.read();
            handle.processor.addEventListener((event: any) => this.onUpstream(event));
            handle.onResync(() => this.onResync());
            handle.onError((error) => logger.error("Wallet watch re-snapshot failed; the next reconnect retries", { error }));
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
        // a failure here (the connection went away again) refuses this re-snapshot too; the next reconnect asks again
        const observed: unknown = (await this.rpc.getServerInfo())?.networkId;
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

    add(listener: WalletWatchListener): void {
        this.listeners.add(listener);
    }

    /** Removes a listener; returns how many remain. */
    remove(listener: WalletWatchListener): number {
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
        try {
            await this.handle?.stop();
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
            return;
        }
        if (!LIVE.has(type) || this.beforeGap || this.handle.resyncing) return;
        const record = recordOf(event.data);
        const kind = String(record?.data?.type ?? "");
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
        if (this.closed || !this.handle || !this.identityVerified) return;
        const before = this.beforeGap ?? this.lastSeen;
        const now = this.read();
        this.beforeGap = null;
        this.lastSeen = now;
        const removed = [...before.values()].filter((u) => !now.has(keyOf(u))).map(outpointOf).sort(byOutpoint);
        const added = [...now.values()].filter((u) => !before.has(keyOf(u))).map(outpointOf).sort(byOutpoint);
        this.emit({ type: "resync", reason: "reconnect", removed, added });
    }

    private emit(event: WalletWatchEvent): void {
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
