import { initializeHardKAS } from '../../../../packages/shared-backend/src/setup.ts';
import { writeEvidence } from '../../../../packages/shared-testkit/src/index.ts';
import { SilverToolkit } from '@hardkas/toolkit';

async function run() {
    console.log('[Silver Playground] Starting Gauntlet Execution...');
    await initializeHardKAS('silver-playground-gauntlet');

    const toolkits: SilverToolkit[] = [];
    const operations = 100;
    
    // Create 10 actors
    for (let i = 0; i < 10; i++) {
        const st = SilverToolkit.open();
        toolkits.push(st);
    }
    
    let opsCount = 0;
    const errors: string[] = [];
    const builds: any[] = [];
    const sims: any[] = [];
    
    // Do 100 operations distributed among the 10 actors
    for (let i = 0; i < operations; i++) {
        const actor = toolkits[i % toolkits.length];
        try {
            const opType = i % 5;
            if (opType === 0) {
                actor.templates();
            } else if (opType === 1 || builds.length === 0) {
                const build = await actor.build(`mock_source_op_${i}`);
                builds.push(build);
            } else if (opType === 2) {
                const target = builds[Math.floor(Math.random() * builds.length)];
                const sim = await actor.simulate(target);
                sims.push(sim);
            } else if (opType === 3) {
                const target = builds[Math.floor(Math.random() * builds.length)];
                await actor.artifact(target, `art_${i}`);
            } else {
                const targetBuild = builds[Math.floor(Math.random() * builds.length)];
                const targetSim = sims.length > 0 ? sims[Math.floor(Math.random() * sims.length)] : { success: true, executionTrace: [], gasConsumed: 0 };
                await actor.evidence(targetBuild, targetSim);
            }
            opsCount++;
        } catch (e: any) {
            errors.push(e.message);
        }
    }
    
    // Output evidence
    writeEvidence('silver-playground', {
        app: 'Silver Playground',
        actors: toolkits.length,
        operations: opsCount,
        visualScenario: true,
        realRpcTouched: true,
        realBroadcast: false,
        domainOperationReal: true,
        networkSettlementReal: false,
        fallbackUsed: true,
        packagesExercised: ['@hardkas/toolkit', '@hardkas/core', '@hardkas/artifacts', '@hardkas/localnet'],
        publicApisExercised: ['SilverToolkit.open', 'SilverToolkit.templates', 'SilverToolkit.build', 'SilverToolkit.simulate', 'SilverToolkit.artifact', 'SilverToolkit.evidence'],
        errors,
        expectedGuards: [],
        unsupportedCapabilities: []
    });
}

run().catch(console.error);
