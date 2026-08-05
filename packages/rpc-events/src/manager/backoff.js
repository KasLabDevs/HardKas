export class DeterministicBackoff {
    config;
    attemptCount = 0;
    constructor(config) {
        this.config = config;
    }
    get attempt() {
        return this.attemptCount;
    }
    nextDelay() {
        if (this.config.maxAttempts && this.attemptCount >= this.config.maxAttempts) {
            return undefined;
        }
        const delay = this.config.initialDelayMs * Math.pow(this.config.factor, this.attemptCount);
        this.attemptCount++;
        return Math.min(delay, this.config.maxDelayMs);
    }
    reset() {
        this.attemptCount = 0;
    }
}
//# sourceMappingURL=backoff.js.map