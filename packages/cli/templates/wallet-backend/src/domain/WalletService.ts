import { randomUUID } from 'node:crypto';

export interface Wallet {
    id: string;
    mnemonic: string;
    createdAt: number;
    nextReceiveIndex: number;
    nextChangeIndex: number;
}

export interface Address {
    walletId: string;
    address: string;
    pathIndex: number;
}

export class WalletService {
    private wallets: Map<string, Wallet> = new Map();
    private addresses: Map<string, Address[]> = new Map();

    constructor() {}

    /**
     * POST /wallets
     */
    public async createWallet(): Promise<Wallet> {
        // FRICTION: (RESOLVED with hk.walletManager)
        const hk = { walletManager: (await import('@hardkas/accounts')).WalletManager };
        
        const id = randomUUID();
        // Generates the wallet in SDK (simulated) and returns safe artifacts
        const artifact = hk.walletManager.create({ walletId: id, network: "simnet" });
        
        const createdAt = Date.now();
        const wallet: Wallet = { 
            id, 
            mnemonic: "REDACTED", // Never stored
            createdAt,
            nextReceiveIndex: 0,
            nextChangeIndex: 0
        };
        this.wallets.set(id, wallet);
        this.addresses.set(id, []);
        
        return wallet;
    }

    /**
     * POST /wallets/:id/address
     */
    public async generateAddress(walletId: string): Promise<Address> {
        // FRICTION: (RESOLVED with hk.addressManager)
        const wallet = this.wallets.get(walletId);
        if (!wallet) throw new Error("Wallet not found");

        const hk = { 
            addressManager: (await import('@hardkas/accounts')).AddressManager,
            walletManager: (await import('@hardkas/accounts')).WalletManager 
        };
        
        const nextIndex = wallet.nextReceiveIndex++;
        const seedRef = hk.walletManager.getSeedRef(wallet.id);
        
        const derived = hk.addressManager.deriveReceive({
            seedRef,
            accountIndex: 0, // Default account 0
            addressIndex: nextIndex
        });

        const newAddr = { walletId, address: derived.address, pathIndex: nextIndex };
        const addrs = this.addresses.get(walletId) || [];
        addrs.push(newAddr);
        this.addresses.set(walletId, addrs);

        return newAddr;
    }

    /**
     * GET /wallets/:id/balance
     */
    public async getBalance(walletId: string): Promise<bigint> {
        // FRICTION: (RESOLVED with hk.walletQuery)
        const hkQuery = await import('@hardkas/query');
        const hk = { 
            walletQuery: new hkQuery.WalletQuery({ 
                provider: { 
                    source: "mock", 
                    getBalances: async () => ({}), 
                    getUtxos: async () => ({}), 
                    getHistory: async () => ({ items: [] }) 
                } 
            }) 
        };
        const addresses = this.addresses.get(walletId) || [];
        
        const result = await hk.walletQuery.getBalance(addresses.map(a => a.address));
        if (!result.ok) {
            console.warn(`WalletQuery Degraded: ${result.code}`);
            return 0n;
        }
        return result.balanceSompi;
    }

    /**
     * GET /wallets/:id/utxos
     */
    public async getUtxos(walletId: string): Promise<any[]> {
        // FRICTION: (RESOLVED with hk.walletQuery)
        const hkQuery = await import('@hardkas/query');
        const hk = { 
            walletQuery: new hkQuery.WalletQuery({ 
                provider: { 
                    source: "mock", 
                    getBalances: async () => ({}), 
                    getUtxos: async () => ({}), 
                    getHistory: async () => ({ items: [] }) 
                } 
            }) 
        };
        const addresses = this.addresses.get(walletId) || [];
        
        const result = await hk.walletQuery.getUtxos(addresses.map(a => a.address));
        if (!result.ok) {
            console.warn(`WalletQuery Degraded: ${result.code}`);
            return [];
        }
        // Flatten grouped utxos
        return Object.values(result.utxos).flat();
    }

