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
     */
    public async send(walletId: string, toAddress: string, amount: number): Promise<any> {
        // FRICTION:
        // 1. Fetch all UTXOs (Still missing query store)
        const utxos: any[] = await this.getUtxos(walletId);
        
        // 2. Select UTXOs (RESOLVED with hk.coinSelector)
        // We use a mock `hk` here to demonstrate how it is used from the SDK.
        const hkTx = await import('@hardkas/tx-builder');
        const hkAcc = await import('@hardkas/accounts');
        const hk = { 
            coinSelector: { select: hkTx.selectCoins },
            addressManager: hkAcc.AddressManager,
            walletManager: hkAcc.WalletManager
        };
        
        const wallet = this.wallets.get(walletId);
        if (!wallet) throw new Error("Wallet not found");

        const seedRef = hk.walletManager.getSeedRef(wallet.id);
        const changeIndex = wallet.nextChangeIndex++;
        const changeAddr = hk.addressManager.deriveChange({
            seedRef,
            accountIndex: 0,
            addressIndex: changeIndex
        });
        
        const selection = hk.coinSelector.select({
            utxos,
            targetSompi: BigInt(amount),
            feeRateSompiPerMass: 1n,
            strategy: "largest-first",
            changeAddress: changeAddr.address,
            dustThresholdSompi: 100n
        });

        // 3. Estimate fees (RESOLVED partially, CoinSelector includes basic estimation)
        // 4. Build Tx (Maybe HardKAS has tx-builder)
        // 5. Sign Tx (HardKAS signing)
        // 6. Broadcast Tx
        return {
            status: "plan_created",
            plan: selection
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
     */
    public async estimateFee(walletId: string, toAddress: string, amount: number): Promise<any> {
        // FRICTION: (RESOLVED with hk.feeEstimator)
        // We simulate how it would be called from the SDK
        const hk = { feeEstimator: { estimate: (await import('@hardkas/tx-builder')).estimateFee } };
        
        // In a real scenario we'd use the selected UTXOs count and outputs.
        // For estimation without full coin selection, we can make assumptions.
        // Assuming 1 input for simplicity if we don't do full coin selection first.
        // Or we could run selectCoins first. The prompt implies we use feeEstimator directly here.
        const estimation = hk.feeEstimator.estimate({
            inputs: 1, // Assumption for basic estimation endpoint
            outputs: [{ address: toAddress, amountSompi: amount }],
            feeRateSompiPerMass: 1n,
            hasChange: true, // Typically wallets will have change
            policy: "conservative"
        });

        return estimation;
    }
}
