import { DagBlock } from './types.js';

export class LocalDagStore {
    private blocks = new Map<string, DagBlock>();
    
    // Reverse index to avoid O(N) children scans
    private childrenIndex = new Map<string, Set<string>>();

    public ingest(blocksToIngest: DagBlock[]): void {
        for (const block of blocksToIngest) {
            this.blocks.set(block.hash, block);

            // Update children index
            for (const parent of block.parents) {
                if (!this.childrenIndex.has(parent)) {
                    this.childrenIndex.set(parent, new Set());
                }
                this.childrenIndex.get(parent)!.add(block.hash);
            }
        }
    }

    public getBlock(hash: string): DagBlock | undefined {
        return this.blocks.get(hash);
    }

    public getChildrenHashes(hash: string): string[] {
        const children = this.childrenIndex.get(hash);
        return children ? Array.from(children) : [];
    }

    public getAllBlocks(): DagBlock[] {
        return Array.from(this.blocks.values());
    }

    public clear(): void {
        this.blocks.clear();
        this.childrenIndex.clear();
    }
}
