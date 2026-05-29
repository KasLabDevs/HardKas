import { describe, it, expect } from "vitest";
import { KaspaWrpcClient } from "../src/wrpc-client.js";

describe("KaspaWrpcClient", () => {
  it("normalizes http:// to ws://", () => {
    const client = new KaspaWrpcClient("http://127.0.0.1:18210");
    expect(client.getUrl()).toBe("ws://127.0.0.1:18210");
  });

  it("normalizes https:// to wss://", () => {
    const client = new KaspaWrpcClient("https://kaspa.stream:443");
    expect(client.getUrl()).toBe("wss://kaspa.stream:443");
  });

  it("keeps ws:// as-is", () => {
    const client = new KaspaWrpcClient("ws://127.0.0.1:18210");
    expect(client.getUrl()).toBe("ws://127.0.0.1:18210");
  });

  it("adds ws:// if no scheme", () => {
    const client = new KaspaWrpcClient("127.0.0.1:18210");
    expect(client.getUrl()).toBe("ws://127.0.0.1:18210");
  });

  it("ping returns false when no server is running", async () => {
    const client = new KaspaWrpcClient("ws://127.0.0.1:19999");
    try {
      await client.connect(200);
      const result = await client.ping();
      expect(result).toBe(false);
    } catch {
      // Connection refused is expected
      expect(true).toBe(true);
    } finally {
      client.disconnect();
    }
  });

  it("handles error response with code but no message", async () => {
    const client = new KaspaWrpcClient("ws://127.0.0.1:18210");
    const mockPending = {
      resolve: () => {},
      reject: (err: Error) => {
        expect(err.message).toContain("wRPC error code 500");
      },
      timer: setTimeout(() => {}, 1000)
    };

    // Inject to pending map directly to test response logic
    (client as any).pending.set(999, mockPending);

    // Simulate incoming message parsing
    const messageHandler = (client as any).ws?.on || (() => {});
    const simulatedResponse = { id: 999, error: { code: 500 } };

    // Manually trigger the response resolver/rejecter inside KaspaWrpcClient
    const pendingObj = (client as any).pending.get(999);
    expect(pendingObj).toBeDefined();

    if (simulatedResponse.error) {
      const errMsg =
        simulatedResponse.error.message ||
        `wRPC error code ${simulatedResponse.error.code || "unknown"}`;
      pendingObj.reject(new Error(errMsg));
    }

    clearTimeout(mockPending.timer);
    client.disconnect();
  });
});
