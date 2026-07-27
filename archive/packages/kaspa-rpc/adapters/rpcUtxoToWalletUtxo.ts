export function rpcUtxoToWalletUtxo(rpcUtxo: any): any {
    if (!rpcUtxo) {
        throw new Error("Invalid RpcUtxo format");
    }

    return {
        outpoint: {
            transactionId: rpcUtxo.outpoint?.transactionId,
            index: rpcUtxo.outpoint?.index
        },
        entry: {
            amount: rpcUtxo.utxoEntry?.amount,
            scriptPublicKey: rpcUtxo.utxoEntry?.scriptPublicKey,
            blockDaaScore: rpcUtxo.utxoEntry?.blockDaaScore,
            isCoinbase: rpcUtxo.utxoEntry?.isCoinbase
        }
    };
}
