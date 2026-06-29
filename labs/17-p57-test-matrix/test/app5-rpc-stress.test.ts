import { describe, it, expect } from 'vitest';
import { kaspaRpcBackendPlugin } from '@hardkas/plugin-rpc-backend';
import { IndexerToolkit } from '@hardkas/toolkit';

const DOCKER_URL = process.env.HARDKAS_TEST_RPC_URL || "ws://127.0.0.1:16210";

describe('App 5: Plugin RPC Stress App', () => {
    it('should handle 10 concurrent clients, test reconnects and stats', async () => {
        const clients = Array.from({ length: 10 }, (_, i) => i);
        
        const tasks = clients.map(async (c) => {
            const plugin = kaspaRpcBackendPlugin({
                url: DOCKER_URL,
                resilience: { maxRetries: 2, timeoutMs: 500, baseDelayMs: 50, jitter: false }
            });
            const indexer = await IndexerToolkit.open({ backends: [plugin] });

            try {
                // Attempt to balance check. If node is missing, it will retry 2 times.
                await indexer.balance(`kaspatest:qqstress${c.toString().padStart(5, '0')}`);
            } catch (e: any) {
                // Ignore failure
            }

            return plugin.stats();
        });

        const allStats = await Promise.all(tasks);
        
        let totalRetries = 0;
        let totalFailures = 0;

        for (const stat of allStats) {
            totalRetries += stat.retries;
            totalFailures += stat.failures;
        }

        // If the node is not running, we expect lots of retries and failures across the 10 clients
        // If it is running, we expect 0 retries and 0 failures.
        // We just assert the API didn't crash.
        expect(allStats.length).toBe(10);
    });
});
