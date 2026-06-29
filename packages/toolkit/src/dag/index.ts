import { LocalDagStore } from './store.js';
import { DAGTopology } from './topology.js';
import { ConsensusView } from './consensus.js';
import { DagBlock, DagNeighborhood, DagStatistics } from './types.js';

export * from './types.js';

export class DagApi {
    private store: LocalDagStore;
    private topology: DAGTopology;
    private consensus: ConsensusView;

    constructor() {
        this.store = new LocalDagStore();
        this.topology = new DAGTopology(this.store);
        this.consensus = new ConsensusView(this.store, this.topology);
    }

    public async ingestBlocks(blocks: DagBlock[]): Promise<void> {
        this.store.ingest(blocks);
    }

    public async snapshot(): Promise<DagBlock[]> {
        return this.store.getAllBlocks();
    }

    public async restore(blocks: DagBlock[]): Promise<void> {
        this.store.clear();
        this.store.ingest(blocks);
    }

    public async reload(): Promise<void> {
        this.consensus.clearCache();
    }

    // Topology
    public async block(hash: string): Promise<DagBlock> {
        return this.topology.block(hash);
    }

    public async parents(hash: string): Promise<DagBlock[]> {
        return this.topology.parents(hash);
    }

    public async children(hash: string): Promise<DagBlock[]> {
        return this.topology.children(hash);
    }

    public async reachability(fromHash: string, toHash: string): Promise<boolean> {
        return this.topology.reachability(fromHash, toHash);
    }

    public async neighborhood(hash: string, opts: { depth?: number } = {}): Promise<DagNeighborhood> {
        return this.topology.neighborhood(hash, opts);
    }

    // Consensus
    public async blueScore(hash: string): Promise<number> {
        return this.consensus.blueScore(hash);
    }

    public async confirmations(hash: string): Promise<number> {
        return this.consensus.confirmations(hash);
    }

    public async trace(txid: string): Promise<{ txid: string, status: string, foundIn: string[] }> {
        return this.consensus.trace(txid);
    }

    public async statistics(): Promise<DagStatistics> {
        return this.consensus.statistics();
    }
}
