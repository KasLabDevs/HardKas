import { describe, it, expect, vi } from "vitest";
import { KaspaJsonRpcClient, RpcIndexError, JsonWrpcKaspaClient } from "../src/index.js";

describe("Kaspa RPC Full Coverage", () => {
  describe("RpcIndexError Integration", () => {
    it("should throw RpcIndexError when node returns utxoindex not enabled", async () => {
      const fetcher = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          error: { message: "Method not enabled: utxoindex must be enabled", code: -32000 }
        })
      });

      const client = new KaspaJsonRpcClient({ url: "mock", fetcher, retry: { maxRetries: 0 } });
      await expect(client.getUtxosByAddress("kaspa:123")).rejects.toThrow(RpcIndexError);
    });

    it("should return null when node returns txindex not enabled", async () => {
      const fetcher = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          error: { message: "Method not enabled: txindex must be enabled", code: -32000 }
        })
      });

      const client = new KaspaJsonRpcClient({ url: "mock", fetcher, retry: { maxRetries: 0 } });
      // getTransaction catches all errors and returns null
      const result = await client.getTransaction("tx123");
      expect(result).toBeNull();
    });
  });

  describe("New RPC Methods Implementation (JsonWrpcKaspaClient)", () => {
    it("should map getFeeEstimate correctly", async () => {
      const client = new JsonWrpcKaspaClient({ rpcUrl: "ws://mock" });
      const mockResult = { estimate: { priorityBucket: { feeRate: 10 } } };
      vi.spyOn(client as any, "callMethod").mockResolvedValue(mockResult);

      const result = await client.getFeeEstimate();
      expect(result).toEqual(mockResult);
      expect(client["callMethod"]).toHaveBeenCalledWith("getFeeEstimate", "getFeeEstimateRequest", {});
    });

    it("should map getSinkBlueScore correctly", async () => {
      const client = new JsonWrpcKaspaClient({ rpcUrl: "ws://mock" });
      vi.spyOn(client as any, "callMethod").mockResolvedValue({ blueScore: "1000" });

      const result = await client.getSinkBlueScore();
      expect(result.blueScore).toBe("1000");
    });

    it("should map getSyncStatus correctly", async () => {
      const client = new JsonWrpcKaspaClient({ rpcUrl: "ws://mock" });
      vi.spyOn(client as any, "callMethod").mockResolvedValue({ isSynced: true });

      const result = await client.getSyncStatus();
      expect(result.isSynced).toBe(true);
    });
  });

  describe("New RPC Methods Implementation (KaspaJsonRpcClient)", () => {
    it("should map getFeeEstimate correctly", async () => {
      const fetcher = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ result: { estimate: { priorityBucket: { feeRate: 10 } } } })
      });
      const client = new KaspaJsonRpcClient({ url: "mock", fetcher });
      const result = await client.getFeeEstimate();
      expect(result.estimate.priorityBucket.feeRate).toBe(10);
    });

    it("should map getSinkBlueScore correctly", async () => {
      const fetcher = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ result: { blueScore: "2000" } })
      });
      const client = new KaspaJsonRpcClient({ url: "mock", fetcher });
      const result = await client.getSinkBlueScore();
      expect(result.blueScore).toBe("2000");
    });
  });
});
