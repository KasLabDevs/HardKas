import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SyncDaemon } from '../src/daemon.js';

let checkpointDir = '';
beforeAll(() => {
    checkpointDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hk-sync-daemon-'));
});
afterAll(() => {
    fs.rmSync(checkpointDir, { recursive: true, force: true });
});

describe('SyncDaemon', () => {
    it('should notify indexer and resume pending jobs on new blocks', async () => {
        // Mock backend
        let requested = false;
        const mockBackend: any = {
            capabilities: { externalState: true },
            client: {
                request: async (method: string) => {
                    if (method === 'getVirtualSelectedParentBlueScoreRequest') {
                        requested = true;
                        return { blueScore: 10n }; // Return a higher blue score to trigger processing
                    }
                    return {};
                }
            }
        };

        const mockJobs: any = {
            resumePendingJobs: vi.fn(() => console.log('resumePendingJobs called!'))
        };

        const mockIndexer: any = {
            reload: vi.fn(() => console.log('indexer reload called!'))
        };

        const daemon = SyncDaemon.open({
            backend: mockBackend,
            jobs: mockJobs,
            indexer: mockIndexer,
            pollIntervalMs: 100,
            // REMED-CLOSE · test isolation: the checkpoint lives in a temporary directory, never the repository root's .hardkas
            checkpointPath: path.join(checkpointDir, 'test-sync-' + Date.now() + '.json')
        });

        await daemon.start();
        
        // Wait a bit for the poll loop
        await new Promise(r => setTimeout(r, 500));
        
        await daemon.stop();

        expect(requested).toBe(true);
        expect(mockJobs.resumePendingJobs).toHaveBeenCalled();
        expect(mockIndexer.reload).toHaveBeenCalled();
    });
});
