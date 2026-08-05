export interface BackoffConfig {
    initialDelayMs: number;
    maxDelayMs: number;
    factor: number;
    maxAttempts?: number;
}
export declare class DeterministicBackoff {
    private config;
    private attemptCount;
    constructor(config: BackoffConfig);
    get attempt(): number;
    nextDelay(): number | undefined;
    reset(): void;
}
//# sourceMappingURL=backoff.d.ts.map