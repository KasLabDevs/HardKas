import type { SilAbiArtifact, SilverCompileProvenance } from "@hardkas/core";

export interface EscrowParticipant {
    /** 32-byte x-only Schnorr public key, hex. */
    publicKeyHex: string;
}

export interface EscrowConfig {
    buyer: EscrowParticipant;
    seller: EscrowParticipant;
    arbiter: EscrowParticipant;
    /** Script public key (without version) the refund pays. */
    buyerDestinationSpk: string;
    /** Script public key (without version) the release pays. */
    sellerDestinationSpk: string;
    refundAmount: bigint | string;
    releaseAmount: bigint | string;
}

/** The SilverScript ABI artifact silverc produced for this escrow. */
export type EscrowArtifact = SilAbiArtifact;

/** Compile evidence for an escrow: the compiler's provenance plus the lock it yields. Digests only. */
export type EscrowCompileProvenance = SilverCompileProvenance & {
    readonly contractName: "Escrow";
    readonly lockingScriptHex: string;
};

export interface EscrowState {
    lockingScriptHex: string;
    redeemScriptHex: string;
    /** P2SH address of the escrow on the network it was created for. */
    address: string;
}
