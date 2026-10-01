import { describe, it, expect } from "vitest";
import { KaspaJsonRpcClient, RpcIndexError, RpcConnectionError, RpcProtocolError, RpcNotFoundError, JsonWrpcKaspaClient } from "../src/index.js";
import { fakeOfficialRpc, nodeError } from "./helpers/fake-official-rpc.js";

describe("Kaspa RPC Full Coverage", () => {
  describe("RpcIndexError Integration", () => {
    it("should throw RpcIndexError when node returns utxoindex not enabled", async () => {
      const rpc = fakeOfficialRpc({
        getUtxosByAddresses: () => {
          throw nodeError("Method not enabled: utxoindex must be enabled");
        }
      });
      const client = new KaspaJsonRpcClient({ url: "ws://mock", rpcFactory: rpc.factory, retry: { maxRetries: 0 } });
      await expect(client.getUtxosByAddress("kaspa:123")).rejects.toThrow(RpcIndexError);
    });

    it("should throw RpcIndexError when node returns txindex not enabled", async () => {
      const rpc = fakeOfficialRpc({
        getTransaction: () => {
          throw nodeError("Method not enabled: txindex must be enabled");
        }
      });
      const client = new KaspaJsonRpcClient({ url: "ws://mock", rpcFactory: rpc.factory, retry: { maxRetries: 0 } });
      await expect(client.getTransaction("tx123")).rejects.toThrow(RpcIndexError);
    });

    it("should return null when transaction is not found", async () => {
      const rpc = fakeOfficialRpc({
        getTransaction: () => {
          throw nodeError("Transaction tx123 not found");
        }
      });
      const client = new KaspaJsonRpcClient({ url: "ws://mock", rpcFactory: rpc.factory, retry: { maxRetries: 0 } });
      const result = await client.getTransaction("tx123");
      expect(result).toBeNull();
    });

    it("returns null for a transaction lookup the node does not serve (the official client has no getTransaction)", async () => {
      const rpc = fakeOfficialRpc({});
      const client = new KaspaJsonRpcClient({ url: "ws://mock", rpcFactory: rpc.factory, retry: { maxRetries: 0 } });
      expect(await client.getTransaction("tx123")).toBeNull();
      expect(rpc.calls).toEqual([]);
    });

    it("should throw RpcConnectionError when the node cannot be reached (e.g., ECONNREFUSED)", async () => {
      const rpc = fakeOfficialRpc({}, { connectError: "wRPC -> WebSocket -> Unable to connect to ws://mock" });
      const client = new KaspaJsonRpcClient({ url: "ws://mock", rpcFactory: rpc.factory, retry: { maxRetries: 0 } });
      await expect(client.getTransaction("tx123")).rejects.toThrow(RpcConnectionError);
    });

    it("should throw RpcProtocolError on malformed response", async () => {
      const rpc = fakeOfficialRpc({
        getTransaction: () => {
          throw new Error("Unexpected token < in JSON at position 0 (parse error)");
        }
      });
      const client = new KaspaJsonRpcClient({ url: "ws://mock", rpcFactory: rpc.factory, retry: { maxRetries: 0 } });
      await expect(client.getTransaction("tx123")).rejects.toThrow(RpcProtocolError);
    });

    it("should return [] when UTXOs are not found", async () => {
      const rpc = fakeOfficialRpc({
        getUtxosByAddresses: () => {
          throw nodeError("not found");
        }
      });
      const client = new KaspaJsonRpcClient({ url: "ws://mock", rpcFactory: rpc.factory, retry: { maxRetries: 0 } });
      const result = await client.getUtxosByAddress("kaspa:123");
      expect(result).toEqual([]);
    });

    it("reports the node's own text, not the official client's wrapper", async () => {
      const rpc = fakeOfficialRpc({
        getMempoolEntry: () => {
          throw nodeError("Transaction abc not found");
        }
      });
      const client = new JsonWrpcKaspaClient({ rpcUrl: "ws://mock", rpcFactory: rpc.factory });
      await expect(client.call("getMempoolEntry", { transactionId: "abc" })).rejects.toMatchObject({
        name: "RpcNotFoundError",
        message: "Transaction abc not found"
      });
      await expect(client.call("getMempoolEntry", { transactionId: "abc" })).rejects.toBeInstanceOf(RpcNotFoundError);
    });
  });

  describe("New RPC Methods Implementation (JsonWrpcKaspaClient)", () => {
    it("should map getFeeEstimate correctly", async () => {
      const mockResult = { estimate: { priorityBucket: { feerate: 10 } } };
      const rpc = fakeOfficialRpc({ getFeeEstimate: () => mockResult });
      const client = new JsonWrpcKaspaClient({ rpcUrl: "ws://mock", rpcFactory: rpc.factory });

      const result = await client.getFeeEstimate();
      expect(result).toEqual(mockResult);
      expect(rpc.calls).toEqual([{ method: "getFeeEstimate", request: {} }]);
    });

    it("should map getSinkBlueScore correctly (u64 as a JSON number)", async () => {
      const rpc = fakeOfficialRpc({ getSinkBlueScore: () => ({ blueScore: 1000n }) });
      const client = new JsonWrpcKaspaClient({ rpcUrl: "ws://mock", rpcFactory: rpc.factory });

      const result = await client.getSinkBlueScore();
      expect(result.blueScore).toBe(1000);
    });

    it("serves getVirtualSelectedParentBlueScore as the node's sink blue score", async () => {
      const rpc = fakeOfficialRpc({ getSinkBlueScore: () => ({ blueScore: 7n }) });
      const client = new JsonWrpcKaspaClient({ rpcUrl: "ws://mock", rpcFactory: rpc.factory });

      expect(await client.getVirtualSelectedParentBlueScore()).toEqual({ blueScore: 7 });
      expect(rpc.calls[0]!.method).toBe("getSinkBlueScore");
    });

    it("should map getSyncStatus correctly", async () => {
      const rpc = fakeOfficialRpc({ getSyncStatus: () => ({ isSynced: true }) });
      const client = new JsonWrpcKaspaClient({ rpcUrl: "ws://mock", rpcFactory: rpc.factory });

      const result = await client.getSyncStatus();
      expect(result.isSynced).toBe(true);
    });
  });

  describe("New RPC Methods Implementation (KaspaJsonRpcClient)", () => {
    it("should map getFeeEstimate correctly", async () => {
      const rpc = fakeOfficialRpc({ getFeeEstimate: () => ({ estimate: { priorityBucket: { feerate: 10 } } }) });
      const client = new KaspaJsonRpcClient({ url: "ws://mock", rpcFactory: rpc.factory });
      const result = await client.getFeeEstimate();
      expect(result.estimate.priorityBucket.feerate).toBe(10);
    });

    it("should map getSinkBlueScore correctly", async () => {
      const rpc = fakeOfficialRpc({ getSinkBlueScore: () => ({ blueScore: 2000n }) });
      const client = new KaspaJsonRpcClient({ url: "ws://mock", rpcFactory: rpc.factory });
      const result = await client.getSinkBlueScore();
      expect(result.blueScore).toBe(2000);
    });
  });
});
