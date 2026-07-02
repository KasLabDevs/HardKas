import { IndexerToolkit, WalletToolkit, JobsToolkit } from '@hardkas/toolkit';
import { BackendPlugin } from '@hardkas/core';
import fs from 'fs';
import path from 'path';
import { logger, metrics, tracer } from '@hardkas/observability';

metrics.register({
    name: "sync_daemon_cycles_total",
    help: "Total poll cycles executed by SyncDaemon",
    type: "counter"
});
metrics.register({
    name: "sync_daemon_blocks_processed_total",
    help: "Total new blocks processed by SyncDaemon",
    type: "counter"
});
metrics.register({
    name: "sync_daemon_errors_total",
    help: "Total errors encountered by SyncDaemon",
    type: "counter"
});

export interface SyncDaemonOptions {
    backend: BackendPlugin;
    indexer?: IndexerToolkit;
    wallets?: WalletToolkit[];
    jobs?: JobsToolkit;
    checkpointPath?: string;
    pollIntervalMs?: number;
}

export class SyncDaemon {
    private isRunning = false;
    private isShuttingDown = false;
    private lastProcessedBlueScore = 0n;
    private loopPromise?: Promise<void>;
    private shutdownResolver?: () => void;

    private readonly backend: BackendPlugin;
    private readonly indexer: IndexerToolkit | undefined;
    private readonly wallets: WalletToolkit[];
    private readonly jobs: JobsToolkit | undefined;
    private readonly checkpointPath: string;
    private readonly pollIntervalMs: number;

    private metrics = {
        cycles: 0,
        blocksProcessed: 0,
        utxoQueries: 0,
        errors: 0
    };

    private constructor(options: SyncDaemonOptions) {
        this.backend = options.backend;
        this.indexer = options.indexer;
        this.wallets = options.wallets || [];
        this.jobs = options.jobs;
        this.checkpointPath = options.checkpointPath || '.hardkas/sync.json';
        this.pollIntervalMs = options.pollIntervalMs || 1000;
        this.loadCheckpoint();
    }

    public static open(options: SyncDaemonOptions): SyncDaemon {
        return new SyncDaemon(options);
    }

    public async start(): Promise<void> {
        if (this.isRunning) return;
        this.isRunning = true;
        this.isShuttingDown = false;

        logger.info("SyncDaemon starting");

        if (!this.backend.capabilities.externalState) {
            logger.warn("SyncDaemon: Provided backend does not appear to connect to external state.");
        }

        this.loopPromise = this.pollLoop();
    }

    public async stop(): Promise<void> {
        if (!this.isRunning) return;
        this.isShuttingDown = true;
        
        if (this.loopPromise) {
            await new Promise<void>(resolve => {
                this.shutdownResolver = resolve;
            });
            await this.loopPromise;
        }

        this.isRunning = false;
    }

    public async status(): Promise<any> {
        return {
            isRunning: this.isRunning,
            lastProcessedBlueScore: this.lastProcessedBlueScore.toString(),
            metrics: { ...this.metrics }
        };
    }

    private loadCheckpoint() {
        if (fs.existsSync(this.checkpointPath)) {
            try {
                const data = JSON.parse(fs.readFileSync(this.checkpointPath, 'utf8'));
                if (data.blueScore) {
                    this.lastProcessedBlueScore = BigInt(data.blueScore);
                }
            } catch (e) {
                console.warn("SyncDaemon: Failed to read checkpoint, starting from 0");
            }
        }
    }

    private saveCheckpoint() {
        const dir = path.dirname(this.checkpointPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        const tempPath = `${this.checkpointPath}.tmp`;
        fs.writeFileSync(tempPath, JSON.stringify({
            blueScore: this.lastProcessedBlueScore.toString(),
            timestamp: new Date().toISOString()
        }));
        fs.renameSync(tempPath, this.checkpointPath);
    }

    private async pollLoop(): Promise<void> {
        while (!this.isShuttingDown) {
            const span = tracer.start("sync_daemon.cycle");
            try {
                // Ensure backend is connected
                if (this.backend.connect) {
                    // connect is idempotent in our plugins
                    await this.backend.connect();
                }

                // Polling logic requires access to raw client for blue score
                const client = (this.backend as any).client;
                if (!client) throw new Error("Backend does not expose Kaspa RPC client");

                const response = await client.request("getVirtualSelectedParentBlueScoreRequest", {});
                const currentBlueScore = BigInt(response.blueScore);

                if (currentBlueScore > this.lastProcessedBlueScore) {
                    const blockSpan = tracer.start("sync_daemon.process_blocks", { 
                        from: this.lastProcessedBlueScore.toString(),
                        to: currentBlueScore.toString()
                    });

                    // 1. We would fetch the blocks here
                    this.metrics.blocksProcessed++;
                    metrics.inc("sync_daemon_blocks_processed_total");
                    
                    if (this.indexer) {
                        await this.indexer.reload();
                    }
                    
                    // 2. Batch address extraction
                    const addrs = new Set<string>();
                    for (const w of this.wallets) {
                        addrs.add(await w.address());
                    }

                    // 3. Batch UTXO queries
                    for (const addr of addrs) {
                        try {
                            if ((this.backend as any).utxos) {
                                await (this.backend as any).utxos(addr);
                                this.metrics.utxoQueries++;
                            }
                        } catch (e: any) {
                            if (e.name !== 'HardkasRpcSemanticError') {
                                throw e; // Reraise structural errors
                            }
                        }
                    }

                    // 4. Trigger jobs reconciliation
                    if (this.jobs) {
                        await this.jobs.resumePendingJobs();
                    }

                    this.lastProcessedBlueScore = currentBlueScore;
                    this.saveCheckpoint();
                    blockSpan.end();
                }
                
                this.metrics.cycles++;
                metrics.inc("sync_daemon_cycles_total");
                span.end();

            } catch (err: any) {
                logger.error('SyncDaemon error', { error: err.message });
                span.fail(err);
                this.metrics.errors++;
                metrics.inc("sync_daemon_errors_total");
                // Silently absorb structural connection errors and wait longer to retry
                await new Promise(r => setTimeout(r, Math.max(5000, this.pollIntervalMs)));
                continue;
            }

            // Normal wait
            await new Promise(r => setTimeout(r, this.pollIntervalMs));
        }

        // Clean exit
        this.saveCheckpoint();
        if (this.shutdownResolver) this.shutdownResolver();
    }
}