    /**
     * GET /wallets/:id/history
     */
    public async getHistory(walletId: string): Promise<any[]> {
        // FRICTION: (RESOLVED with hk.walletQuery)
        const hkQuery = await import('@hardkas/query');
        const hk = { 
            walletQuery: new hkQuery.WalletQuery({ 
                provider: { 
                    source: "mock", 
                    getBalances: async () => ({}), 
                    getUtxos: async () => ({}), 
                    getHistory: async () => ({ items: [] }) 
                } 
            }) 
        };
        const addresses = this.addresses.get(walletId) || [];
        
        const result = await hk.walletQuery.getHistory({ addresses: addresses.map(a => a.address), limit: 10 });
        if (!result.ok) {
            console.warn(`WalletQuery Degraded: ${result.code}`);
            return [];
        }
        return result.history.items;
    }

    /**
     * POST /wallets/:id/send
     *
     * Uses the KaspaWalletAdapter (M10) — kaspa-wasm 2.0.1 `Generator` for coin
     * selection, mass and fee computation. No HardKAS-invented selection.
     */
    public async send(walletId: string, toAddress: string, amount: bigint | number): Promise<any> {
        const wallet = this.wallets.get(walletId);
        if (!wallet) throw new Error("Wallet not found");

        // 1. Fetch UTXOs owned by this wallet. In a real backend, source them from
        //    UtxoContext.track_addresses(...) (also exposed by the same adapter).
        const utxos: any[] = await this.getUtxos(walletId);

        // 2. Resolve the change address. In a real backend, derive it via a
        //    proper HD wallet (BIP32/BIP39). This template uses the wallet's
        //    receiving address as a placeholder.
        const changeAddress = (wallet as any).primaryAddress ?? (utxos[0]?.address);
        if (!changeAddress) throw new Error("Wallet has no address to receive change");

        // 3. Plan transactions via upstream Generator (no HardKAS-invented selector).
        const { buildTransactions } = await import('@hardkas/tx-builder');
        const network = (wallet as any).networkId ?? "simnet";

        // 4. Iterate the Generator; each yielded PendingTransaction can be signed
        //    with `pt.sign([privateKey])` and submitted with `pt.submit(rpc)`.
        const plans: any[] = [];
        for await (const pt of buildTransactions({
            networkId: network,
            entries: utxos,
            outputs: [{ address: toAddress, amount: BigInt(amount) }],
            changeAddress
        })) {
            plans.push({
                id: pt.id,
                mass: pt.mass,
                feeAmount: pt.feeAmount,
                aggregateInputAmount: pt.aggregateInputAmount,
                aggregateOutputAmount: pt.aggregateOutputAmount
            });
        }

        return {
            status: "plan_created",
            transactions: plans
        };
    }

    /**
     * POST /wallets/:id/sign
     */
    public async sign(walletId: string, txId: string): Promise<any> {
        // For cases where tx is built externally and just needs signing.
        return {};
    }

    /**
     * POST /wallets/:id/estimate-fee
     *
     * Uses upstream `Generator.estimate()` (via `estimateTransactionsUpstream`
     * in `@hardkas/tx-builder`) — no HardKAS-invented +10% padding, no
     * hardcoded fee-rate default.
     */
    public async estimateFee(walletId: string, toAddress: string, amount: bigint | number): Promise<any> {
        const wallet = this.wallets.get(walletId);
        if (!wallet) throw new Error("Wallet not found");

        const utxos: any[] = await this.getUtxos(walletId);
        const changeAddress = (wallet as any).primaryAddress ?? (utxos[0]?.address);
        if (!changeAddress) throw new Error("Wallet has no address to receive change");

        const { estimateTransactionsUpstream } = await import('@hardkas/tx-builder');
        const network = (wallet as any).networkId ?? "simnet";

        const summary = await estimateTransactionsUpstream({
            networkId: network,
            entries: utxos,
            outputs: [{ address: toAddress, amount: BigInt(amount) }],
            changeAddress
        });

        return {
            fees: summary.fees,
            mass: summary.mass,
            transactions: summary.transactions,
            utxos: summary.utxos,
            finalTransactionId: summary.finalTransactionId,
            finalAmount: summary.finalAmount
        };
    }
}
