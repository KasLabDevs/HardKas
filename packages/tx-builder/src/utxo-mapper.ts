import { Utxo } from "./index.js";

/**
 * A flattened UTXO interface matching what query stores typically return.
 */
export interface FlatUtxo {
    transactionId: string;
    outputIndex: number;
    amountSompi: bigint;
    scriptPublicKey: string;
    address?: string;
}

/**
 * Maps a flattened UTXO from WalletQuery (or similar APIs) into the hierarchical Utxo format required by TxBuilder.
 */
export function toTxBuilderUtxo(utxo: FlatUtxo, addressOverride?: string): Utxo {
    return {
        outpoint: {
            transactionId: utxo.transactionId,
            index: utxo.outputIndex
        },
        address: addressOverride || utxo.address || "",
        amountSompi: utxo.amountSompi,
        scriptPublicKey: utxo.scriptPublicKey
    };
}

/**
 * Maps a hierarchical TxBuilder Utxo back into a flattened format.
 */
export function toWalletQueryUtxo(utxo: Utxo): FlatUtxo {
    return {
        transactionId: utxo.outpoint.transactionId,
        outputIndex: utxo.outpoint.index,
        amountSompi: utxo.amountSompi,
        scriptPublicKey: utxo.scriptPublicKey,
        address: utxo.address
    };
}
