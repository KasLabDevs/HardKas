import { EscrowState } from "./types.js";
export declare function buildResolutionTx(artifactPath: string, state: EscrowState, utxo: any, destinationSpk: string, amount: bigint, entrypoint: "mutualRelease" | "refundBuyer" | "releaseToSeller", signatures: string[]): Promise<any>;
//# sourceMappingURL=resolution.d.ts.map