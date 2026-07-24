/**
 * Ensures at-least-once delivery with deduplication and convergence.
 */
export class ReconciliationEngine {
    seenEventIds = new Set();
    // To avoid unbound memory growth, we can prune old IDs periodically or by size limit
    maxSeenHistory = 10000;
    idQueue = [];
    /**
     * Returns true if the event was already processed and should be dropped.
     */
    isDuplicate(eventId) {
        return this.seenEventIds.has(eventId);
    }
    /**
     * Marks an event as seen.
     */
    markSeen(eventId) {
        if (this.seenEventIds.has(eventId)) {
            return;
        }
        this.seenEventIds.add(eventId);
        this.idQueue.push(eventId);
        if (this.idQueue.length > this.maxSeenHistory) {
            const oldId = this.idQueue.shift();
            if (oldId) {
                this.seenEventIds.delete(oldId);
            }
        }
    }
}
//# sourceMappingURL=reconciliation.js.map