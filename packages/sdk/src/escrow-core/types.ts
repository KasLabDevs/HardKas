import type { SilAbiArtifact, SilverCompileProvenance } from "@hardkas/core";

export interface EscrowParticipant {
    /** 32-byte x-only Schnorr public key, hex. */
    publicKeyHex: string;
}

export type EscrowMode = "full" | "split";
export type EscrowVersion = "v1" | "v2";

export interface EscrowConfig {
    buyer: EscrowParticipant;
    seller: EscrowParticipant;
    arbiter: EscrowParticipant;
    /** Script public key (without version) the refund pays. */
    buyerDestinationSpk: string;
    /** Script public key (without version) the release pays. */
    sellerDestinationSpk: string;

    /** Mode: "full" for single principal, "split" for pre-allocated dual amounts. Default: "full". */
    mode?: EscrowMode;
    /** Contract version: "v2" (default) or "v1" (legacy). */
    version?: EscrowVersion;

    /** For Full mode: total principal amount in sompi. */
    principal?: bigint | string;

    /** For Split mode: buyer's allocated amount in sompi. */
    buyerAmount?: bigint | string;
    /** For Split mode: seller's allocated amount in sompi. */
    sellerAmount?: bigint | string;

    /** Legacy compatibility: maps to principal or split amounts. */
    refundAmount?: bigint | string;
    releaseAmount?: bigint | string;

    /** Maximum allowed network fee budget for the spend in sompi (default 400_000). */
    feeBudgetSompi?: bigint | string;

    /** 32-byte random hex string ensuring unique P2SH address. Auto-generated if omitted. */
    escrowNonce?: string;
}

/** The SilverScript ABI artifact silverc produced for this escrow. */
export type EscrowArtifact = SilAbiArtifact;

/** Compile evidence for an escrow: the compiler's provenance plus the lock it yields. Digests only. */
export type EscrowCompileProvenance = SilverCompileProvenance & {
    readonly contractName: string;
    readonly lockingScriptHex: string;
    readonly contractVersion?: EscrowVersion;
    readonly escrowNonce?: string;
};

export interface EscrowState {
    lockingScriptHex: string;
    redeemScriptHex: string;
    /** P2SH address of the escrow on the network it was created for. */
    address: string;
}
