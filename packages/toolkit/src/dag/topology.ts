import { LocalDagStore } from './store.js';
import { DagBlock, DagNeighborhood } from './types.js';

export class DAGTopology {
    constructor(private store: LocalDagStore) {}

    public async block(hash: string): Promise<DagBlock> {
        const b = this.store.getBlock(hash);
        if (!b) throw new Error(`Block not found: ${hash}`);
        return b;
    }

    public async parents(hash: string): Promise<DagBlock[]> {
        const b = await this.block(hash);
        return b.parents.map(p => this.store.getBlock(p)).filter(Boolean) as DagBlock[];
    }

    public async children(hash: string): Promise<DagBlock[]> {
        // Fast lookup via index instead of O(N) scan
        const childrenHashes = this.store.getChildrenHashes(hash);
        return childrenHashes.map(c => this.store.getBlock(c)).filter(Boolean) as DagBlock[];
    }

    public async reachability(fromHash: string, toHash: string): Promise<boolean> {
        if (fromHash === toHash) return true;
        
        const toBlock = this.store.getBlock(toHash);
        if (!toBlock) return false;

        // DFS for reachability
        const visited = new Set<string>();
        const stack = [toHash];

        while (stack.length > 0) {
            const current = stack.pop()!;
            if (current === fromHash) return true;
            if (visited.has(current)) continue;
            visited.add(current);

            const b = this.store.getBlock(current);
            if (b) {
                for (const p of b.parents) {
                    stack.push(p);
                }
            }
        }

        return false;
    }

    public async neighborhood(hash: string, opts: { depth?: number } = {}): Promise<DagNeighborhood> {
        const maxDepth = opts.depth || 1;
        const baseBlock = await this.block(hash);

        const ancestors = new Map<string, DagBlock>();
        const descendants = new Map<string, DagBlock>();

        // BFS for Ancestors
        let aQueue = [{ hash, currentDepth: 0 }];
        let aVisited = new Set<string>([hash]);
        
        while (aQueue.length > 0) {
            const { hash: curr, currentDepth } = aQueue.shift()!;
            if (currentDepth >= maxDepth) continue;

            const b = this.store.getBlock(curr);
            if (!b) continue;

            for (const p of b.parents) {
                if (!aVisited.has(p)) {
                    aVisited.add(p);
                    const parentBlock = this.store.getBlock(p);
                    if (parentBlock) {
                        ancestors.set(p, parentBlock);
                        aQueue.push({ hash: p, currentDepth: currentDepth + 1 });
                    }
                }
            }
        }

        // BFS for Descendants
        let dQueue = [{ hash, currentDepth: 0 }];
        let dVisited = new Set<string>([hash]);

        while (dQueue.length > 0) {
            const { hash: curr, currentDepth } = dQueue.shift()!;
            if (currentDepth >= maxDepth) continue;

            const children = this.store.getChildrenHashes(curr);
            for (const c of children) {
                if (!dVisited.has(c)) {
                    dVisited.add(c);
                    const childBlock = this.store.getBlock(c);
                    if (childBlock) {
                        descendants.set(c, childBlock);
                        dQueue.push({ hash: c, currentDepth: currentDepth + 1 });
                    }
                }
            }
        }

        return {
            hash,
            ancestors: Array.from(ancestors.values()),
            descendants: Array.from(descendants.values())
        };
    }
}
