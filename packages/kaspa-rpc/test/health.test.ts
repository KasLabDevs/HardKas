import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkKaspaRpcHealth, waitForKaspaRpcReady } from "../src/health";
import { KaspaJsonRpcClient } from "../src/json-rpc-client";

vi.mock("../src/json-rpc-client");

describe("RPC Health API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return ready=true when client calls succeed", async () => {
    const mockClient = {
      healthCheck: vi.fn().mockResolvedValue({ 
        status: "healthy",
        info: {
          networkId: "simnet", 
          virtualDaaScore: 123n,
          serverVersion: "1.0.0", 
          isSynced: true 
        },
        latencyMs: 10
      })
    };
    
    vi.mocked(KaspaJsonRpcClient).mockReturnValue(mockClient as any);

    const result = await checkKaspaRpcHealth();
    
    expect(result.ready).toBe(true);
    expect(result.networkId).toBe("simnet");
    expect(result.virtualDaaScore).toBe("123");
    expect(result.latencyMs).toBe(10);
  });

  it("should return ready=false when a call fails", async () => {
    const mockClient = {
      healthCheck: vi.fn().mockRejectedValue(new Error("Connection refused"))
    };
    
    vi.mocked(KaspaJsonRpcClient).mockReturnValue(mockClient as any);

    const result = await checkKaspaRpcHealth();
    
    expect(result.ready).toBe(false);
    expect(result.lastError).toBe("Connection refused");
  });

  it("should wait for ready=true", async () => {
    const mockClientFail = {
      healthCheck: vi.fn().mockResolvedValue({ status: "unreachable" })
    };
    
    const mockClientSuccess = {
      healthCheck: vi.fn().mockResolvedValue({ 
        status: "healthy",
        info: { networkId: "simnet" } 
      })
    };

    // First call fails, second succeeds
    vi.mocked(KaspaJsonRpcClient)
      .mockReturnValueOnce(mockClientFail as any)
      .mockReturnValueOnce(mockClientSuccess as any);

    const result = await waitForKaspaRpcReady({ intervalMs: 1, maxWaitMs: 100 });
    
    expect(result.ready).toBe(true);
    expect(KaspaJsonRpcClient).toHaveBeenCalledTimes(2);
  });

  it("should timeout if never ready", async () => {
    const mockClient = {
      healthCheck: vi.fn().mockResolvedValue({ status: "unreachable" })
    };
    
    vi.mocked(KaspaJsonRpcClient).mockReturnValue(mockClient as any);

    const result = await waitForKaspaRpcReady({ intervalMs: 1, maxWaitMs: 10 });
    
    expect(result.ready).toBe(false);
  });
});
