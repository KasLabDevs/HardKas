/**
 * Ensures at-least-once delivery with deduplication and convergence.
 */
export declare class ReconciliationEngine {
    private seenEventIds;
    private readonly maxSeenHistory;
    private idQueue;
    /**
     * Returns true if the event was already processed and should be dropped.
     */
    isDuplicate(eventId: string): boolean;
    /**
     * Marks an event as seen.
     */
    markSeen(eventId: string): void;
}
//# sourceMappingURL=reconciliation.d.ts.map