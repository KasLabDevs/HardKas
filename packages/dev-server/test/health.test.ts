import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";
import { healthRoutes } from "../src/routes/health.js";

// Mock loadHardkasConfig
vi.mock("@hardkas/config", () => {
  let mockConfig = {
    defaultNetwork: "simnet",
    networks: {
      simnet: {
        kind: "kaspa-node",
        network: "simnet",
        rpcUrl: "ws://127.0.0.1:18210"
      },
      mainnet: {
        kind: "kaspa-rpc",
        network: "mainnet",
        rpcUrl: "wss://kaspa.stream:443"
      }
    }
  };

  return {
    loadHardkasConfig: async () => ({
      config: mockConfig
    }),
    // Helper to change mocked config dynamically in tests
    _setMockConfig: (cfg: any) => {
      mockConfig = cfg;
    }
  };
});

describe("Dev Server Health Route", () => {
  it("does not accidentally select mainnet for health check", async () => {
    const { _setMockConfig } = await import("@hardkas/config") as any;
    _setMockConfig({
      defaultNetwork: "simnet",
      networks: {
        simnet: {
          kind: "kaspa-node",
          network: "simnet",
          rpcUrl: "ws://127.0.0.1:18210"
        },
        mainnet: {
          kind: "kaspa-rpc",
          network: "mainnet",
          rpcUrl: "wss://kaspa.stream:443"
        }
      }
    });

    const app = new Hono();
    app.route("/api/health", healthRoutes);

    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    const json = await res.json();
    
    // It should have selected simnet as default, and since port 18210 might be offline in tests,
    // it will return offline or stale depending on L2, but it should probe simnet, NOT mainnet url.
    expect(json.services.kaspa.url).toBe("ws://127.0.0.1:18210");
  });

  it("returns simulated-mode when defaultNetwork is simulated", async () => {
    const { _setMockConfig } = await import("@hardkas/config") as any;
    _setMockConfig({
      defaultNetwork: "simulated",
      networks: {
        simulated: {
          kind: "simulated"
        },
        simnet: {
          kind: "kaspa-node",
          network: "simnet",
          rpcUrl: "ws://127.0.0.1:18210"
        }
      }
    });

    const app = new Hono();
    app.route("/api/health", healthRoutes);

    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    const json = await res.json();

    // It should return simulated-mode status directly
    expect(json.kaspa.status).toBe("simulated-mode");
    expect(json.kaspa.daaScore).toBe(0);
    expect(json.services.kaspa.status).toBe("simulated-mode");
  });
});
