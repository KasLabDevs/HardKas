import { ExplorerStore } from '../store/ExplorerStore.js';
import { SimulatedBlock } from '../fixture.js';

export class DAGService {
  constructor(private store: ExplorerStore) {}

  public getBlock(hash: string): SimulatedBlock | undefined {
    return this.store.get(hash);
  }

  // FRICTION: Easy to get parents if they exist in the block body
  public getParents(hash: string): SimulatedBlock[] {
    const block = this.store.get(hash);
    if (!block) throw new Error("Block not found");
    
    return block.parents.map(p => this.store.get(p)).filter(Boolean) as SimulatedBlock[];
  }

  // FRICTION: To get children, we must scan the entire store (O(N) operation)
  public getChildren(hash: string): SimulatedBlock[] {
    const allBlocks = this.store.getAll();
    return allBlocks.filter(b => b.parents.includes(hash));
  }

  // FRICTION: Recursive recalculation of Blue Score without a dedicated consensus layer
  public calculateBlueScore(hash: string): number {
    const block = this.store.get(hash);
    if (!block) throw new Error("Block not found");

    if (block.parents.length === 0) return 0; // Genesis

    let maxParentScore = 0;
    for (const parentHash of block.parents) {
      // If parent is missing, it's an orphan, we can't properly calculate score
      if (!this.store.get(parentHash)) continue;
      
      // Recursive call! This is extremely inefficient on a real DAG without caching.
      const score = this.calculateBlueScore(parentHash);
      if (score > maxParentScore) {
        maxParentScore = score;
      }
    }

    return maxParentScore + 1;
  }

  // FRICTION: Determining if a block is an orphan means checking if all parents exist
  public isOrphan(hash: string): boolean {
    const block = this.store.get(hash);
    if (!block) return false;
    if (block.parents.length === 0) return false; // Genesis is not an orphan

    for (const parentHash of block.parents) {
      if (!this.store.get(parentHash)) {
        return true; // Missing parent
      }
    }
    return false;
  }

  // FRICTION: Reachability - checking if block A is an ancestor of block B
  // Requires full DFS/BFS traversal
  public isAncestorOf(ancestorHash: string, descendantHash: string): boolean {
    if (ancestorHash === descendantHash) return true;
    
    const descendant = this.store.get(descendantHash);
    if (!descendant) return false;

    for (const parent of descendant.parents) {
      if (this.isAncestorOf(ancestorHash, parent)) return true;
    }
    return false;
  }

  // FRICTION: Calculating confirmations in a DAG is extremely complex without a Virtual block.
  // We have to find all tips (blocks with no children), pick the heaviest (highest blue score),
  // check if it reaches our block, and subtract scores.
  public getConfirmations(hash: string): number {
    if (this.isOrphan(hash)) return 0;

    const blockScore = this.calculateBlueScore(hash);
    
    // 1. Find tips (O(N^2) because getChildren is O(N))
    const allBlocks = this.store.getAll();
    const tips = allBlocks.filter(b => this.getChildren(b.hash).length === 0);
    
    if (tips.length === 0) return 0;

    // 2. Find heaviest tip (Virtual block approximation)
    let heaviestTip = tips[0];
    let maxScore = this.calculateBlueScore(heaviestTip.hash);

    for (const tip of tips) {
      const score = this.calculateBlueScore(tip.hash);
      if (score > maxScore) {
        maxScore = score;
        heaviestTip = tip;
      }
    }

    // 3. Ensure the heaviest tip actually reaches our block
    if (!this.isAncestorOf(hash, heaviestTip.hash)) {
      // The block is not in the selected chain/DAG topology of the virtual tip!
      return 0; 
    }

    return maxScore - blockScore;
  }
}
