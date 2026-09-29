import { describe, it, expect } from "vitest";
import { KaspaJsonRpcClient, CircuitState } from "../src/json-rpc-client.js";
import { RpcValidationError } from "../src/errors.js";
import { fakeOfficialRpc } from "./helpers/fake-official-rpc.js";

describe("RPC Resilience Refined (P1.2)", () => {
  describe("Deterministic Errors", () => {
    it("should NOT retry on deterministic validation errors", async () => {
      const rpc = fakeOfficialRpc({
        submitTransaction: () => {
          throw new Error("insufficient funds for transaction");
        }
      });
      const client = new KaspaJsonRpcClient({
        url: "ws://mock",
        rpcFactory: rpc.factory,
        retry: { maxRetries: 3, baseDelayMs: 1 }
      });

      // A transaction must carry its storage mass commitment to reach the node at all.
      await expect(client.submitTransaction({ storageMass: 0 })).rejects.toThrow(RpcValidationError);
      expect(rpc.calls.length).toBe(1); // No retry!
    });

    it("should NOT retry when isRetriable is explicitly false", async () => {
      const rpc = fakeOfficialRpc({
        getInfo: () => {
          throw new RpcValidationError("Explicitly non-retriable");
        }
      });
      const client = new KaspaJsonRpcClient({
        url: "ws://mock",
        rpcFactory: rpc.factory,
        retry: { maxRetries: 3, baseDelayMs: 1 }
      });

      await expect(client.getInfo()).rejects.toThrow(RpcValidationError);
      expect(rpc.calls.length).toBe(1);
    });
  });

  describe("Per-Endpoint Isolation", () => {
    it("should isolate circuit breaker state between different endpoints", async () => {
      // Node A is down
      const rpcA = fakeOfficialRpc({}, { connectError: "wRPC -> WebSocket -> Unable to connect to ws://node-a:18210" });
      const clientA = new KaspaJsonRpcClient({
        url: "http://node-a:18210",
        rpcFactory: rpcA.factory,
        retry: { maxRetries: 0 },
        circuitBreaker: { failureThreshold: 1 }
      });

      // Node B is working
      const rpcB = fakeOfficialRpc({
        getInfo: () => ({ serverVersion: "working" }),
        getServerInfo: () => ({ serverVersion: "working" }),
        getBlockDagInfo: () => ({})
      });
      const clientB = new KaspaJsonRpcClient({
        url: "http://node-b:18210",
        rpcFactory: rpcB.factory
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
      const rpc = fakeOfficialRpc({
        getInfo: () => {
          if (fail) {
            fail = false;
            throw new Error("Fail once");
          }
          return { isSynced: true, networkId: "testnet-1", virtualDaaScore: 100n };
        }
      });

      const client = new KaspaJsonRpcClient({
        url: "http://unique-health-node:18210",
        rpcFactory: rpc.factory,
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
