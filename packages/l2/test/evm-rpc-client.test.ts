import { describe, it, expect, vi } from "vitest";
import { EvmJsonRpcClient } from "../src/evm-rpc-client.js";
import { rpcFetcher } from "./helpers/mock-fetch.js";

describe("EvmJsonRpcClient", () => {
  it("should send correct JSON-RPC request and parse chainId", async () => {
    const mockFetcher = rpcFetcher(() => ({ result: "0x3039" })); // 12345 in hex

    const client = new EvmJsonRpcClient({
      url: "http://localhost:8545",
      fetcher: mockFetcher as any
    });
    const chainId = await client.getChainId();

    expect(chainId).toBe(12345);
    expect(mockFetcher).toHaveBeenCalledWith(
      "http://localhost:8545",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"method":"eth_chainId"')
      })
    );
  });

  it("should parse blockNumber as bigint", async () => {
    const client = new EvmJsonRpcClient({
      url: "http://localhost:8545",
      fetcher: rpcFetcher(() => ({ result: "0x64" })) as any // 100 in hex
    });
    expect(await client.getBlockNumber()).toBe(100n);
  });

  it("should handle JSON-RPC errors", async () => {
    const client = new EvmJsonRpcClient({
      url: "http://localhost:8545",
      fetcher: rpcFetcher(() => ({ error: { code: -32601, message: "Method not found" } })) as any
    });
    await expect(client.getChainId()).rejects.toThrow(/JSON-RPC error: Method not found/);
  });

  it("should handle HTTP errors", async () => {
    const mockFetcher = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      text: async () => ""
    });

    const client = new EvmJsonRpcClient({
      url: "http://localhost:8545",
      fetcher: mockFetcher as any
    });
    await expect(client.getChainId()).rejects.toThrow(/HTTP error 500/);
  });

  it("should get balance for an address", async () => {
    const client = new EvmJsonRpcClient({
      url: "http://localhost:8545",
      fetcher: rpcFetcher(() => ({ result: "0xde0b6b3a7640000" })) as any // 1 ether
    });
    expect(await client.getBalanceWei("0x0000000000000000000000000000000000000000")).toBe(
      1000000000000000000n
    );
  });

  it("should get nonce for an address", async () => {
    const client = new EvmJsonRpcClient({
      url: "http://localhost:8545",
      fetcher: rpcFetcher(() => ({ result: "0x7" })) as any
    });
    expect(
      await client.getTransactionCount("0x0000000000000000000000000000000000000000")
    ).toBe(7n);
  });

  it("should reject invalid addresses", async () => {
    const client = new EvmJsonRpcClient({ url: "http://localhost:8545" });
    await expect(client.getBalanceWei("invalid")).rejects.toThrow(/Invalid.*address/);
    await expect(client.getBalanceWei("0x123")).rejects.toThrow(/Invalid.*address/);
  });

  it("should perform eth_call", async () => {
    const mockFetcher = rpcFetcher(() => ({ result: "0x1234" }));
    const client = new EvmJsonRpcClient({
      url: "http://localhost:8545",
      fetcher: mockFetcher as any
    });
    const result = await client.call({
      to: "0x0000000000000000000000000000000000000000",
      data: "0x6060"
    });

    expect(result).toBe("0x1234");
    expect(mockFetcher).toHaveBeenCalledWith(
      "http://localhost:8545",
      expect.objectContaining({
        body: expect.stringContaining('"method":"eth_call"')
      })
    );
  });

  it("should perform eth_estimateGas", async () => {
    const client = new EvmJsonRpcClient({
      url: "http://localhost:8545",
      fetcher: rpcFetcher(() => ({ result: "0x5208" })) as any // 21000
    });
    expect(
      await client.estimateGas({ to: "0x0000000000000000000000000000000000000000" })
    ).toBe(21000n);
  });

  it("validates and rejects invalid call requests before sending to node", async () => {
    const client = new EvmJsonRpcClient({ url: "http://localhost:8545" });

    // Missing to
    await expect(client.call({ to: "" } as any)).rejects.toThrow(/required/);

    // Invalid data
    await expect(
      client.call({
        to: "0x0000000000000000000000000000000000000000",
        data: "invalid"
      })
    ).rejects.toThrow(/Invalid hex data/);

    // Invalid value
    await expect(
      client.call({
        to: "0x0000000000000000000000000000000000000000",
        value: "100" // No 0x
      })
    ).rejects.toThrow(/Invalid hex value/);
  });
});
