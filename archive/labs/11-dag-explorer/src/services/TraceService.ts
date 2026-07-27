import { ExplorerStore } from '../store/ExplorerStore.js';
import { DAGService } from './DAGService.js';

export class TraceService {
  constructor(private store: ExplorerStore, private dagService: DAGService) {}

  // FRICTION: Tracing a transaction requires scanning all blocks (O(N))
  // and manually identifying conflicts if the TX exists in parallel branches.
  public traceTransaction(txId: string) {
    const allBlocks = this.store.getAll();
    const foundInBlocks = [];

    for (const block of allBlocks) {
      if (block.transactions.some(tx => tx.id === txId)) {
        foundInBlocks.push(block.hash);
      }
    }

    if (foundInBlocks.length === 0) {
      return { txId, foundIn: [], status: "not_found" };
    }

    if (foundInBlocks.length === 1) {
      const blockHash = foundInBlocks[0];
      return { 
        txId, 
        foundIn: [blockHash], 
        status: this.dagService.isOrphan(blockHash) ? "orphan" : "accepted",
        confirmations: this.dagService.getConfirmations(blockHash)
      };
    }

    // FRICTION: The transaction exists in multiple blocks!
    // We must determine if this is just a merged tx or a real conflict (double spend across parallel branches).
    // A simplistic conflict detection: if none of the blocks are ancestors of each other, they are parallel.
    let isConflict = false;
    for (let i = 0; i < foundInBlocks.length; i++) {
      for (let j = i + 1; j < foundInBlocks.length; j++) {
        const b1 = foundInBlocks[i];
        const b2 = foundInBlocks[j];
        
        const b1AncestorsB2 = this.dagService.isAncestorOf(b1, b2);
        const b2AncestorsB1 = this.dagService.isAncestorOf(b2, b1);

        // If neither is an ancestor of the other, they are on parallel branches
        if (!b1AncestorsB2 && !b2AncestorsB1) {
          isConflict = true;
          break;
        }
      }
    }

    return {
      txId,
      foundIn: foundInBlocks,
      status: isConflict ? "conflict" : "merged",
      // In Kaspa, only the first block in the selected chain actually accepts the TX.
      // Calculating which one is the "accepted" one manually is a nightmare.
      confirmations: "unknown - requires consensus validation"
    };
  }
}
