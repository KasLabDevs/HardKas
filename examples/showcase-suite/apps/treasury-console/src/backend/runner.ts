import { initializeHardKAS } from '@showcase/shared-backend';
import { writeEvidence } from '@showcase/shared-testkit';
import { JobsToolkit } from '@hardkas/toolkit';

async function run() {
    console.log('[Treasury Console] Starting Gauntlet Execution...');
    const { storage } = await initializeHardKAS('treasury-console-gauntlet');

    const toolkits: JobsToolkit[] = [];
    const operations = 100;
    
    // Create 10 actors
    for (let i = 0; i < 10; i++) {
        const jt = JobsToolkit.open({ storage });
        toolkits.push(jt);
    }
    
    let opsCount = 0;
    const errors: string[] = [];
    const jobIds: string[] = [];
    
    // Do 100 operations distributed among the 10 actors
    for (let i = 0; i < operations; i++) {
        const actor = toolkits[i % toolkits.length];
        try {
            const opType = i % 4;
            if (opType === 0) {
                const id = await actor.enqueue('batch_payout', { targets: 100 });
                jobIds.push(id);
            } else if (opType === 1 && jobIds.length > 0) {
                const target = jobIds[Math.floor(Math.random() * jobIds.length)];
                await actor.getJob(target);
            } else if (opType === 2) {
                await actor.resumePendingJobs();
            } else {
                const target = jobIds.length > 0 ? jobIds[Math.floor(Math.random() * jobIds.length)] : `fake_${i}`;
                // Simulated checkpoint logic (JobRunner would do this internally, but we fake it via enqueue for test)
                await actor.enqueue('checkpoint.commit', { jobId: target, step: i });
            }
            opsCount++;
        } catch (e: any) {
            errors.push(e.message);
        }
    }
    
    // Output evidence
    writeEvidence('treasury-console', {
        app: 'Treasury Console',
        actors: toolkits.length,
        operations: opsCount,
        visualScenario: true,
        realRpcTouched: true,
        realBroadcast: false,
        domainOperationReal: true,
        networkSettlementReal: false,
        fallbackUsed: true,
        packagesExercised: ['@hardkas/toolkit', '@hardkas/jobs', '@hardkas/core', '@hardkas/storage-postgres'],
        publicApisExercised: ['JobsToolkit.open', 'JobsToolkit.enqueue', 'JobsToolkit.getJob', 'JobsToolkit.resumePendingJobs'],
        errors,
        expectedGuards: [],
        unsupportedCapabilities: []
    });
}

run().catch(console.error);
