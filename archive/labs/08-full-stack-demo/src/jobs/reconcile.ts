import { ProgressReporter, JobCheckpoint, BatchCursor, RetryPolicy } from '../core/index.js';
import { ProjectionStoreJson } from '@hardkas/query-store';
import { ArtifactIndexStoreJson, EvidenceBatchExporter } from '@hardkas/artifacts';

export interface JobDependencies {
    projectionStore: ProjectionStoreJson;
    artifactIndex: ArtifactIndexStoreJson;
    evidenceExporter: EvidenceBatchExporter;
}

export function createReconcileJob(deps: JobDependencies) {
    return async (jobId: string, reporter: ProgressReporter, checkpoint: JobCheckpoint, startCursor?: any) => {
        reporter.setStatus('Loading invoices for reconciliation');
        
        const invoices = deps.projectionStore.get('invoices') || {};
        const invoiceIds = Object.keys(invoices);
        
        reporter.setTotal(invoiceIds.length);
        const cursor = new BatchCursor(invoiceIds, 2, startCursor || 0);
        const retry = new RetryPolicy({ maxRetries: 3, baseDelayMs: 100 });

        while (cursor.hasNext()) {
            const batch = cursor.nextBatch();
            
            for (const id of batch) {
                await retry.execute(async () => {
                    // Check artifacts to ensure a receipt exists for this invoice
                    const artifacts = deps.artifactIndex.find({ tags: [`invoice:${id}`] });
                    if (artifacts.length > 0) {
                        deps.evidenceExporter.export({
                            name: `reconcile-${id}`,
                            artifacts,
                            claims: { reconciled: true }
                        });
                    }
                });
                reporter.incSuccess();
            }

            await checkpoint.save({
                jobId,
                state: 'running',
                progress: reporter.toJSON(),
                cursor: cursor.getCursor(),
                updatedAt: new Date().toISOString()
            });

            // Artificial delay to let the UI see the progress
            await new Promise(r => setTimeout(r, 800));
        }
    };
}
