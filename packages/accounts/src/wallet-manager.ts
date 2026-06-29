import { createHash, randomUUID } from "node:crypto";
import type { NetworkType } from "./address-manager.js";

export interface WalletClaims {
    readonly productionCustody: false;
    readonly plaintextMnemonicStored: false;
    readonly hardwareWallet: false;
}

export interface WalletArtifact {
    readonly schema: string;
    readonly walletId: string;
    readonly seedRef: string;
    readonly keystoreRef: string;
    readonly network: NetworkType;
    readonly claims: WalletClaims;
}

export interface WalletCreateRequest {
    readonly walletId: string;
    readonly network?: NetworkType;
}

export interface WalletImportRequest {
    readonly walletId: string;
    readonly mnemonic: string;
    readonly network?: NetworkType;
}

export interface WalletMetadata {
    readonly walletId: string;
    readonly keystoreRef: string;
    readonly network: NetworkType;
    readonly createdAt: number;
}

interface WalletState {
    readonly seedRef: string;
    readonly keystoreRef: string;
    readonly metadata: WalletMetadata;
}

export class WalletManagerImpl {
    private wallets: Map<string, WalletState> = new Map();

    private validateNetwork(network: NetworkType | undefined): NetworkType {
        const net = network ?? "simnet";
        if (net === "mainnet") {
            throw new Error("WALLET_MANAGER_MAINNET_BLOCKED: mainnet custody is blocked by default in simulated v1.");
        }
        return net;
    }

    private generateSeedRef(mnemonic: string): string {
        // Hash the mnemonic so we never store the plaintext
        return "seedref_" + createHash("sha256").update(mnemonic).digest("hex").slice(0, 32);
    }

    public create(opts: WalletCreateRequest): WalletArtifact {
        const network = this.validateNetwork(opts.network);
        
        // Derive a fixture seed from walletId so each created wallet has a distinct seedRef
        const mockMnemonic = `dev-fixture:${opts.walletId}`;
        
        const seedRef = this.generateSeedRef(mockMnemonic);
        const keystoreRef = "keystore_" + randomUUID();
        
        const metadata: WalletMetadata = {
            walletId: opts.walletId,
            keystoreRef,
            network,
            createdAt: Date.now()
        };

        this.wallets.set(opts.walletId, { seedRef, keystoreRef, metadata });

        return {
            schema: "hardkas.walletCreated.v1",
            walletId: opts.walletId,
            seedRef,
            keystoreRef,
            network,
            claims: {
                productionCustody: false,
                plaintextMnemonicStored: false,
                hardwareWallet: false
            }
        };
    }

    public importMnemonic(opts: WalletImportRequest): WalletArtifact {
        const network = this.validateNetwork(opts.network);
        
        const seedRef = this.generateSeedRef(opts.mnemonic);
        const keystoreRef = "keystore_" + randomUUID();
        
        const metadata: WalletMetadata = {
            walletId: opts.walletId,
            keystoreRef,
            network,
            createdAt: Date.now()
        };

        this.wallets.set(opts.walletId, { seedRef, keystoreRef, metadata });

        return {
            schema: "hardkas.walletImported.v1",
            walletId: opts.walletId,
            seedRef,
            keystoreRef,
            network,
            claims: {
                productionCustody: false,
                plaintextMnemonicStored: false,
                hardwareWallet: false
            }
        };
    }

    public getSeedRef(walletId: string): string {
        const state = this.wallets.get(walletId);
        if (!state) throw new Error("Wallet not found");
        return state.seedRef;
    }

    public exportMetadata(walletId: string): WalletMetadata {
        const state = this.wallets.get(walletId);
        if (!state) throw new Error("Wallet not found");
        return state.metadata;
    }
}

export const WalletManager = new WalletManagerImpl();
