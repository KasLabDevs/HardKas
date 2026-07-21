import { JobRunner, ProgressReporter, JobCheckpoint, BatchCursor, RetryPolicy } from '../core/index.js';
import { ProjectionStoreJson } from '@hardkas/query-store';
import { EventSubscriber } from '@hardkas/core';
import { WalletQuery, MemoryStore } from '@hardkas/query';

export interface RebuildJobDependencies {
    projectionStore: ProjectionStoreJson;
    eventSubscriber: EventSubscriber;
}

export function createRebuildProjectionsJob(deps: RebuildJobDependencies) {
    return async (jobId: string, reporter: ProgressReporter, checkpoint: JobCheckpoint, startCursor?: any) => {
        reporter.setStatus('Rebuilding from source');
        
        // In a real app we'd have a list of tracked addresses to rebuild.
        const addresses = ["kaspa:address1", "kaspa:address2", "kaspa:address3"];
        reporter.setTotal(addresses.length);

        const cursor = new BatchCursor(addresses, 1, startCursor || 0);
        const retry = new RetryPolicy({ maxRetries: 3, baseDelayMs: 200 });

        const mockSource = new WalletQuery({ store: new MemoryStore() });

        while (cursor.hasNext()) {
            const batch = cursor.nextBatch();
            
            await retry.execute(async () => {
                for (const address of batch) {
                    // Let's use event subscriber to "catch up" on events, 
                    // this simulates fetching history as an event stream
                    let localCount = 0;
                    const subId = deps.eventSubscriber.subscribe({
                        source: mockSource,
                        type: "payment",
                        intervalMs: 100, // fast poll for batch mode
                        watchedAddresses: [address],
                        handler: async (ev) => {
                            localCount++;
                        }
                    });

                    // Wait a bit to simulate processing
                    await new Promise(r => setTimeout(r, 300));
                    deps.eventSubscriber.unsubscribe(subId);
                    
                    // Update state
                    await deps.projectionStore.set(`projection_status_${address}`, { rebuilt: true, events: localCount });
                }
            });
            
            reporter.incSuccess(batch.length);

            await checkpoint.save({
                jobId,
                state: 'running',
                progress: reporter.toJSON(),
                cursor: cursor.getCursor(),
                updatedAt: new Date().toISOString()
            });
        }
    };
}
