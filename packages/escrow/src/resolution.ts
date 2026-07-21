import { EscrowState, EscrowArtifact } from "./types.js";
// We import sighash signer dynamically or it should be injected.
// In a full implementation, this package would rely on @hardkas/sdk for building unlocking scripts

export async function buildResolutionTx(
    artifactPath: string,
    state: EscrowState,
    utxo: any,
    destinationSpk: string,
    amount: bigint,
    entrypoint: "mutualRelease" | "refundBuyer" | "releaseToSeller",
    signatures: string[]
): Promise<any> {
    const tx = {
        version: 0,
        inputs: [{ 
            previousOutpoint: { transactionId: utxo.outpoint.transactionId, index: utxo.outpoint.index }, 
            signatureScript: "", 
            sequence: 0, 
            sigOpCount: 2 
        }],
        outputs: [{ 
            amount: Number(amount), 
            scriptPublicKey: { version: 0, scriptPublicKey: destinationSpk } 
        }],
        lockTime: 0, 
        subnetworkId: "0000000000000000000000000000000000000000", 
        gas: 0, 
        payload: ""
    };

    // The actual integration with SilverScript via @hardkas/core or hardkas tool
    // We mock this slightly since @hardkas/escrow encapsulates the domain rules.
    // In production, `hardkas.experimental.silver.buildUnlock` would be used here.

    return tx;
}
