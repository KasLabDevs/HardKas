import { describe, it, expect } from "vitest";
import { createDevServer } from "../src/server.js";

describe("Dev Server Security Hardening", () => {
  describe("Authentication and Host Checks", () => {
    const server = createDevServer({ port: 7420, host: "localhost", unsafeExternal: false });
    const app = server.app;
    const token = (server as any).token;

    // Test 1: GET without token rejected
    it("Test 1 — GET without token rejected (401)", async () => {
      const res = await app.request("/api/health", {
        headers: {
          host: "localhost:7420"
        }
      });
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toContain("bearer token");
    });

    // Test 2: GET with wrong token rejected
    it("Test 2 — GET with wrong token rejected (401)", async () => {
      const res = await app.request("/api/health", {
        headers: {
          host: "localhost:7420",
          Authorization: "Bearer wrong-token"
        }
      });
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toContain("bearer token");
    });

    // Test 3: GET with correct token accepted
    it("Test 3 — GET with correct token accepted (200)", async () => {
      const res = await app.request("/api/health", {
        headers: {
          host: "localhost:7420",
          Authorization: `Bearer ${token}`
        }
      });
      expect(res.status).toBe(200);
    });

    // Test 4: POST with token but missing CSRF header rejected
    it("Test 4 — POST with token but missing CSRF header rejected (403)", async () => {
      const res = await app.request("/api/transactions", {
        method: "POST",
        headers: {
          host: "localhost:7420",
          Authorization: `Bearer ${token}`
        }
      });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain("CSRF");
    });

    // Test 5: POST with token + CSRF header accepted
    it("Test 5 — POST with token + CSRF header accepted or reaches route validation (not 401/403)", async () => {
      const res = await app.request("/api/transactions", {
        method: "POST",
        headers: {
          host: "localhost:7420",
          Authorization: `Bearer ${token}`,
          "X-Hardkas-Request": "true",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ from: "alice", to: "bob", amount: "10" })
      });
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    });

    // Test 6: hostile Origin rejected (CORS)
    it("Test 6 — hostile Origin rejected (blocked / no CORS approval)", async () => {
      const res = await app.request("/api/health", {
        headers: {
          host: "localhost:7420",
          Origin: "https://evil.example",
          Authorization: `Bearer ${token}`
        }
      });
      expect(res.headers.get("access-control-allow-origin")).toBeNull();
    });

    // Test 7: DNS rebinding Host rejected
    it("Test 7 — DNS rebinding Host rejected (403)", async () => {
      const res = await app.request("/api/health", {
        headers: {
          host: "attacker.example",
          Authorization: `Bearer ${token}`
        }
      });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain("Host");
    });
  });

  describe("Unsafe External Security Configuration", () => {
    // Test 8: unsafe-external still requires token
    it("Test 8 — unsafe-external still requires token (401)", async () => {
      const externalServer = createDevServer({ port: 7420, host: "0.0.0.0", unsafeExternal: true });
      const app = externalServer.app;
      
      const res = await app.request("/api/health", {
        headers: {
          host: "any-host.example"
        }
      });
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toContain("bearer token");
    });
  });
});
