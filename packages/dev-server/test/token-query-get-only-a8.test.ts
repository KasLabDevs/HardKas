// REMED-CLOSE: a workspace of its own (HARDKAS_ROOT), never the repository root's .hardkas — imported first
import "./helpers/isolated-root.js";
import { describe, it, expect, vi, afterEach } from "vitest";
import crypto from "node:crypto";
import { createDevServer } from "../src/server.js";

// A8 (rc2 audit) · the dev-server session token was accepted as `?token=` on every /api route, mutating ones included
// (so it could end in shell history and proxy logs through a POST URL), and compared with `!==`. Now `?token=` is
// accepted on GET/HEAD only (what an EventSource needs) and the comparison is crypto.timingSafeEqual.

const PORT = 7431;
const host = `127.0.0.1:${PORT}`;
const server = createDevServer({ port: PORT, host: "127.0.0.1", unsafeExternal: false });
const app = server.app;
const token: string = (server as any).token;

afterEach(() => vi.restoreAllMocks());

describe("A8 · ?token= on GET only, constant-time comparison", () => {
  it("GET with ?token= → accepted (the SSE / EventSource case)", async () => {
    const res = await app.request(`/api/health?token=${token}`, { headers: { host } });
    expect(res.status).toBe(200);
  });

  it("POST with only ?token= (CSRF header present) → 401, and the answer says to use Authorization: Bearer", async () => {
    const res = await app.request(`/api/session/start?token=${token}`, { method: "POST", headers: { host, "X-Hardkas-Request": "true" } });
    expect(res.status).toBe(401);
    expect((await res.json()).error).toMatch(/GET requests only.*Authorization: Bearer/);
  });

  it("POST with Authorization: Bearer → past the token check", async () => {
    const res = await app.request(`/api/session/start`, { method: "POST", headers: { host, "X-Hardkas-Request": "true", Authorization: `Bearer ${token}` } });
    expect(res.status).not.toBe(401);
  });

  it("a wrong token of the same length, a prefix of the token, or none → 401; compared with crypto.timingSafeEqual", async () => {
    const spy = vi.spyOn(crypto, "timingSafeEqual");
    const wrong = token.slice(0, -1) + (token.endsWith("0") ? "1" : "0");
    for (const t of [wrong, token.slice(0, 10)]) {
      const res = await app.request(`/api/health`, { headers: { host, Authorization: `Bearer ${t}` } });
      expect(res.status, t).toBe(401);
    }
    expect((await app.request(`/api/health`, { headers: { host } })).status).toBe(401);
    expect(spy).toHaveBeenCalled();
  });
});
