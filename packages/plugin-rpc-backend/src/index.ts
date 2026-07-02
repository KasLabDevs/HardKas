import { IndexerBackendPlugin } from '@hardkas/toolkit';
import { KaspaJsonRpcClient, KaspaWrpcClient } from '@hardkas/kaspa-rpc';
import { HardkasRpcSemanticError } from './errors.js';
import { ResilienceEngine, RpcResilienceOptions, RpcStats } from './resilience.js';

export * from './errors.js';
export * from './resilience.js';

export interface KaspaRpcBackendOptions {
    url: string;
    resilience?: RpcResilienceOptions;
}

export interface KaspaRpcBackendPlugin extends IndexerBackendPlugin {
    stats(): RpcStats;
}

export function kaspaRpcBackendPlugin(options: KaspaRpcBackendOptions): KaspaRpcBackendPlugin {
    const isWs = options.url.startsWith("ws://") || options.url.startsWith("wss://") || options.url.includes("18210") || options.url.includes("18110");
    const httpClient = isWs ? null : new KaspaJsonRpcClient({ url: options.url });
    const wsClient = isWs ? new KaspaWrpcClient(options.url) : null;
    const engine = new ResilienceEngine(options.resilience);
    let isConnected = false;
    let isShuttingDown = false;

    const reconnectWs = async () => {
        if (!wsClient || isShuttingDown) return;
        try {
            wsClient.disconnect();
            await wsClient.connect(5000);
            isConnected = true;
        } catch (e) {
            isConnected = false;
            throw e;
        }
    };

    return {
        name: "KaspaRpcBackend",
        type: "indexer-backend",
        capabilities: {
            snapshots: false,
            deterministic: false,
            externalState: true
        },
        stats() {
            return engine.stats;
        },
        async connect() {
            isShuttingDown = false;
            await engine.withRetry(async () => {
                if (wsClient) {
                    await wsClient.connect(5000);
                    isConnected = true;
                } else if (httpClient) {
                    await httpClient.healthCheck();
                }
            });
        },
        async disconnect() {
            isShuttingDown = true;
            if (wsClient) {
                wsClient.disconnect();
                isConnected = false;
            } else if (httpClient) {
                await httpClient.close();
            }
        },
        async balance(address: string): Promise<bigint> {
            return engine.withRetry(async () => {
                try {
                    if (wsClient) {
                        if (!isConnected) await reconnectWs();
                        const res: any = await wsClient.request("getBalanceByAddress", { address });
                        return BigInt(res.balance || 0);
                    } else if (httpClient) {
                        const response = await httpClient.getBalanceByAddress(address);
                        return response.balanceSompi;
                    }
                    return 0n;
                } catch (e: any) {
                    if (e?.message?.includes("request deserialization error") || e?.message?.includes("not have UTXO index")) {
                        throw new HardkasRpcSemanticError(`RPC Node at ${options.url} does not have UTXO index enabled. Expected for standard nodes. Error: ${e.message}`);
                    }
                    throw e;
                }
            }, isWs ? reconnectWs : undefined);
        },
        async history(address: string): Promise<unknown[]> {
            // Not directly supported by default Kaspa node RPC without an external indexer
            return [];
        },
        async utxos(address: string): Promise<unknown[]> {
            return engine.withRetry(async () => {
                try {
                    let entries: any[] = [];
                    if (wsClient) {
                        if (!isConnected) await reconnectWs();
                        const res: any = await wsClient.getUtxosByAddresses([address]);
                        entries = res.entries || [];
                    } else if (httpClient) {
                        entries = await httpClient.getUtxosByAddress(address);
                    }
                    
                    // Normalize amounts to BigInt before TxBuilder touches them
                    return entries.map((e: any) => {
                        if (e && e.utxoEntry && typeof e.utxoEntry.amount === "string") {
                            return {
                                ...e,
                                amountSompi: BigInt(e.utxoEntry.amount)
                            };
                        }
                        if (e && typeof e.amountSompi === "string") {
                            return { ...e, amountSompi: BigInt(e.amountSompi) };
                        }
                        return e;
                    });
                } catch (e: any) {
                    if (e?.message?.includes("request deserialization error") || e?.message?.includes("not have UTXO index")) {
                        throw new HardkasRpcSemanticError(`RPC Node at ${options.url} does not have UTXO index enabled. Expected for standard nodes. Error: ${e.message}`);
                    }
                    throw e;
                }
            }, isWs ? reconnectWs : undefined);
        }
    };
}
