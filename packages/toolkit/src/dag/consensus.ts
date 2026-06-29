import { LocalDagStore } from './store.js';
import { DAGTopology } from './topology.js';
import { DagBlock, DagStatistics } from './types.js';

export class ConsensusView {
    // Memoize calculated blue scores to prevent exponential recursion
    private blueScoreCache = new Map<string, number>();

    public constructor(
        private readonly store: LocalDagStore,
        private readonly topology: DAGTopology
    ) {}

    public clearCache(): void {
        this.blueScoreCache.clear();
    }

    public async blueScore(hash: string): Promise<number> {
        // If provided explicitly in the payload, use it
        const b = await this.topology.block(hash);
        if (b.blueScore !== undefined) {
            return b.blueScore;
        }

        if (this.blueScoreCache.has(hash)) {
            return this.blueScoreCache.get(hash)!;
        }

        if (b.parents.length === 0) {
            this.blueScoreCache.set(hash, 0);
            return 0;
        }

        let maxScore = 0;
        for (const p of b.parents) {
            try {
                const score = await this.blueScore(p);
                if (score > maxScore) maxScore = score;
            } catch (e) {
                // Ignore missing parents (orphans)
            }
        }

        const calculatedScore = maxScore + 1;
        this.blueScoreCache.set(hash, calculatedScore);
        return calculatedScore;
    }

    public async confirmations(hash: string): Promise<number> {
        const isOrphan = await this.isOrphan(hash);
        if (isOrphan) return 0;

        const allBlocks = this.store.getAllBlocks();
        const tips = allBlocks.filter(b => this.store.getChildrenHashes(b.hash).length === 0);
        
        if (tips.length === 0) return 0;

        let maxScore = -1;
        let heaviestTip: DagBlock | null = null;

        for (const tip of tips) {
            const score = await this.blueScore(tip.hash);
            if (score > maxScore) {
                maxScore = score;
                heaviestTip = tip;
            }
        }

        if (!heaviestTip) return 0;

        // Verify reachability: does the heaviest tip actually include this block in its past?
        const reachable = await this.topology.reachability(hash, heaviestTip.hash);
        if (!reachable) return 0;

        const blockScore = await this.blueScore(hash);
        return Math.max(0, maxScore - blockScore);
    }

    private async isOrphan(hash: string): Promise<boolean> {
        const b = this.store.getBlock(hash);
        if (!b) return false;
        if (b.parents.length === 0) return false;

        for (const p of b.parents) {
            if (!this.store.getBlock(p)) return true;
        }
        return false;
    }

    public async trace(txid: string): Promise<{ txid: string, status: string, foundIn: string[] }> {
        const allBlocks = this.store.getAllBlocks();
        const foundInBlocks: string[] = [];

        for (const block of allBlocks) {
            if (block.transactions && block.transactions.some(tx => tx.id === txid)) {
                foundInBlocks.push(block.hash);
            }
        }

        if (foundInBlocks.length === 0) {
            return { txid, status: "not_found", foundIn: [] };
        }

        if (foundInBlocks.length === 1) {
            const blockHash = foundInBlocks[0]!;
            const isOrphan = await this.isOrphan(blockHash);
            return { txid, status: isOrphan ? "orphan" : "accepted", foundIn: foundInBlocks };
        }

        // Parallel branch conflict detection
        let isConflict = false;
        for (let i = 0; i < foundInBlocks.length; i++) {
            for (let j = i + 1; j < foundInBlocks.length; j++) {
                const b1 = foundInBlocks[i]!;
                const b2 = foundInBlocks[j]!;
                
                const reach1 = await this.topology.reachability(b1, b2);
                const reach2 = await this.topology.reachability(b2, b1);

                if (!reach1 && !reach2) {
                    isConflict = true;
                    break;
                }
            }
        }

        return {
            txid,
            status: isConflict ? "conflict" : "merged",
            foundIn: foundInBlocks
        };
    }

    public async statistics(): Promise<DagStatistics> {
        const allBlocks = this.store.getAllBlocks();
        const tips = allBlocks.filter(b => this.store.getChildrenHashes(b.hash).length === 0);
        
        let highestBlueScore = 0;
        for (const b of allBlocks) {
            const score = await this.blueScore(b.hash);
            if (score > highestBlueScore) highestBlueScore = score;
        }

        return {
            totalBlocks: allBlocks.length,
            totalTips: tips.length,
            highestBlueScore
        };
    }
}
