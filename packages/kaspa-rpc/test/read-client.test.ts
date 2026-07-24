import { describe, it, expect, vi } from "vitest";
import { ReadRpcClientImpl } from "../src/clients/read-rpc-client.js";
import type { RpcTransport, RpcOptions } from "../src/transport/transport.js";

class MockTransport implements RpcTransport {
  public calls: Array<{ method: string; request: any; options: any }> = [];
  public mockResponses: Record<string, any> = {};

  async send<TRequest, TResponse>(
    method: string,
    request?: TRequest,
    options?: RpcOptions
  ): Promise<TResponse> {
    this.calls.push({ method, request, options });
    return this.mockResponses[method] as TResponse;
  }

  subscribe<TNotification>() { throw new Error("Not implemented"); }
  unsubscribe<TNotification>() { throw new Error("Not implemented"); }
  async close() {}
}

describe("ReadRpcClientImpl", () => {
  it("should delegate getBlock correctly", async () => {
    const transport = new MockTransport();
    transport.mockResponses["getBlockRequest"] = { block: { header: { hashMerkleRoot: "123" } } };
    const client = new ReadRpcClientImpl(transport);
    
    const abort = new AbortController();
    const result = await client.getBlock({ hash: "abc", includeTransactions: true }, { signal: abort.signal });
    
    expect(result.block.header.hashMerkleRoot).toBe("123");
    expect(transport.calls.length).toBe(1);
    expect(transport.calls[0].method).toBe("getBlockRequest");
    expect(transport.calls[0].request).toEqual({ hash: "abc", includeTransactions: true });
    expect(transport.calls[0].options?.signal).toBe(abort.signal);
  });

  it("should delegate getVirtualChainFromBlock correctly", async () => {
    const transport = new MockTransport();
    transport.mockResponses["getVirtualChainFromBlockRequest"] = { removedChainBlockHashes: ["r1"], addedChainBlockHashes: ["a1"] };
    const client = new ReadRpcClientImpl(transport);
    
    const result = await client.getVirtualChainFromBlock({ startHash: "start1", includeAcceptedTransactionIds: false });
    
    expect(result.removedChainBlockHashes).toEqual(["r1"]);
    expect(transport.calls.length).toBe(1);
    expect(transport.calls[0].method).toBe("getVirtualChainFromBlockRequest");
    expect(transport.calls[0].request).toEqual({ startHash: "start1", includeAcceptedTransactionIds: false });
  });

  it("should delegate getCoinSupply correctly", async () => {
    const transport = new MockTransport();
    transport.mockResponses["getCoinSupplyRequest"] = { maxSompi: "1000", circulatingSompi: "500" };
    const client = new ReadRpcClientImpl(transport);
    
    const result = await client.getCoinSupply();
    
    expect(result.maxSompi).toBe("1000");
    expect(transport.calls.length).toBe(1);
    expect(transport.calls[0].method).toBe("getCoinSupplyRequest");
    expect(transport.calls[0].request).toEqual({});
  });
});
