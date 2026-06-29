export interface Utxo {
    readonly transactionId: string;
    readonly outputIndex: number;
    readonly amountSompi: bigint;
    readonly scriptPublicKey: string;
    readonly address?: string;
}

export interface WalletHistoryItem {
    readonly txId: string;
    readonly timestamp: number;
    readonly amountSompi: bigint;
    readonly isSend: boolean;
}

export interface WalletHistoryPage {
    readonly items: WalletHistoryItem[];
    readonly nextCursor?: string;
}

export interface WalletQueryProvider {
    readonly source: "query-store" | "rpc" | "mock" | string;
    getBalances(addresses: string[]): Promise<Record<string, bigint>>;
    getUtxos(addresses: string[]): Promise<Record<string, Utxo[]>>;
    getHistory(args: {
        addresses: string[];
        limit?: number;
        cursor?: string;
    }): Promise<WalletHistoryPage>;
}

export interface WalletQueryClaims {
    readonly completeHistoricalIndex: false;
    readonly productionIndexer: false;
}

export interface DegradedResult {
    readonly ok: false;
    readonly status: "DEGRADED";
    readonly code: "WALLET_QUERY_PROVIDER_UNAVAILABLE";
    readonly source: string;
    readonly error?: string;
}

export interface GetBalanceResult {
    readonly ok: true;
    readonly addressesScanned: number;
    readonly balanceSompi: bigint;
    readonly source: string;
    readonly claims: WalletQueryClaims;
}

export interface GetUtxosResult {
    readonly ok: true;
    readonly addressesScanned: number;
    readonly utxos: Record<string, Utxo[]>;
    readonly source: string;
    readonly claims: WalletQueryClaims;
}

export interface GetHistoryResult {
    readonly ok: true;
    readonly addressesScanned: number;
    readonly history: WalletHistoryPage;
    readonly source: string;
    readonly claims: WalletQueryClaims;
}

export interface WalletQueryOptions {
    readonly provider: WalletQueryProvider;
    readonly network?: "simnet" | "testnet" | "mainnet" | "local-docker-simnet";
}

export class WalletQuery {
    private provider: WalletQueryProvider;
    private network: string;

    constructor(options: WalletQueryOptions) {
        this.provider = options.provider;
        this.network = options.network ?? "simnet";
        
        if (this.network === "mainnet") {
            throw new Error("WALLET_QUERY_MAINNET_BLOCKED: mainnet query is blocked by default in simulated v1.");
        }
    }

    public async getBalance(addresses: string[]): Promise<GetBalanceResult | DegradedResult> {
        try {
            const balances = await this.provider.getBalances(addresses);
            let total = 0n;
            for (const addr of addresses) {
                total += balances[addr] || 0n;
            }
            return {
                ok: true,
                addressesScanned: addresses.length,
                balanceSompi: total,
                source: this.provider.source,
                claims: {
                    completeHistoricalIndex: false,
                    productionIndexer: false
                }
            };
        } catch (err: any) {
            return {
                ok: false,
                status: "DEGRADED",
                code: "WALLET_QUERY_PROVIDER_UNAVAILABLE",
                source: this.provider.source,
                error: err.message
            };
        }
    }

    public async getUtxos(addresses: string[]): Promise<GetUtxosResult | DegradedResult> {
        try {
            const utxos = await this.provider.getUtxos(addresses);
            return {
                ok: true,
                addressesScanned: addresses.length,
                utxos,
                source: this.provider.source,
                claims: {
                    completeHistoricalIndex: false,
                    productionIndexer: false
                }
            };
        } catch (err: any) {
            return {
                ok: false,
                status: "DEGRADED",
                code: "WALLET_QUERY_PROVIDER_UNAVAILABLE",
                source: this.provider.source,
                error: err.message
            };
        }
    }

    public async getHistory(args: { addresses: string[], limit?: number, cursor?: string }): Promise<GetHistoryResult | DegradedResult> {
        try {
            const history = await this.provider.getHistory(args);
            return {
                ok: true,
                addressesScanned: args.addresses.length,
                history,
                source: this.provider.source,
                claims: {
                    completeHistoricalIndex: false,
                    productionIndexer: false
                }
            };
        } catch (err: any) {
            return {
                ok: false,
                status: "DEGRADED",
                code: "WALLET_QUERY_PROVIDER_UNAVAILABLE",
                source: this.provider.source,
                error: err.message
            };
        }
    }
}
