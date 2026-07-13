import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ResilientSubscriptionClient } from '../src/internal/resilient-subscriber.js';
import { JsonWrpcKaspaClient } from '../src/json-rpc-client.js';

// We mock JsonWrpcKaspaClient
vi.mock('../src/json-rpc-client.js', () => {
    return {
        JsonWrpcKaspaClient: vi.fn().mockImplementation((options: any) => {
            return {
                options,
                isClosed: false,
                subs: new Set<any>(),
                async getInfo() {
                    if (this.isClosed) throw new Error("Closed");
                    return { networkId: "simnet" };
                },
                on(topic: string, cb: any) {
                    if (this.isClosed) throw new Error("Closed");
                    this.subs.add(cb);
                },
                off(topic: string, cb: any) {
                    this.subs.delete(cb);
                },
                async close() {
                    this.isClosed = true;
                },
                // Test helper to simulate events
                simulateEvent(data: any) {
                    for (const cb of this.subs) {
                        cb(data);
                    }
                },
                // Test helper to simulate disconnect
                simulateDisconnect() {
                    this.isClosed = true;
                    if (this.options.onDisconnect) {
                        this.options.onDisconnect();
                    }
                }
            };
        })
    };
});

describe('ResilientSubscriptionClient', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
    });
    
    afterEach(() => {
        vi.runOnlyPendingTimers();
        vi.useRealTimers();
    });

    it('should reconnect and resubscribe automatically on disconnect', async () => {
        const client = new ResilientSubscriptionClient({
            rpcUrl: "ws://localhost",
            reconnectBaseDelayMs: 10,
            heartbeatIntervalMs: 10000
        });

        let events = 0;
        client.on("utxos-changed", (data) => {
            events++;
        });

        // Get the internal mocked instance
        const mockInstances = vi.mocked(JsonWrpcKaspaClient).mock.results;
        expect(mockInstances.length).toBe(1);
        let innerClient1 = mockInstances[0].value;

        // Simulate an event
        innerClient1.simulateEvent({ data: "test1" });
        expect(events).toBe(1);

        // Simulate disconnect
        innerClient1.simulateDisconnect();
        
        // Advance timers to trigger reconnect logic
        await vi.advanceTimersByTimeAsync(20);

        // A new instance should have been created
        const updatedInstances = vi.mocked(JsonWrpcKaspaClient).mock.results;
        expect(updatedInstances.length).toBe(2);
        let innerClient2 = updatedInstances[1].value;

        // Simulate an event on the NEW connection
        innerClient2.simulateEvent({ data: "test2" });
        expect(events).toBe(2); // The subscription was moved over!

        await client.close();
    });

    it('should reconnect via heartbeat if silent drop occurs', async () => {
        const client = new ResilientSubscriptionClient({
            rpcUrl: "ws://localhost",
            reconnectBaseDelayMs: 10,
            heartbeatIntervalMs: 5000
        });

        let events = 0;
        client.on("test-topic", (data) => { events++; });

        const mockInstances = vi.mocked(JsonWrpcKaspaClient).mock.results;
        let innerClient1 = mockInstances[0].value;

        // Silently close without emitting onDisconnect
        innerClient1.isClosed = true;

        // Wait for heartbeat
        await vi.advanceTimersByTimeAsync(5000);

        const updatedInstances = vi.mocked(JsonWrpcKaspaClient).mock.results;
        expect(updatedInstances.length).toBe(2);
        let innerClient2 = updatedInstances[1].value;

        innerClient2.simulateEvent({ data: "test3" });
        expect(events).toBe(1);

        await client.close();
    });
});
