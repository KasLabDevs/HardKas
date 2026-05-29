import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkKaspaRpcHealth, waitForKaspaRpcReady } from "../src/health";
import { KaspaJsonRpcClient } from "../src/json-rpc-client";
import { KaspaWrpcClient } from "../src/wrpc-client";

vi.mock("../src/json-rpc-client");
vi.mock("../src/wrpc-client");

describe("RPC Health API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return ready=true when client calls succeed", async () => {
    const mockClient = {
      connect: vi.fn().mockResolvedValue(undefined),
      getServerInfo: vi
        .fn()
        .mockResolvedValue({ serverVersion: "1.0.0", isSynced: true }),
      getBlockDagInfo: vi
        .fn()
        .mockResolvedValue({ networkId: "simnet", virtualDaaScore: 123n }),
      disconnect: vi.fn()
    };

    vi.mocked(KaspaWrpcClient).mockReturnValue(mockClient as any);

    const result = await checkKaspaRpcHealth();

    expect(result.ready).toBe(true);
    expect(result.networkId).toBe("simnet");
    expect(result.virtualDaaScore).toBe("123");
  });

  it("should return ready=false when a call fails", async () => {
    const mockClient = {
      connect: vi.fn().mockRejectedValue(new Error("Connection refused")),
      disconnect: vi.fn()
    };

    vi.mocked(KaspaWrpcClient).mockReturnValue(mockClient as any);

    const result = await checkKaspaRpcHealth();

    expect(result.ready).toBe(false);
    expect(result.lastError).toBe("Connection refused");
  });

  it("should wait for ready=true", async () => {
    const mockClientFail = {
      connect: vi.fn().mockRejectedValue(new Error("Connection refused")),
      disconnect: vi.fn()
    };

    const mockClientSuccess = {
      connect: vi.fn().mockResolvedValue(undefined),
      getServerInfo: vi
        .fn()
        .mockResolvedValue({ serverVersion: "1.0.0", isSynced: true }),
      getBlockDagInfo: vi
        .fn()
        .mockResolvedValue({ networkId: "simnet", virtualDaaScore: 123n }),
      disconnect: vi.fn()
    };

    // First call fails, second succeeds
    vi.mocked(KaspaWrpcClient)
      .mockReturnValueOnce(mockClientFail as any)
      .mockReturnValueOnce(mockClientSuccess as any);

    const result = await waitForKaspaRpcReady({ intervalMs: 1, maxWaitMs: 100 });

    expect(result.ready).toBe(true);
    expect(KaspaWrpcClient).toHaveBeenCalledTimes(2);
  });

  it("should timeout if never ready", async () => {
    const mockClient = {
      connect: vi.fn().mockRejectedValue(new Error("Connection refused")),
      disconnect: vi.fn()
    };

    vi.mocked(KaspaWrpcClient).mockReturnValue(mockClient as any);

    const result = await waitForKaspaRpcReady({ intervalMs: 1, maxWaitMs: 10 });

    expect(result.ready).toBe(false);
  });

  it("should fallback to KaspaJsonRpcClient for HTTP URL not containing 18210/18110", async () => {
    const mockClient = {
      healthCheck: vi.fn().mockResolvedValue({
        status: "healthy",
        info: {
          networkId: "mainnet",
          virtualDaaScore: 456n,
          serverVersion: "1.0.0",
          isSynced: true
        },
        latencyMs: 10
      })
    };

    vi.mocked(KaspaJsonRpcClient).mockReturnValue(mockClient as any);

    const result = await checkKaspaRpcHealth({ url: "http://127.0.0.1:8000" });

    expect(result.ready).toBe(true);
    expect(result.networkId).toBe("mainnet");
    expect(result.virtualDaaScore).toBe("456");
    expect(KaspaJsonRpcClient).toHaveBeenCalledTimes(1);
  });
});
