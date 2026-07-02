import { describe, it, expect, vi } from 'vitest';
import { ResilienceEngine, HardkasRpcTimeoutError, HardkasRpcConnectionError, HardkasRpcSemanticError } from '../src/index.js';

describe('Resilience Engine', () => {
    it('should resolve immediately if operation succeeds', async () => {
        const engine = new ResilienceEngine();
        const result = await engine.withRetry(async () => 'success');
        expect(result).toBe('success');
        expect(engine.stats.retries).toBe(0);
        expect(engine.stats.failures).toBe(0);
    });

    it('should retry up to maxRetries on failure', async () => {
        const engine = new ResilienceEngine({ maxRetries: 2, baseDelayMs: 10, maxDelayMs: 50, jitter: false });
        let attempts = 0;
        
        const operation = async () => {
            attempts++;
            throw new Error('Network fault');
        };

        await expect(engine.withRetry(operation)).rejects.toThrow(HardkasRpcConnectionError);
        expect(attempts).toBe(3); // 1 initial + 2 retries
        expect(engine.stats.retries).toBe(2);
        expect(engine.stats.failures).toBe(1);
    });

    it('should not retry on HardkasRpcSemanticError', async () => {
        const engine = new ResilienceEngine({ maxRetries: 3, baseDelayMs: 10 });
        let attempts = 0;
        
        const operation = async () => {
            attempts++;
            throw new HardkasRpcSemanticError('UTXO index not enabled');
        };

        await expect(engine.withRetry(operation)).rejects.toThrow(HardkasRpcSemanticError);
        expect(attempts).toBe(1); // Fails immediately, no retries
        expect(engine.stats.retries).toBe(0);
        expect(engine.stats.failures).toBe(1);
    });

    it('should enforce timeouts and throw HardkasRpcTimeoutError', async () => {
        const engine = new ResilienceEngine({ maxRetries: 1, baseDelayMs: 10, timeoutMs: 50, jitter: false });
        
        const operation = async () => {
            await new Promise(resolve => setTimeout(resolve, 100)); // Operation takes 100ms
            return 'late';
        };

        await expect(engine.withRetry(operation)).rejects.toThrow(HardkasRpcTimeoutError);
        expect(engine.stats.timeouts).toBeGreaterThan(0);
        expect(engine.stats.failures).toBe(1);
    });

    it('should attempt reconnect if provided and a network fault occurs', async () => {
        const engine = new ResilienceEngine({ maxRetries: 1, baseDelayMs: 10, jitter: false });
        
        let attempts = 0;
        const operation = async () => {
            attempts++;
            throw new Error('Socket closed');
        };

        let reconnects = 0;
        const reconnect = async () => {
            reconnects++;
        };

        await expect(engine.withRetry(operation, reconnect)).rejects.toThrow(HardkasRpcConnectionError);
        expect(attempts).toBe(2); // Initial + 1 retry
        expect(reconnects).toBe(1); // Triggered before the retry
        expect(engine.stats.reconnects).toBe(1);
    });
});
