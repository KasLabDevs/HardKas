export function rpcBlockToDagBlock(rpcBlock: any): any {
    if (!rpcBlock || !rpcBlock.header) {
        throw new Error("Invalid RpcBlock format");
    }

    // Kaspa RPC formats block numbers as numbers/strings, but we parse them to what HardKAS Toolkit expects natively.
    return {
        hash: rpcBlock.header.hash,
        parents: rpcBlock.header.parentsByLevel?.[0]?.parentHashes || [], // Simplified: Level 0 parents only
        blueScore: Number(rpcBlock.header.blueScore),
        timestamp: Number(rpcBlock.header.timestamp),
        transactions: rpcBlock.transactions?.map((tx: any) => ({ 
            id: tx.verboseData?.transactionId || tx.id,
            payload: tx.payload
        })) || []
    };
}
