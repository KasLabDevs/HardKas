import Fastify from 'fastify';
import { JobRunner } from '../core/index.js';
import { ProjectionStoreJson } from '@hardkas/query-store';
import { ArtifactIndexStoreJson, EvidenceBatchExporter } from '@hardkas/artifacts';
import { EventSubscriber } from '@hardkas/core';
import { createReconcileJob, createExportEvidenceJob, createRebuildProjectionsJob } from '../jobs/index.js';

export async function buildServer() {
    const fastify = Fastify({ logger: true });

    const jobRunner = new JobRunner();
    await jobRunner.init();

    const projectionStore = new ProjectionStoreJson({ namespace: 'batch-engine', dirPath: '.hardkas-data/projections' });

    const artifactIndex = new ArtifactIndexStoreJson({ filePath: '.hardkas-data/artifacts-index.json' });

    const evidenceExporter = new EvidenceBatchExporter(artifactIndex);
    const eventSubscriber = new EventSubscriber();

    const deps = {
        projectionStore,
        artifactIndex,
        evidenceExporter,
        eventSubscriber
    };

    const reconcileJob = createReconcileJob(deps);
    const exportEvidenceJob = createExportEvidenceJob(deps);
    const rebuildProjectionsJob = createRebuildProjectionsJob(deps);

    fastify.post('/jobs/reconcile', async (request, reply) => {
        const id = await jobRunner.submit('reconcile', reconcileJob);
        return { id, message: 'Reconcile job started' };
    });

    fastify.post('/jobs/export-evidence', async (request, reply) => {
        const id = await jobRunner.submit('export-evidence', exportEvidenceJob);
        return { id, message: 'Export evidence job started' };
    });

    fastify.post('/jobs/rebuild-projections', async (request, reply) => {
        const id = await jobRunner.submit('rebuild-projections', rebuildProjectionsJob);
        return { id, message: 'Rebuild projections job started' };
    });

    fastify.get('/jobs/:id', async (request: any, reply) => {
        const { id } = request.params;
        const job = jobRunner.getJob(id);
        if (!job) {
            return reply.status(404).send({ error: 'Job not found' });
        }
        return job;
    });

    fastify.post('/jobs/:id/retry', async (request: any, reply) => {
        const { id } = request.params;
        const job = jobRunner.getJob(id);
        if (!job) {
            return reply.status(404).send({ error: 'Job not found' });
        }
        
        let fn;
        switch (job.type) {
            case 'reconcile': fn = reconcileJob; break;
            case 'export-evidence': fn = exportEvidenceJob; break;
            case 'rebuild-projections': fn = rebuildProjectionsJob; break;
            default:
                return reply.status(400).send({ error: 'Unknown job type' });
        }

        try {
            await jobRunner.retry(id, fn);
            return { id, message: 'Job retry started' };
        } catch (err: any) {
            return reply.status(400).send({ error: err.message });
        }
    });

    return fastify;
}
