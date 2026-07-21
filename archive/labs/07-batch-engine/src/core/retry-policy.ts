export interface RetryPolicyOptions {
    maxRetries: number;
    baseDelayMs: number;
}

export class RetryPolicy {
    constructor(private readonly options: RetryPolicyOptions) {}

    async execute<T>(fn: (attempt: number) => Promise<T>): Promise<T> {
        let attempt = 0;
        while (attempt <= this.options.maxRetries) {
            try {
                return await fn(attempt);
            } catch (err) {
                if (attempt === this.options.maxRetries) {
                    throw err;
                }
                const delay = this.options.baseDelayMs * Math.pow(2, attempt);
                await new Promise((resolve) => setTimeout(resolve, delay));
                attempt++;
            }
        }
        throw new Error("Unreachable");
    }
}
