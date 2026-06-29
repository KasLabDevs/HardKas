import { describe, it, expect, beforeAll } from 'vitest';
import { KaspaJsonRpcClient } from '@hardkas/kaspa-rpc';
import { DagRpcBlockAdapter } from '../adapter/DagRpcBlockAdapter.js';
import { IndexerToolkit } from '@hardkas/toolkit';

describe('Lab 11.5: Docker RPC DAG Validation', () => {
  let rpc: KaspaJsonRpcClient;
  let isConnected = false;
  let testBlock: any = null;
  const indexer = IndexerToolkit.open();

  beforeAll(async () => {
    try {
      // Try to connect to a local simnet Kaspa node
      rpc = new KaspaJsonRpcClient({
        url: 'http://127.0.0.1:16510',
        timeoutMs: 2000
      });
      
      const info = await rpc.getInfo();
      if (info && info.isSynced !== undefined) {
        isConnected = true;

        // Try to fetch a recent block
        const dagInfo = await rpc.getBlockDagInfo();
        if (dagInfo && dagInfo.tipHashes && dagInfo.tipHashes.length > 0) {
          const tipHash = dagInfo.tipHashes[0];
          // KaspaJsonRpcClient doesn't strictly type getBlock, so we call raw RPC if needed
          // Or just call the method
          try {
            const response = await (rpc as any).callMethod('getBlock', 'getBlockRequest', { hash: tipHash, includeTransactions: true });
            if (response && response.block) {
              testBlock = response.block;
            }
          } catch(e) {
            // fallback
          }
        }
      }
    } catch (e) {
      console.warn("RPC connection failed or not available:", e);
    }
  });

  it('should normalize a block if RPC is connected', async () => {
    if (!isConnected) {
      console.warn("Skipping test: Docker/Toccata RPC not available");
      return;
    }
    
    expect(testBlock).not.toBeNull();

    // 1. Adapter normalization
    const dagBlock = DagRpcBlockAdapter.normalize(testBlock);
    expect(dagBlock.hash).toBeTypeOf('string');
    expect(Array.isArray(dagBlock.parents)).toBe(true);
    expect(typeof dagBlock.blueScore).toBe('number');

    // 2. Ingest into indexer.dag
    await indexer.dag.ingestBlocks([dagBlock]);

    // 3. Declarative queries
    const retrieved = await indexer.dag.block(dagBlock.hash);
    expect(retrieved.hash).toBe(dagBlock.hash);
    
    const parents = await indexer.dag.parents(dagBlock.hash);
    expect(parents.length).toBe(0); // Because we haven't ingested the actual parents
    
    const stats = await indexer.dag.statistics();
    expect(stats.totalBlocks).toBeGreaterThan(0);
  });
});
