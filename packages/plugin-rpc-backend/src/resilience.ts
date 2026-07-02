import { HardkasRpcConnectionError, HardkasRpcTimeoutError, HardkasRpcSemanticError } from './errors.js';
import { logger, metrics } from '@hardkas/observability';

metrics.register({
    name: "plugin_rpc_retries_total",
    help: "Total retries by RPC backend plugin",
    type: "counter"
});
metrics.register({
    name: "plugin_rpc_reconnects_total",
    help: "Total reconnects by RPC backend plugin",
    type: "counter"
});
metrics.register({
    name: "plugin_rpc_timeouts_total",
    help: "Total timeouts in RPC backend plugin",
    type: "counter"
});
metrics.register({
    name: "plugin_rpc_failures_total",
    help: "Total fatal failures in RPC backend plugin",
    type: "counter"
});

export type RpcResilienceOptions = {
    maxRetries?: number;      // default 3
    baseDelayMs?: number;     // default 250
    maxDelayMs?: number;      // default 5000
    timeoutMs?: number;       // default 10000
    jitter?: boolean;         // default true
};

export interface RpcStats {
    retries: number;
    reconnects: number;
    timeouts: number;
    failures: number;
}

export class ResilienceEngine {
    private options: Required<RpcResilienceOptions>;
    private _stats: RpcStats = {
        retries: 0,
        reconnects: 0,
        timeouts: 0,
        failures: 0
    };

    constructor(options?: RpcResilienceOptions) {
        this.options = {
            maxRetries: options?.maxRetries ?? 3,
            baseDelayMs: options?.baseDelayMs ?? 250,
            maxDelayMs: options?.maxDelayMs ?? 5000,
            timeoutMs: options?.timeoutMs ?? 10000,
            jitter: options?.jitter ?? true
        };
    }

    get stats(): RpcStats {
        return { ...this._stats };
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private calculateDelay(attempt: number): number {
        const exponential = this.options.baseDelayMs * Math.pow(2, attempt);
        const capped = Math.min(exponential, this.options.maxDelayMs);
        if (!this.options.jitter) return capped;
        
        // Add full jitter (0 to capped)
        return Math.floor(Math.random() * capped);
    }

    async withRetry<T>(operation: () => Promise<T>, reconnect?: () => Promise<void>): Promise<T> {
        let attempt = 0;
        
        while (true) {
            try {
                // Execute with timeout
                return await this.withTimeout(operation());
            } catch (error: any) {
                if (error instanceof HardkasRpcTimeoutError) {
                    this._stats.timeouts++;
                    metrics.inc("plugin_rpc_timeouts_total");
                    logger.warn("RPC operation timeout", { attempt });
                }

                // Identify if it's a semantic error (should not retry)
                if (error instanceof HardkasRpcSemanticError) {
                    this._stats.failures++;
                    metrics.inc("plugin_rpc_failures_total");
                    logger.error("RPC semantic error (fatal)", { error: error.message });
                    throw error;
                }
                
                // For other errors, check if we've exhausted retries
                if (attempt >= this.options.maxRetries) {
                    this._stats.failures++;
                    metrics.inc("plugin_rpc_failures_total");
                    logger.error("RPC max retries exhausted", { attempt, maxRetries: this.options.maxRetries, error: error.message });
                    if (error instanceof HardkasRpcTimeoutError) throw error;
                    throw new HardkasRpcConnectionError(`Operation failed after ${attempt} retries: ${error.message}`);
                }

                attempt++;
                this._stats.retries++;
                metrics.inc("plugin_rpc_retries_total");
                logger.debug("RPC operation retrying", { attempt, delay: this.calculateDelay(attempt) });
                
                // Attempt reconnect if provided and it's a connection issue
                if (reconnect) {
                    try {
                        logger.debug("Attempting RPC reconnect");
                        await reconnect();
                        this._stats.reconnects++;
                        metrics.inc("plugin_rpc_reconnects_total");
                        logger.info("RPC reconnected successfully");
                    } catch (e: any) {
                        logger.warn("RPC reconnect failed", { error: e.message });
                        // Ignore reconnect failures, just wait and retry the main operation
                    }
                }

                const delay = this.calculateDelay(attempt);
                await this.sleep(delay);
            }
        }
    }

    private withTimeout<T>(promise: Promise<T>): Promise<T> {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new HardkasRpcTimeoutError(`Operation timed out after ${this.options.timeoutMs}ms`));
            }, this.options.timeoutMs);
            
            promise.then((value) => {
                clearTimeout(timer);
                resolve(value);
            }).catch((err) => {
                clearTimeout(timer);
                reject(err);
            });
        });
    }
}
