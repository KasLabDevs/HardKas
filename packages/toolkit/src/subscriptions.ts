import { KaspaRpcClient } from "@hardkas/kaspa-rpc";
import { logger } from "@hardkas/observability";

export interface WalletSubscriptionEvent {
    type: "transaction";
    txid: string;
    details?: any;
}

export type WalletWatchHandler = (event: WalletSubscriptionEvent) => void | Promise<void>;

export class WalletSubscriptionManager {
    private seenTxIds = new Set<string>();
    private txIdQueue: string[] = []; // Simple LRU tracking
    private readonly MAX_DEDUPE_CACHE = 1000;
    
    // Maintain a list of handlers per address
    private handlers = new Set<WalletWatchHandler>();
    private activeRpcSubscription?: { unsubscribe: () => Promise<void> } | undefined;

    constructor(private rpc: KaspaRpcClient, private getAddress: () => Promise<string>) {}

    public async watch(handler: WalletWatchHandler): Promise<{ unwatch: () => Promise<void> }> {
        this.handlers.add(handler);

        // If this is the first handler, spin up the underlying RPC subscription
        if (this.handlers.size === 1 && !this.activeRpcSubscription) {
             const addr = await this.getAddress();
             
             const subscription = await this.rpc.subscribeToUtxosChanged([addr], (data) => {
                 this.handleRawUtxosChanged(data);
             });
             
             this.activeRpcSubscription = {
                 unsubscribe: async () => {
                     await subscription.unsubscribe();
                 }
             };
        }

        return {
            unwatch: async () => {
                this.handlers.delete(handler);
                if (this.handlers.size === 0 && this.activeRpcSubscription) {
                    await this.activeRpcSubscription.unsubscribe().catch(() => {});
                    this.activeRpcSubscription = undefined;
                }
            }
        };
    }

    private handleRawUtxosChanged(data: any) {
        // Data usually has 'added' and 'removed' arrays containing KaspaRpcUtxo
        const added = data?.added || data?.utxosAdded || [];
        const removed = data?.removed || data?.utxosRemoved || [];
        
        // Extract all unique txids from this event
        const incomingTxids = new Set<string>();

        const extractTxid = (utxos: any[]) => {
            for (const u of utxos) {
                const txid = u?.outpoint?.transactionId || u?.outpoint?.transaction_id || u?.outpoint?.txId;
                if (txid) {
                    incomingTxids.add(txid);
                }
            }
        };

        extractTxid(added);
        extractTxid(removed);

        for (const txid of incomingTxids) {
            if (this.seenTxIds.has(txid)) {
                logger.debug("WalletSubscriptionManager deduplicated event", { txid });
                continue;
            }

            // Mark as seen
            this.seenTxIds.add(txid);
            this.txIdQueue.push(txid);
            if (this.txIdQueue.length > this.MAX_DEDUPE_CACHE) {
                const oldest = this.txIdQueue.shift();
                if (oldest) this.seenTxIds.delete(oldest);
            }

            // Dispatch to all wallet-level handlers
            const event: WalletSubscriptionEvent = {
                type: "transaction",
                txid,
                details: data
            };

            for (const handler of this.handlers) {
                try {
                    // Safe execution
                    const res = handler(event);
                    if (res instanceof Promise) {
                        res.catch(err => {
                            logger.error("Wallet watch async handler threw error", { error: err });
                        });
                    }
                } catch (err) {
                    logger.error("Wallet watch sync handler threw error", { error: err });
                }
            }
        }
    }
}
