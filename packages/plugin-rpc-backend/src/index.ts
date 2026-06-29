import { IndexerBackendPlugin } from '@hardkas/toolkit';
import { KaspaJsonRpcClient, KaspaWrpcClient } from '@hardkas/kaspa-rpc';

export interface KaspaRpcBackendOptions {
    url: string;
}

export function kaspaRpcBackendPlugin(options: KaspaRpcBackendOptions): IndexerBackendPlugin {
    const isWs = options.url.startsWith("ws://") || options.url.startsWith("wss://") || options.url.includes("18210") || options.url.includes("18110");
    const httpClient = isWs ? null : new KaspaJsonRpcClient({ url: options.url });
    const wsClient = isWs ? new KaspaWrpcClient(options.url) : null;

    return {
        name: "KaspaRpcBackend",
        type: "indexer-backend",
        capabilities: {
            snapshots: false,
            deterministic: false,
            externalState: true
        },
        async connect() {
            if (wsClient) {
                await wsClient.connect(5000);
            } else if (httpClient) {
                await httpClient.healthCheck();
            }
        },
        async disconnect() {
            if (wsClient) {
                wsClient.disconnect();
            } else if (httpClient) {
                await httpClient.close();
            }
        },
        async balance(address: string): Promise<bigint> {
            try {
                if (wsClient) {
                    const res: any = await wsClient.request("getBalanceByAddress", { address });
                    return BigInt(res.balance || 0);
                } else if (httpClient) {
                    const response = await httpClient.getBalanceByAddress(address);
                    return response.balanceSompi;
                }
                return 0n;
            } catch (e: any) {
                if (e?.message?.includes("request deserialization error") || e?.message?.includes("not have UTXO index")) {
                    throw new Error(`RPC Node at ${options.url} does not have UTXO index enabled. Expected for standard nodes. Error: ${e.message}`);
                }
                throw e;
            }
        },
        async history(address: string): Promise<unknown[]> {
            // Not directly supported by default Kaspa node RPC without an external indexer
            return [];
        },
        async utxos(address: string): Promise<unknown[]> {
            try {
                if (wsClient) {
                    const res: any = await wsClient.getUtxosByAddresses([address]);
                    return res.entries || [];
                } else if (httpClient) {
                    const response = await httpClient.getUtxosByAddress(address);
                    return response;
                }
                return [];
            } catch (e: any) {
                if (e?.message?.includes("request deserialization error") || e?.message?.includes("not have UTXO index")) {
                    throw new Error(`RPC Node at ${options.url} does not have UTXO index enabled. Expected for standard nodes. Error: ${e.message}`);
                }
                throw e;
            }
        }
    };
}
