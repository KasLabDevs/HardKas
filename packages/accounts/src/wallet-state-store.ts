import * as fs from 'node:fs';
import * as path from 'node:path';

export interface WalletState {
    walletId: string;
    receiveIndex: number;
    changeIndex: number;
}

export interface WalletStateStoreOptions {
    /** 
     * The path to the JSON file where state is stored. 
     * If not provided, it defaults to `.hardkas/wallet-state.json` in the current working directory.
     */
    filePath?: string;
}

/**
 * A simple JSON-based state store for wallets.
 * This resolves the friction of keeping track of address derivation indices across CLI or local app sessions.
 */
export class WalletStateStoreJson {
    private readonly filePath: string;
    
    constructor(options?: WalletStateStoreOptions) {
        this.filePath = options?.filePath || path.join(process.cwd(), '.hardkas', 'wallet-state.json');
    }

    /**
     * Ensures the directory exists before saving.
     */
    private ensureDir() {
        const dir = path.dirname(this.filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    /**
     * Loads the entire state file into memory.
     */
    private loadAll(): Record<string, WalletState> {
        if (!fs.existsSync(this.filePath)) {
            return {};
        }
        try {
            return JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
        } catch (e) {
            process.stderr.write(`[WalletStateStore] corrupt state file at ${this.filePath} — resetting indices to 0. Cause: ${e}\n`);
            return {};
        }
    }

    /**
     * Saves the entire state file to disk.
     */
    private saveAll(data: Record<string, WalletState>) {
        this.ensureDir();
        const tmp = this.filePath + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
        fs.renameSync(tmp, this.filePath);
    }

    /**
     * Retrieves the state for a specific wallet.
     * If it doesn't exist, returns a default state starting at index 0.
     */
    public getWallet(walletId: string): WalletState {
        const data = this.loadAll();
        return data[walletId] || { walletId, receiveIndex: 0, changeIndex: 0 };
    }

    /**
     * Saves or overwrites the state for a specific wallet.
     */
    public saveWallet(wallet: WalletState): void {
        const data = this.loadAll();
        data[wallet.walletId] = wallet;
        this.saveAll(data);
    }

    /**
     * Atomically gets the next receive index and increments the state.
     */
    public nextReceiveIndex(walletId: string): number {
        const wallet = this.getWallet(walletId);
        const currentIndex = wallet.receiveIndex;
        wallet.receiveIndex += 1;
        this.saveWallet(wallet);
        return currentIndex;
    }

    /**
     * Atomically gets the next change index and increments the state.
     */
    public nextChangeIndex(walletId: string): number {
        const wallet = this.getWallet(walletId);
        const currentIndex = wallet.changeIndex;
        wallet.changeIndex += 1;
        this.saveWallet(wallet);
        return currentIndex;
    }
}
