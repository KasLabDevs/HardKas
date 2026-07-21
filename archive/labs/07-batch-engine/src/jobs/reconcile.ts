import { JobRunner, ProgressReporter, JobCheckpoint, BatchCursor, RetryPolicy } from '../core/index.js';
import { ProjectionStoreJson } from '@hardkas/query-store';
import { ArtifactIndexStoreJson, EvidenceBatchExporter } from '@hardkas/artifacts';

export interface JobDependencies {
    projectionStore: ProjectionStoreJson;
    artifactIndex: ArtifactIndexStoreJson;
    evidenceExporter: EvidenceBatchExporter;
}

export function createReconcileJob(deps: JobDependencies) {
    return async (jobId: string, reporter: ProgressReporter, checkpoint: JobCheckpoint, startCursor?: any) => {
        reporter.setStatus('Loading merchants');
        // Stub: In reality we'd get all merchants from ProjectionStore
        const merchants = await deps.projectionStore.get('merchants') || { m1: { id: 'm1' }, m2: { id: 'm2' }, m3: { id: 'm3' }, m4: { id: 'm4' } };
        const merchantList = Object.keys(merchants);
        
        reporter.setTotal(merchantList.length);
        
        const cursor = new BatchCursor(merchantList, 2, startCursor || 0);
        
        const retry = new RetryPolicy({ maxRetries: 3, baseDelayMs: 100 });

        while (cursor.hasNext()) {
            const batch = cursor.nextBatch();
            
            for (const merchantId of batch) {
                await retry.execute(async () => {
                    // Reconcile logic:
                    // 1. Fetch from projection
                    const state = await deps.projectionStore.get(`merchant_state_${merchantId}`);
                    // 2. Query artifacts
                    const artifacts = await deps.artifactIndex.find({ tags: [`merchant:${merchantId}`] });
                    // 3. Export evidence
                    if (artifacts.length > 0) {
                        await deps.evidenceExporter.export({
                            name: `reconcile-${merchantId}`,
                            artifacts,
                            claims: { reconciled: true }
                        });
                    }
                });
                reporter.incSuccess();
            }

            // Save checkpoint
            await checkpoint.save({
                jobId,
                state: 'running',
                progress: reporter.toJSON(),
                cursor: cursor.getCursor(),
                updatedAt: new Date().toISOString()
            });

            // Artificial delay to simulate work and allow checkpointing to be visible
            await new Promise(r => setTimeout(r, 500));
        }
    };
}
