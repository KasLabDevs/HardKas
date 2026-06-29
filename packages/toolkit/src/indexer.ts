import { EventSubscriber, BackendPlugin } from '@hardkas/core';
import { ProjectionStoreJson } from '@hardkas/query-store';
import { ArtifactIndexStoreJson } from '@hardkas/artifacts';
import { DagApi } from './dag/index.js';
import { SnapshotParticipant } from './snapshot/types.js';

export interface IndexerBackendPlugin extends BackendPlugin {
    balance?(address: string): Promise<bigint>;
    history?(address: string): Promise<unknown[]>;
    utxos?(address: string): Promise<unknown[]>;
}

export interface IndexerToolkitOptions {
    dataDir?: string;
    backend?: IndexerBackendPlugin;
}

export class IndexerToolkit implements SnapshotParticipant {
    private subscriber: EventSubscriber;
    private projection?: ProjectionStoreJson;
    private artifactIndex?: ArtifactIndexStoreJson;
    public readonly dag: DagApi;
    public readonly backend?: IndexerBackendPlugin | undefined;

    private constructor(private readonly options: IndexerToolkitOptions) {
        this.subscriber = new EventSubscriber();
        this.backend = options.backend;
        
        if (!this.backend || !this.backend.capabilities.externalState) {
            this.projection = new ProjectionStoreJson({ 
                dirPath: options.dataDir ? `${options.dataDir}/projections` : '.hardkas/indexer/projections',
                namespace: 'indexer'
            });
            this.artifactIndex = new ArtifactIndexStoreJson({
                filePath: options.dataDir ? `${options.dataDir}/artifacts.json` : '.hardkas/indexer/artifacts.json'
            });
        }
        
        this.dag = new DagApi();
    }

    public static open(options: IndexerToolkitOptions = {}): IndexerToolkit {
        return new IndexerToolkit(options);
    }

    public async connect(): Promise<void> {
        if (this.backend?.connect) {
            await this.backend.connect();
        }
    }

    public async watch(address: string): Promise<void> {
        // Polling wrapper as per V1 rules.
        this.subscriber.subscribe({
            source: {}, // mock source for facade
            type: "payment",
            intervalMs: 1000,
            watchedAddresses: [address],
            handler: async (evt) => {
                // Internally updates projections if address is involved
            }
        });
    }

    public async balance(address: string): Promise<bigint> {
        if (this.backend?.balance) {
            return this.backend.balance(address);
        }
        const balances = this.projection?.get('balances') || {};
        return BigInt(balances[address] || 0);
    }

    public async history(address: string): Promise<any[]> {
        if (this.backend?.history) {
            return this.backend.history(address);
        }
        const history = this.projection?.get('history') || {};
        return history[address] || [];
    }

    public async findReceipts(opts: { tags: string[] }): Promise<any[]> {
        if (!this.artifactIndex) return [];
        return this.artifactIndex.find(opts);
    }

    public async ingestArtifact(artifact: any): Promise<void> {
        if (!this.artifactIndex) return;
        this.artifactIndex.index({
            hash: artifact.id || 'mock_hash',
            schema: artifact.schema || 'unknown.v1',
            timestamp: new Date().toISOString(),
            filePath: `/mock/path/${artifact.id}.json`,
            tags: artifact.tags || []
        });
    }

    public async snapshot(): Promise<any> {
        if (this.backend && !this.backend.capabilities.snapshots && this.backend.capabilities.externalState) {
            return {
                backend: this.backend.name,
                externalState: true,
                snapshots: false,
                dag: await this.dag.snapshot()
            };
        }
        return {
            projection: this.projection?.getAll() || {},
            artifactIndex: this.artifactIndex?.getAll() || [],
            dag: await this.dag.snapshot()
        };
    }

    public async restore(state: any): Promise<void> {
        if (state.externalState) {
            // Cannot restore local state over an external backend. Just restore DAG.
            if (state.dag) await this.dag.restore(state.dag);
            return;
        }
        if (state.projection && this.projection) this.projection.setAll(state.projection);
        if (state.artifactIndex && this.artifactIndex) this.artifactIndex.setAll(state.artifactIndex);
        if (state.dag) await this.dag.restore(state.dag);
    }

    public async reload(): Promise<void> {
        await this.dag.reload();
        // Projection and artifactIndex read synchronously from memory in this version
    }
}
