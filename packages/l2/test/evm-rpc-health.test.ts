import { describe, it, expect, vi } from "vitest";
import { checkEvmRpcHealth } from "../src/evm-rpc-health.js";

describe("checkEvmRpcHealth", () => {
  it("should return ready=true if all calls succeed", async () => {
    const mockFetcher = vi.fn().mockImplementation(async (url, init) => {
      const body = JSON.parse(init.body);
      let result = "";
      if (body.method === "eth_chainId") result = "0x3039";
      if (body.method === "eth_blockNumber") result = "0x64";
      if (body.method === "eth_gasPrice") result = "0x3b9aca00"; // 1 gwei

      return {
        ok: true,
        json: async () => ({ jsonrpc: "2.0", id: body.id, result })
      };
    });

    const result = await checkEvmRpcHealth({ url: "http://localhost:8545", fetcher: mockFetcher as any });

    expect(result.ready).toBe(true);
    expect(result.chainId).toBe(12345);
    expect(result.blockNumber).toBe(100n);
    expect(result.gasPriceWei).toBe(1000000000n);
  });

  it("should return ready=false if a call fails", async () => {
    const mockFetcher = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found"
    });

    const result = await checkEvmRpcHealth({ url: "http://localhost:8545", fetcher: mockFetcher as any });

    expect(result.ready).toBe(false);
    expect(result.error).toBeDefined();
  });
});
