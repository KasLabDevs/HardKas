import { describe, it, expect, vi } from "vitest";
import { EvmJsonRpcClient } from "../src/evm-rpc-client.js";

describe("EvmJsonRpcClient", () => {
  it("should send correct JSON-RPC request and parse chainId", async () => {
    const mockFetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ jsonrpc: "2.0", id: 1, result: "0x3039" }) // 12345 in hex
    });

    const client = new EvmJsonRpcClient({ url: "http://localhost:8545", fetcher: mockFetcher as any });
    const chainId = await client.getChainId();

    expect(chainId).toBe(12345);
    expect(mockFetcher).toHaveBeenCalledWith("http://localhost:8545", expect.objectContaining({
      method: "POST",
      body: expect.stringContaining('"method":"eth_chainId"')
    }));
  });

  it("should parse blockNumber as bigint", async () => {
    const mockFetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ jsonrpc: "2.0", id: 1, result: "0x64" }) // 100 in hex
    });

    const client = new EvmJsonRpcClient({ url: "http://localhost:8545", fetcher: mockFetcher as any });
    const blockNumber = await client.getBlockNumber();

    expect(blockNumber).toBe(100n);
  });

  it("should handle JSON-RPC errors", async () => {
    const mockFetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ jsonrpc: "2.0", id: 1, error: { code: -32601, message: "Method not found" } })
    });

    const client = new EvmJsonRpcClient({ url: "http://localhost:8545", fetcher: mockFetcher as any });
    await expect(client.getChainId()).rejects.toThrow(/JSON-RPC error: Method not found/);
  });

  it("should handle HTTP errors", async () => {
    const mockFetcher = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error"
    });

    const client = new EvmJsonRpcClient({ url: "http://localhost:8545", fetcher: mockFetcher as any });
    await expect(client.getChainId()).rejects.toThrow(/HTTP error 500/);
  });

  it("should get balance for an address", async () => {
    const mockFetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ jsonrpc: "2.0", id: 1, result: "0xde0b6b3a7640000" }) // 1 ether in hex
    });

    const client = new EvmJsonRpcClient({ url: "http://localhost:8545", fetcher: mockFetcher as any });
    const balance = await client.getBalanceWei("0x0000000000000000000000000000000000000000");

    expect(balance).toBe(1000000000000000000n);
  });

  it("should get nonce for an address", async () => {
    const mockFetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ jsonrpc: "2.0", id: 1, result: "0x7" })
    });

    const client = new EvmJsonRpcClient({ url: "http://localhost:8545", fetcher: mockFetcher as any });
    const nonce = await client.getTransactionCount("0x0000000000000000000000000000000000000000");

    expect(nonce).toBe(7n);
  });

  it("should reject invalid addresses", async () => {
    const client = new EvmJsonRpcClient({ url: "http://localhost:8545" });
    await expect(client.getBalanceWei("invalid")).rejects.toThrow(/Invalid.*address/);
    await expect(client.getBalanceWei("0x123")).rejects.toThrow(/Invalid.*address/);
  });

  it("should perform eth_call", async () => {
    const mockFetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ jsonrpc: "2.0", id: 1, result: "0x1234" })
    });

    const client = new EvmJsonRpcClient({ url: "http://localhost:8545", fetcher: mockFetcher as any });
    const result = await client.call({
      to: "0x0000000000000000000000000000000000000000",
      data: "0x6060"
    });

    expect(result).toBe("0x1234");
    expect(mockFetcher).toHaveBeenCalledWith("http://localhost:8545", expect.objectContaining({
      body: expect.stringContaining('"method":"eth_call"')
    }));
  });

  it("should perform eth_estimateGas", async () => {
    const mockFetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ jsonrpc: "2.0", id: 1, result: "0x5208" }) // 21000 in hex
    });

    const client = new EvmJsonRpcClient({ url: "http://localhost:8545", fetcher: mockFetcher as any });
    const gas = await client.estimateGas({
      to: "0x0000000000000000000000000000000000000000"
    });

    expect(gas).toBe(21000n);
  });

  it.skip("should reject invalid call requests", async () => {
    const client = new EvmJsonRpcClient({ url: "http://localhost:8545" });
    
    // Missing to
    await expect(client.call({ to: "" } as any)).rejects.toThrow(/required/);
    
    // Invalid data
    await expect(client.call({ 
      to: "0x0000000000000000000000000000000000000000",
      data: "invalid"
    })).rejects.toThrow(/Invalid hex data/);

    // Invalid value
    await expect(client.call({ 
      to: "0x0000000000000000000000000000000000000000",
      value: "100" // No 0x
    })).rejects.toThrow(/Invalid hex value/);
  });
});
