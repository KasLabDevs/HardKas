import { EventSubscriber, BackendPlugin, HardkasError } from '@hardkas/core';
import { ProjectionStoreJson } from '@hardkas/query-store';
import { ArtifactIndexStoreJson, checkArtifactIdentity } from '@hardkas/artifacts';
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

export type WatchHandler = (evt: any) => Promise<void> | void;

export class IndexerToolkit implements SnapshotParticipant {
    private static inactiveWatchWarned = false;
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

    public async watch(address: string | string[], handler?: WatchHandler): Promise<void> {
        const addresses = Array.isArray(address) ? address : [address];
        // rc2 audit (E-03): this used to poll a placeholder source (`source: {}`) every second forever: nothing was
        // ever watched, and the timer kept the process alive. Without a backend that can list UTXOs there is nothing
        // to poll, so no timer is started and the caller is told once.
        const backend = this.backend;
        if (!backend?.utxos) {
            if (!IndexerToolkit.inactiveWatchWarned) {
                IndexerToolkit.inactiveWatchWarned = true;
                process.emitWarning(
                    "IndexerToolkit.watch(): no backend that lists UTXOs is configured, so nothing is watched. " +
                        "Open the indexer with a backend that implements utxos(address), or use WalletToolkit.watch() for a node.",
                    { code: "HARDKAS_INDEXER_WATCH_INACTIVE" }
                );
            }
            return;
        }
        const source = {
            getUtxos: async (watched: string[]) => {
                const entries = await Promise.all(
                    watched.map(async (a) => {
                        const listed = (await backend.utxos!(a)) as any[];
                        return [
                            a,
                            listed.map((u) => ({
                                transactionId: u?.transactionId ?? u?.outpoint?.transactionId,
                                outputIndex: u?.outputIndex ?? u?.index ?? u?.outpoint?.index,
                                amountSompi: u?.amountSompi ?? u?.amount
                            }))
                        ] as const;
                    })
                );
                return { ok: true, utxos: Object.fromEntries(entries) };
            }
        };
        this.subscriber.subscribe({
            source,
            type: "payment",
            intervalMs: 1000,
            watchedAddresses: addresses,
            handler: async (evt) => {
                // Internally updates projections if address is involved
                if (handler) {
                    await handler(evt);
                }
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

    public async utxos(address: string): Promise<any[]> {
        if (this.backend?.utxos) {
            return this.backend.utxos(address);
        }
        const utxos = this.projection?.get('utxos') || {};
        return utxos[address] || [];
    }

    public async findReceipts(opts: { tags: string[] }): Promise<any[]> {
        if (!this.artifactIndex) return [];
        return this.artifactIndex.find(opts);
    }

    /**
     * Indexes a HardKAS artifact under its content hash. E-03 (rc2 audit): the artifact must carry a real content hash
     * that its content verifies (`checkArtifactIdentity`); anything else is refused (INDEXER_ARTIFACT_IDENTITY_INVALID)
     * and nothing is indexed. It used to index any object under `artifact.id || 'mock_hash'` with the invented path
     * `/mock/path/<id>.json`. `options.filePath` is where the artifact is stored, when the caller knows it (else empty);
     * `options.tags` (else the artifact's own `tags`) are the tags `findReceipts` matches.
     */
    public async ingestArtifact(artifact: any, options: { filePath?: string; tags?: string[] } = {}): Promise<void> {
        const check = checkArtifactIdentity(artifact ?? {});
        if (!check.ok) {
            throw new HardkasError(
                "INDEXER_ARTIFACT_IDENTITY_INVALID",
                `IndexerToolkit.ingestArtifact() indexes a HardKAS artifact under its verified content hash; this one has none ` +
                    `(${check.issues.map((i) => `${i.code}: ${i.message}`).join("; ")}). Nothing was indexed.`,
                { metadata: { issues: check.issues.map((i) => i.code) } }
            );
        }
        if (!this.artifactIndex) return;
        this.artifactIndex.index({
            hash: check.artifactId,
            schema: typeof artifact.schema === 'string' ? artifact.schema : 'unknown.v1',
            timestamp: new Date().toISOString(),
            filePath: typeof options.filePath === 'string' ? options.filePath : '',
            tags: options.tags ?? (Array.isArray(artifact.tags) ? artifact.tags : [])
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
