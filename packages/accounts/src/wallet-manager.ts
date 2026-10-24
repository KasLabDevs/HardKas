import { createHash, randomUUID } from "node:crypto";
import { assertSyntheticDerivationNetwork, type NetworkType } from "./address-manager.js";

export interface WalletClaims {
    readonly productionCustody: false;
    readonly plaintextMnemonicStored: false;
    readonly hardwareWallet: false;
    /** WALLET-HD-0: this is NOT a BIP39 wallet; nothing here recovers or is recoverable as a Kaspa wallet. */
    readonly realBip39: false;
}

export interface WalletArtifact {
    readonly schema: string;
    readonly walletId: string;
    readonly seedRef: string;
    readonly keystoreRef: string;
    readonly network: NetworkType;
    /** WALLET-HD-0: the synthetic model, named so that no consumer mistakes it for a real derivation. */
    readonly derivationModel: "deterministic-simulated-v1";
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

const CLAIMS: WalletClaims = {
    productionCustody: false,
    plaintextMnemonicStored: false,
    hardwareWallet: false,
    realBip39: false
};

/**
 * SYNTHETIC wallet registry, simnet only (WALLET-HD-0), in memory (nothing is persisted; `keystoreRef` points to no
 * file). `create()` derives `seedRef` from the PUBLIC walletId, so every key of such a wallet is computable by anyone
 * who knows the walletId; `importMnemonic()` hashes whatever text it is given, without BIP39 validation, and derives
 * nothing compatible with any Kaspa wallet. Both refuse every network but the local simnet
 * (`SYNTHETIC_DERIVATION_NETWORK_BLOCKED`; mainnet keeps `WALLET_MANAGER_MAINNET_BLOCKED`). Simnet behaviour and
 * addresses are unchanged.
 * @deprecated for anything but simnet development fixtures; real custody is `accounts real generate` (random key,
 * encrypted keystore), and a BIP39/BIP32 gen1 wallet is a separate, future batch.
 */
export class WalletManagerImpl {
    private wallets: Map<string, WalletState> = new Map();

    private validateNetwork(network: NetworkType | undefined): NetworkType {
        const net = network ?? "simnet";
        if (net === "mainnet") {
            throw new Error("WALLET_MANAGER_MAINNET_BLOCKED: mainnet custody is blocked by default in simulated v1.");
        }
        // WALLET-HD-0: fail closed on every network that is not the local simnet (by name, never by prefix)
        assertSyntheticDerivationNetwork(net, "WalletManager");
        return net;
    }

    private generateSeedRef(mnemonic: string): string {
        // Hash the mnemonic so we never store the plaintext
        return "seedref_" + createHash("sha256").update(mnemonic).digest("hex").slice(0, 32);
    }

    /**
     * Registers a synthetic wallet whose `seedRef` is derived from the PUBLIC walletId (no secret involved): a simnet
     * development fixture. Refused outside simnet.
     */
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
            derivationModel: "deterministic-simulated-v1",
            claims: CLAIMS
        };
    }

    /**
     * NOT BIP39 recovery (WALLET-HD-0): the text is hashed into a `seedRef` without wordlist or checksum validation,
     * and the addresses derived from it belong to no Kaspa wallet. Simnet only.
     */
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
            derivationModel: "deterministic-simulated-v1",
            claims: CLAIMS
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
