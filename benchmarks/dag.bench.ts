import { bench, describe, beforeAll } from 'vitest';
import { DAGToolkit } from '@hardkas/toolkit';

// Generate synthetic blocks for benchmarking
function generateBlocks(count: number) {
    const blocks = [];
    for (let i = 0; i < count; i++) {
        blocks.push({
            hash: `block-${i}`,
            parents: i > 0 ? [`block-${i - 1}`] : [],
            blueScore: BigInt(i),
            timestamp: Date.now() + i * 1000,
        });
    }
    return blocks;
}

const blocks1k = generateBlocks(1000);
const blocks10k = generateBlocks(10000);
const blocks50k = generateBlocks(50000);

describe('DAGToolkit Benchmarks (1k blocks)', () => {
    let dag: DAGToolkit;

    beforeAll(async () => {
        dag = await DAGToolkit.open({ storePath: ':memory:' });
        await dag.ingestBlocks(blocks1k);
    });
    
    bench('ingestBlocks (1k) fresh', async () => {
        const temp = await DAGToolkit.open({ storePath: ':memory:' });
        await temp.ingestBlocks(blocks1k);
    });

    bench('children', async () => {
        await dag.children('block-500');
    });

    bench('reachability', async () => {
        await dag.reachability('block-100', 'block-900');
    });

    bench('neighborhood', async () => {
        await dag.neighborhood('block-500');
    });

    bench('statistics', async () => {
        await dag.statistics();
    });
});

describe('DAGToolkit Benchmarks (10k blocks)', () => {
    let dag: DAGToolkit;

    beforeAll(async () => {
        dag = await DAGToolkit.open({ storePath: ':memory:' });
        await dag.ingestBlocks(blocks10k);
    });

    bench('ingestBlocks (10k) fresh', async () => {
        const temp = await DAGToolkit.open({ storePath: ':memory:' });
        await temp.ingestBlocks(blocks10k);
    });

    bench('children', async () => {
        await dag.children('block-5000');
    });

    bench('statistics', async () => {
        await dag.statistics();
    });
});

describe('DAGToolkit Benchmarks (50k blocks)', () => {
    let dag: DAGToolkit;

    beforeAll(async () => {
        dag = await DAGToolkit.open({ storePath: ':memory:' });
        await dag.ingestBlocks(blocks50k);
    });

    bench('ingestBlocks (50k) fresh', async () => {
        const temp = await DAGToolkit.open({ storePath: ':memory:' });
        await temp.ingestBlocks(blocks50k);
    });

    bench('statistics', async () => {
        await dag.statistics();
    });
});
