import { bench, describe, beforeAll } from 'vitest';
import { WalletToolkit } from '@hardkas/toolkit';

function generateUTXOs(count: number) {
    const utxos = [];
    for (let i = 0; i < count; i++) {
        utxos.push({
            outpoint: { transactionId: `tx-${i}`, index: 0 },
            address: 'kaspa:qtest',
            amount: 100_000_000n,
            blockDaaScore: BigInt(i),
            isCoinbase: false,
        });
    }
    return utxos;
}

const utxos1k = generateUTXOs(1000);
const utxos10k = generateUTXOs(10000);
const utxos50k = generateUTXOs(50000);

describe('UTXO Toolkit Benchmarks (1k)', () => {
    let wallet: WalletToolkit;

    beforeAll(async () => {
        wallet = await WalletToolkit.open('bench-1k', { storePath: ':memory:' });
        await wallet.create();
        await (wallet.utxos as any).inject(utxos1k);
    });

    bench('inject UTXOs (1k) fresh', async () => {
        const w = await WalletToolkit.open('bench-1k-fresh', { storePath: ':memory:' });
        await w.create();
        await (w.utxos as any).inject(utxos1k);
    });

    bench('statistics', async () => {
        await wallet.utxos.statistics();
    });

    bench('analyzeDust', async () => {
        await wallet.utxos.analyzeDust();
    });

    bench('analyze', async () => {
        await wallet.utxos.analyze();
    });

    bench('consolidate', async () => {
        await wallet.utxos.consolidate();
    });

    bench('splitPlan', async () => {
        await wallet.utxos.splitPlan(10);
    });

    bench('mergePlan', async () => {
        await wallet.utxos.mergePlan(10);
    });

    bench('sweepPlan', async () => {
        await wallet.utxos.sweepPlan('kaspa:qtarget');
    });
});

describe('UTXO Toolkit Benchmarks (10k)', () => {
    let wallet: WalletToolkit;

    beforeAll(async () => {
        wallet = await WalletToolkit.open('bench-10k', { storePath: ':memory:' });
        await wallet.create();
        await (wallet.utxos as any).inject(utxos10k);
    });

    bench('inject UTXOs (10k) fresh', async () => {
        const w = await WalletToolkit.open('bench-10k-fresh', { storePath: ':memory:' });
        await w.create();
        await (w.utxos as any).inject(utxos10k);
    });

    bench('statistics', async () => {
        await wallet.utxos.statistics();
    });
});

describe('UTXO Benchmarks (50k)', () => {
    let wallet: WalletToolkit;

    beforeAll(async () => {
        wallet = await WalletToolkit.open('bench-50k', { storePath: ':memory:' });
        await wallet.create();
        await (wallet.utxos as any).inject(utxos50k);
    });

    bench('inject UTXOs (50k) fresh', async () => {
        const w = await WalletToolkit.open('bench-50k-fresh', { storePath: ':memory:' });
        await w.create();
        await (w.utxos as any).inject(utxos50k);
    });

    bench('statistics', async () => {
        await wallet.utxos.statistics();
    });
});
