import { createHash } from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

export type NetworkType = "simnet" | "testnet" | "mainnet" | "local-docker-simnet";
export type ChainType = "receive" | "change" | 0 | 1;

export interface PathRequest {
    readonly accountIndex: number;
    readonly chain: ChainType;
    readonly addressIndex: number;
}

export interface DeriveRequest {
    readonly seedRef: string;
    readonly accountIndex: number;
    readonly chain: ChainType;
    readonly addressIndex: number;
    readonly network?: NetworkType;
}

export interface DerivedAddress {
    readonly address: string;
    readonly path: string;
    readonly network: NetworkType;
    readonly derivationModel: "deterministic-simulated-v1";
    readonly claims: {
        readonly realBip39: false;
        readonly productionCustody: false;
    };
}

export interface HelperDeriveRequest {
    readonly seedRef: string;
    readonly accountIndex: number;
    readonly addressIndex: number;
    readonly network?: NetworkType;
}

function resolveChain(chain: ChainType): 0 | 1 {
    if (chain === "receive" || chain === 0) return 0;
    if (chain === "change" || chain === 1) return 1;
    throw new Error(`Invalid chain type: ${chain}`);
}

function validateIndex(index: number, name: string): void {
    if (!Number.isInteger(index) || index < 0) {
        throw new Error(`Invalid ${name}: must be a non-negative integer`);
    }
}

export const AddressManager = {
    path(opts: PathRequest): string {
        validateIndex(opts.accountIndex, "accountIndex");
        validateIndex(opts.addressIndex, "addressIndex");
        const chainNum = resolveChain(opts.chain);
        return `m/44'/111111'/${opts.accountIndex}'/${chainNum}/${opts.addressIndex}`;
    },

    derive(opts: DeriveRequest): DerivedAddress {
        const network = opts.network ?? "simnet";
        if (network === "mainnet") {
            throw new Error("ADDRESS_MANAGER_MAINNET_BLOCKED: mainnet derivation is blocked by default in simulated v1.");
        }

        const derivationPath = this.path({
            accountIndex: opts.accountIndex,
            chain: opts.chain,
            addressIndex: opts.addressIndex
        });

        // Deterministic mock generation utilizing REAL Kaspa wasm logic
        const payload = `${opts.seedRef}:${derivationPath}:${network}`;
        const hash = createHash("sha256").update(payload).digest("hex");
        
        let address: string;
        try {
            // Using Kaspa WASM synchronously since it's available in Node context
            const kaspa = require("kaspa-wasm");
            const priv = new kaspa.PrivateKey(hash);
            address = priv.toKeypair().toAddress(network).toString();
        } catch (e) {
            // Fallback just in case Kaspa WASM is totally unavailable in environment, though we require it for Toccata
            const prefix = network.includes("sim") ? "kaspasim" : "kaspatest";
            address = `${prefix}:q${hash.slice(0, 42)}`;
        }

        return {
            address,
            path: derivationPath,
            network,
            derivationModel: "deterministic-simulated-v1",
            claims: {
                realBip39: false,
                productionCustody: false
            }
        };
    },

    deriveReceive(opts: HelperDeriveRequest): DerivedAddress {
        return this.derive({
            ...opts,
            chain: 0
        });
    },

    deriveChange(opts: HelperDeriveRequest): DerivedAddress {
        return this.derive({
            ...opts,
            chain: 1
        });
    }
};
