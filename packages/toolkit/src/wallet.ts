import { WalletManagerImpl, WalletStateStoreJson, AddressManager } from '@hardkas/accounts';
import { WalletQuery } from '@hardkas/query';
import { selectCoins, estimateFee, buildPaymentPlan } from '@hardkas/tx-builder';
import { WalletUtxoApi } from './utxos.js';
import { UtxoControlStore } from './stores/utxo-control-store.js';

export interface WalletToolkitOptions {
    storePath?: string;
    network?: "simnet" | "testnet" | "mainnet";
}

export class WalletToolkit {
    private walletManager: WalletManagerImpl;
    private addressManager: typeof AddressManager;
    private walletQuery: WalletQuery;

    private _utxosApi: WalletUtxoApi;

    private constructor(
        public readonly name: string,
        private readonly store: WalletStateStoreJson,
        private readonly options: WalletToolkitOptions
    ) {
        this.walletManager = new WalletManagerImpl();
        this.addressManager = AddressManager;
        this.walletQuery = new WalletQuery({} as any);
        
        const utxoControlPath = options.storePath 
            ? options.storePath.replace('.json', '-utxo-control.json')
            : 'default-utxo-control.json';
        const utxoStore = new UtxoControlStore(utxoControlPath);

        this._utxosApi = new WalletUtxoApi(
            async () => (await this.walletQuery.getUtxos([await this.address()])) as any,
            async () => this.address(),
            async (inputs: number, outputs: number) => BigInt(inputs * 1000 + outputs * 1000), // Dummy fee estimation
            utxoStore
        );
    }

    public static open(name: string, options: WalletToolkitOptions = {}): WalletToolkit {
        const store = new WalletStateStoreJson({ filePath: options.storePath || 'default.json' });
        return new WalletToolkit(name, store, options);
    }

    public async create(): Promise<void> {
        this.walletManager.create({ walletId: this.name });
    }

    public async address(): Promise<string> {
        // High level facade: gets receive address
        const seedRef = this.walletManager.getSeedRef(this.name);
        return this.addressManager.derive({ 
            seedRef, 
            accountIndex: 0,
            chain: 'receive', 
            addressIndex: 0, 
            network: this.options.network || 'simnet' 
        }).address;
    }

    public async balance(): Promise<bigint> {
        const addr = await this.address();
        return (await this.walletQuery.getBalance([addr])) as any;
    }

    public get utxos(): WalletUtxoApi {
        return this._utxosApi;
    }

    public async history(): Promise<any[]> {
        const addr = await this.address();
        return (await this.walletQuery.getHistory({ addresses: [addr] })) as any;
    }

    public async estimateFee(opts: { to: string; amount: bigint }): Promise<any> {
        const u = await this.utxos.list();
        // Since we are mocking the facade, just return a fake fee
        return {
            selectedUtxos: [],
            fee: 1000n,
            totalOut: BigInt(opts.amount) + 1000n
        };
    }

    public async planSend(opts: { to: string; amount: bigint }): Promise<any> {
        return {};
    }

    public async sendSimulated(opts: { to: string; amount: bigint }): Promise<string> {
        return `simulated_tx_${Date.now()}`;
    }
}
