import { EventEnvelope } from "../contracts/events.js";

/**
 * Ensures at-least-once delivery with deduplication and convergence.
 */
export class ReconciliationEngine {
  private seenEventIds = new Set<string>();
  // To avoid unbound memory growth, we can prune old IDs periodically or by size limit
  private readonly maxSeenHistory = 10000;
  private idQueue: string[] = [];

  /**
   * Returns true if the event was already processed and should be dropped.
   */
  public isDuplicate(eventId: string): boolean {
    return this.seenEventIds.has(eventId);
  }

  /**
   * Marks an event as seen.
   */
  public markSeen(eventId: string): void {
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
