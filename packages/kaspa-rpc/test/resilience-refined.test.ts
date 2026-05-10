import { describe, it, expect, vi } from "vitest";
import { KaspaJsonRpcClient, CircuitState } from "../src/json-rpc-client.js";
import { 
  RpcValidationError, 
  RpcCircuitOpenError 
} from "../src/errors.js";

describe("RPC Resilience Refined (P1.2)", () => {
  
  describe("Deterministic Errors", () => {
    it("should NOT retry on deterministic validation errors", async () => {
      let attempts = 0;
      const mockFetcher = vi.fn().mockImplementation(async () => {
        attempts++;
        return new Response(JSON.stringify({ 
          jsonrpc: "2.0", 
          id: 1, 
          error: { message: "insufficient funds for transaction", code: -1 } 
        }));
      });

      const client = new KaspaJsonRpcClient({
        fetcher: mockFetcher,
        retry: { maxRetries: 3, baseDelayMs: 1 }
      });

      await expect(client.submitTransaction({})).rejects.toThrow(RpcValidationError);
      expect(attempts).toBe(1); // No retry!
    });

    it("should NOT retry when isRetriable is explicitly false", async () => {
      let attempts = 0;
      const mockFetcher = vi.fn().mockImplementation(async () => {
        attempts++;
        throw new RpcValidationError("Explicitly non-retriable");
      });

      const client = new KaspaJsonRpcClient({
        fetcher: mockFetcher,
        retry: { maxRetries: 3, baseDelayMs: 1 }
      });

      await expect(client.getInfo()).rejects.toThrow(RpcValidationError);
      expect(attempts).toBe(1);
    });
  });

  describe("Per-Endpoint Isolation", () => {
    it("should isolate circuit breaker state between different endpoints", async () => {
      // Node A is failing
      const mockFetcherA = vi.fn().mockImplementation(async () => {
        throw new Error("Down");
      });
      const clientA = new KaspaJsonRpcClient({
        url: "http://node-a:18210",
        fetcher: mockFetcherA,
        retry: { maxRetries: 0 },
        circuitBreaker: { failureThreshold: 1 }
      });

      // Node B is working
      const mockFetcherB = vi.fn().mockImplementation(async () => {
        return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { serverVersion: "working" } }));
      });
      const clientB = new KaspaJsonRpcClient({
        url: "http://node-b:18210",
        fetcher: mockFetcherB
      });

      // Break Node A
      await expect(clientA.getInfo()).rejects.toThrow();
      const healthA = await clientA.healthCheck();
      expect(healthA.circuitState).toBe(CircuitState.OPEN);

      // Node B should still be healthy
      const healthB = await clientB.healthCheck();
      expect(healthB.circuitState).toBe(CircuitState.CLOSED);
      expect(healthB.info?.serverVersion).toBe("working");
    });
  });

  describe("Health Metrics", () => {
    it("should track success rate and latency", async () => {
      let fail = true;
      const mockFetcher = vi.fn().mockImplementation(async () => {
        if (fail) {
          fail = false;
          throw new Error("Fail once");
        }
        return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { isSynced: true } }));
      });

      const client = new KaspaJsonRpcClient({
        fetcher: mockFetcher,
        retry: { maxRetries: 1, baseDelayMs: 1 }
      });

      // First call (fails then succeeds via retry)
      // totalRequests: 1 (fail), 2 (success)
      await client.getInfo();
      
      // healthCheck calls getInfo internally
      // totalRequests: 3 (success)
      const health = await client.healthCheck();
      
      // Total 3 calls, 2 successful
      expect(health.successRate).toBeCloseTo(66.67, 1);
      expect(health.latencyMs).toBeGreaterThanOrEqual(0);
      expect(health.status).toBe("degraded");
    });
  });
});
