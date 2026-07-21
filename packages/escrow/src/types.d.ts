export interface EscrowParticipant {
    publicKeyHex: string;
}
export interface EscrowConfig {
    buyer: EscrowParticipant;
    seller: EscrowParticipant;
    arbiter: EscrowParticipant;
    buyerDestinationSpk: string;
    sellerDestinationSpk: string;
    refundAmount: bigint;
    releaseAmount: bigint;
}
export interface EscrowArtifact {
    abi: any[];
    script: number[];
}
export interface EscrowState {
    lockingScriptHex: string;
    redeemScriptHex: string;
}
//# sourceMappingURL=types.d.ts.map