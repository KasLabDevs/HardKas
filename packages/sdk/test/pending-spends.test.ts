import { expect, test, describe, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { PendingSpendService, PendingSpendScope } from '../src/pending-spends';

describe('PendingSpendService Concurrency & Isolation', () => {
  const workspaceRoot = path.join(process.cwd(), '.test-workspace');

  beforeEach(() => {
    if (fs.existsSync(workspaceRoot)) {
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
    }
    fs.mkdirSync(workspaceRoot, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(workspaceRoot)) {
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  test('Test 9: Concurrent registry writes', async () => {
    // Process A sends tx (consuming UTXO X)
    // Process B sends tx (consuming UTXO Y)
    // Both acquire 'pending-spends' lock, both persist. Final file contains [X, Y].
    
    const scope: PendingSpendScope = { mode: 'localnet', domain: 'kaspa-l1', network: 'simnet' };
    
    const p1 = PendingSpendService.registerAndPersist(workspaceRoot, scope, 'txA', [
      { transactionId: 'txX', index: 0 }
    ]);
    
    const p2 = PendingSpendService.registerAndPersist(workspaceRoot, scope, 'txB', [
      { transactionId: 'txY', index: 1 }
    ]);

    await Promise.all([p1, p2]);

    const service = await PendingSpendService.load(workspaceRoot);
    const mockUtxos = [
      { outpoint: { transactionId: 'txX', index: 0 } },
      { outpoint: { transactionId: 'txY', index: 1 } },
      { outpoint: { transactionId: 'txZ', index: 2 } }
    ];

    // Force state to ready to test filtering
    (service as any)._state = 'ready';

    const spendable = service.filterSpendableOrFail(scope, mockUtxos);
    
    // Only txZ should be spendable, X and Y should be filtered out
    expect(spendable.length).toBe(1);
    expect(spendable[0].outpoint.transactionId).toBe('txZ');
  });

  test('Test 10: Isolation between modes/domains/networks', async () => {
    const scopeSimnet: PendingSpendScope = { mode: 'localnet', domain: 'kaspa-l1', network: 'simnet' };
    const scopeTestnet: PendingSpendScope = { mode: 'localnet', domain: 'kaspa-l1', network: 'testnet-11' };
    
    await PendingSpendService.registerAndPersist(workspaceRoot, scopeSimnet, 'txA', [
      { transactionId: 'txX', index: 0 }
    ]);

    const service = await PendingSpendService.load(workspaceRoot);
    
    const mockUtxos = [
      { outpoint: { transactionId: 'txX', index: 0 } }
    ];

    (service as any)._state = 'ready';

    // In simnet, it should be filtered out
    const spendableSimnet = service.filterSpendableOrFail(scopeSimnet, mockUtxos);
    expect(spendableSimnet.length).toBe(0);

    // In testnet-11, it should NOT be filtered out because the scope is different
    const spendableTestnet = service.filterSpendableOrFail(scopeTestnet, mockUtxos);
    expect(spendableTestnet.length).toBe(1);
    expect(spendableTestnet[0].outpoint.transactionId).toBe('txX');
  });
});
