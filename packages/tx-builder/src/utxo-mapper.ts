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
    /** COVENANT-UTXO-PAYMENT-FILTER-1: kept so the planner can leave a covenant's UTXO out. */
    covenantId?: string;
    /** HK-10: kept so the planners can leave an immature coinbase out. */
    isCoinbase?: boolean;
    blockDaaScore?: bigint | number | string;
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
        scriptPublicKey: utxo.scriptPublicKey,
        ...(utxo.covenantId ? { covenantId: utxo.covenantId } : {}),
        // HK-10: a coinbase stays a coinbase (the maturity filters read these; dropping them made every UTXO look mature)
        ...(utxo.isCoinbase !== undefined ? { isCoinbase: Boolean(utxo.isCoinbase) } : {}),
        ...(utxo.blockDaaScore !== undefined && utxo.blockDaaScore !== null ? { blockDaaScore: BigInt(utxo.blockDaaScore) } : {})
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
        address: utxo.address,
        ...(utxo.covenantId ? { covenantId: utxo.covenantId } : {}),
        ...(utxo.isCoinbase !== undefined ? { isCoinbase: utxo.isCoinbase } : {}),
        ...(utxo.blockDaaScore !== undefined ? { blockDaaScore: utxo.blockDaaScore } : {})
    };
}
