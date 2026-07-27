import { DagBlock } from '@hardkas/toolkit';

/**
 * Normalizes a raw Kaspa RPC Block to the format expected by LocalDagStore.
 * 
 * Typically, an RPC Block from kaspa-wasm or JSON-RPC looks like:
 * {
 *   header: {
 *     hash: string;
 *     parents: Array<{ parentHashes: string[] }>;
 *     blueScore: bigint | number;
 *   },
 *   transactions: Array<any>
 * }
 */
export class DagRpcBlockAdapter {
  static normalize(rpcBlock: any): DagBlock {
    // Determine the hash
    const hash = rpcBlock.header?.hash || rpcBlock.verboseData?.hash || rpcBlock.hash;
    
    // Resolve parents
    let parents: string[] = [];
    if (rpcBlock.header?.parents) {
      for (const p of rpcBlock.header.parents) {
        if (p.parentHashes) {
          parents.push(...p.parentHashes);
        }
      }
    } else if (rpcBlock.verboseData?.parentHashes) {
      parents = rpcBlock.verboseData.parentHashes;
    }

    // Determine blue score
    let blueScore = 0;
    if (rpcBlock.header?.blueScore !== undefined) {
      blueScore = Number(rpcBlock.header.blueScore);
    } else if (rpcBlock.verboseData?.blueScore !== undefined) {
      blueScore = Number(rpcBlock.verboseData.blueScore);
    }

    // Determine transactions
    const transactions = (rpcBlock.transactions || []).map((tx: any) => ({
      id: tx.verboseData?.transactionId || tx.id || 'unknown',
      payload: tx.payload || tx.payloadHex || ''
    }));

    return {
      hash,
      parents,
      blueScore,
      transactions,
      raw: rpcBlock // Retain original for potential further use
    };
  }
}
