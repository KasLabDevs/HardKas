import { JobRunner, ProgressReporter, JobCheckpoint, BatchCursor, RetryPolicy } from '../core/index.js';
import { ArtifactIndexStoreJson, EvidenceBatchExporter } from '@hardkas/artifacts';

export interface ExportJobDependencies {
    artifactIndex: ArtifactIndexStoreJson;
    evidenceExporter: EvidenceBatchExporter;
}

export function createExportEvidenceJob(deps: ExportJobDependencies) {
    return async (jobId: string, reporter: ProgressReporter, checkpoint: JobCheckpoint, startCursor?: any) => {
        reporter.setStatus('Finding artifacts');
        
        const artifacts = await deps.artifactIndex.find({});
        reporter.setTotal(artifacts.length);
        
        const cursor = new BatchCursor(artifacts, 5, startCursor || 0);
        const retry = new RetryPolicy({ maxRetries: 2, baseDelayMs: 100 });

        while (cursor.hasNext()) {
            const batch = cursor.nextBatch();
            
            await retry.execute(async () => {
                await deps.evidenceExporter.export({
                    name: `batch-export-${jobId}-${cursor.getCursor()}`,
                    artifacts: batch,
                    claims: { batchExport: true }
                });
            });
            
            reporter.incSuccess(batch.length);

            await checkpoint.save({
                jobId,
                state: 'running',
                progress: reporter.toJSON(),
                cursor: cursor.getCursor(),
                updatedAt: new Date().toISOString()
            });
            
            await new Promise(r => setTimeout(r, 200));
        }
    };
}
