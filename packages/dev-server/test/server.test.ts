import { describe, it, expect, vi } from "vitest";
import { devServerEmitter } from "../src/stream.js";
import { createDevServer, resolveCorsOrigin } from "../src/server.js";

describe("Dev Server", () => {
  describe("SSE Emitter", () => {
    it("subscribes and receives events", () => {
      const listener = vi.fn();
      const unsubscribe = devServerEmitter.subscribe(listener);
      
      const eventData = { foo: "bar" };
      devServerEmitter.emit("test-event", eventData);
      
      expect(listener).toHaveBeenCalledWith({ event: "test-event", data: eventData });
      unsubscribe();
    });

    it("stops receiving events after unsubscribe", () => {
      const listener = vi.fn();
      const unsubscribe = devServerEmitter.subscribe(listener);
      
      unsubscribe();
      devServerEmitter.emit("test-event", { foo: "bar" });
      
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("API Endpoints", () => {
    const server = createDevServer({ port: 0, host: "localhost" });
    const app = server.app;

    it("returns health status", async () => {
      const res = await app.request("/api/health", { headers: { host: "localhost" } });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe("ok");
      expect(json.services).toBeDefined();
    });

    it("returns active session (null if none)", async () => {
      const res = await app.request("/api/session", { headers: { host: "localhost" } });
      expect(res.status).toBe(200);
      const json = await res.json();
      // Should be null if no session file exists in current cwd
      expect(json).toHaveProperty("active");
    });

    it("does not expose secrets in health response", async () => {
      const res = await app.request("/api/health", { headers: { host: "localhost" } });
      const text = await res.text();
      expect(text).not.toContain("privateKey");
      expect(text).not.toContain("mnemonic");
      expect(text).not.toContain("secret");
    });
  });

  describe("CORS Origin Helper", () => {
    it("handles undefined origin safely", () => {
      expect(resolveCorsOrigin(undefined, false)).toBeUndefined();
      expect(resolveCorsOrigin(undefined, true)).toBeUndefined();
    });

    it("allows localhost origins", () => {
      expect(resolveCorsOrigin("http://localhost:5173", false)).toBe("http://localhost:5173");
    });

    it("allows 127.0.0.1 origins", () => {
      expect(resolveCorsOrigin("http://127.0.0.1:5173", false)).toBe("http://127.0.0.1:5173");
    });

    it("allows IPv6 loopback origins", () => {
      expect(resolveCorsOrigin("http://[::1]:5173", false)).toBe("http://[::1]:5173");
    });

    it("rejects unauthorized remote origins by default", () => {
      expect(resolveCorsOrigin("http://malicious.com", false)).toBeNull();
    });

    it("allows unauthorized remote origins when unsafeExternal is enabled", () => {
      expect(resolveCorsOrigin("http://external-host.com", true)).toBe("http://external-host.com");
    });
  });
});
