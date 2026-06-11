import { describe, it, expect, vi } from "vitest";
import { createHardkasClient } from "../src/client.js";

const globalFetch = global.fetch;

describe("SDK High-level Client Facade", () => {
  it("builds correct URL based on baseUrl", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: async () => ({ ok: true, data: [{ name: "alice" }] })
    });
    global.fetch = mockFetch;

    const client = createHardkasClient({ baseUrl: "http://127.0.0.1:8080" });
    await client.accounts.list();

    expect(mockFetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8080/api/accounts",
      expect.any(Object)
    );
  });

  it("returns stable envelope on network error", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("Network fail"));
    global.fetch = mockFetch;

    const client = createHardkasClient({ baseUrl: "http://localhost:7420" });
    const res = await client.localnet.status();

    expect(res.ok).toBe(false);
    expect(res.error?.code).toBe("LOCALNET_RPC_RETRY_EXHAUSTED");
    expect(res.meta.network).toBeDefined();
  });
});
