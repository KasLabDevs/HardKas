import { describe, it, expect, vi } from 'vitest';
import { EventSubscriber } from '../src/events.js';

describe('EventSubscriber', () => {
    it('should poll source and emit events', async () => {
        vi.useFakeTimers();

        const mockSource = {
            getUtxos: async (addresses: string[]) => {
                return {
                    ok: true,
                    utxos: {
                        [addresses[0]]: [
                            { transactionId: "tx1", outputIndex: 0, amountSompi: 100n },
                            { transactionId: "tx2", outputIndex: 1, amountSompi: 500n }
                        ]
                    }
                };
            }
        };

        const subscriber = new EventSubscriber();
        const events: any[] = [];

        const subId = subscriber.subscribe({
            source: mockSource,
            type: "payment",
            intervalMs: 1000,
            watchedAddresses: ["kaspa:address1"],
            handler: (ev) => events.push(ev)
        });

        // Advance timers by 1 second
        await vi.advanceTimersByTimeAsync(1000);

        expect(events.length).toBe(2);
        expect(events[0].transactionId).toBe("tx1");
        expect(events[1].transactionId).toBe("tx2");

        // Advance timers again, should not emit duplicates
        await vi.advanceTimersByTimeAsync(1000);
        expect(events.length).toBe(2);

        subscriber.unsubscribe(subId);
        vi.useRealTimers();
    });
});
