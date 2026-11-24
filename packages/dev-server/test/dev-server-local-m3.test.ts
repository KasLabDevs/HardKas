// REMED-CLOSE: a workspace of its own (HARDKAS_ROOT), never the repository root's .hardkas — imported first
import "./helpers/isolated-root.js";
import { describe, it, expect, afterEach } from "vitest";
import { createDevServer, MIN_DEV_TOKEN_LENGTH } from "../src/server.js";

// AUDIT 2026-11-21 · M3 (DEV-SERVER-LOCAL-1) · "local only" was decided by the `Host` header, which the client writes, and a
// `-H <host>` bound the server anywhere with unsafeExternal false. Now: the socket's peer decides, a non-loopback bind needs
// --unsafe-external, HARDKAS_DEV_TOKEN has a minimum length, and `?token=` is taken on the SSE stream routes only.

const PORT = 7431;
const env = (remoteAddress: string) => ({ incoming: { socket: { remoteAddress } } });
const savedToken = process.env.HARDKAS_DEV_TOKEN;
afterEach(() => {
  if (savedToken === undefined) delete process.env.HARDKAS_DEV_TOKEN;
  else process.env.HARDKAS_DEV_TOKEN = savedToken;
});

describe("M3 · the dev server's 'local only' is decided on the socket", () => {
  const server = createDevServer({ port: PORT, host: "localhost", unsafeExternal: false });
  const app = server.app;
  const token = (server as any).token as string;
  const good = { host: `localhost:${PORT}`, Authorization: `Bearer ${token}` };

  it("DL-1 a remote peer with a forged Host header and the right token is refused (403)", async () => {
    const res = await app.request("/api/health", { headers: good }, env("203.0.113.9"));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/local requests only/);
  });

  it("DL-2 a loopback peer (IPv4, IPv6, mapped) is served as before", async () => {
    for (const peer of ["127.0.0.1", "::1", "::ffff:127.0.0.1"]) {
      const res = await app.request("/api/health", { headers: good }, env(peer));
      expect(res.status, peer).toBe(200);
    }
  });

  it("DL-3 an in-process call (no socket) is served before listening: the existing tests call the app that way", async () => {
    const res = await app.request("/api/health", { headers: good });
    expect(res.status).toBe(200);
  });

  it("DL-4 with --unsafe-external a remote peer reaches the server, and the token is still required", async () => {
    const open = createDevServer({ port: PORT + 1, host: "0.0.0.0", unsafeExternal: true });
    const t = (open as any).token as string;
    const noToken = await open.app.request("/api/health", { headers: { host: `10.0.0.5:${PORT + 1}` } }, env("203.0.113.9"));
    expect(noToken.status).toBe(401);
    const withToken = await open.app.request("/api/health", { headers: { host: `10.0.0.5:${PORT + 1}`, Authorization: `Bearer ${t}` } }, env("203.0.113.9"));
    expect(withToken.status).toBe(200);
  });
});

describe("M3 · the bind host and the token", () => {
  it("DL-5 a host that is not this machine, without --unsafe-external, is refused at creation", () => {
    for (const host of ["0.0.0.0", "192.168.1.20", "example.test", "::"]) {
      expect(() => createDevServer({ port: PORT + 2, host, unsafeExternal: false }), host).toThrowError(/DEV_SERVER_HOST_NOT_LOOPBACK/);
    }
    for (const host of ["localhost", "127.0.0.1", "::1", "[::1]"]) {
      expect(() => createDevServer({ port: PORT + 2, host, unsafeExternal: false }), host).not.toThrow();
    }
  });

  it("DL-6 HARDKAS_DEV_TOKEN shorter than the minimum is refused; one at the minimum is the session token", () => {
    process.env.HARDKAS_DEV_TOKEN = "x".repeat(MIN_DEV_TOKEN_LENGTH - 1);
    expect(() => createDevServer({ port: PORT + 3, host: "localhost", unsafeExternal: false })).toThrowError(/DEV_SERVER_TOKEN_TOO_WEAK/);
    process.env.HARDKAS_DEV_TOKEN = "y".repeat(MIN_DEV_TOKEN_LENGTH);
    const ok = createDevServer({ port: PORT + 3, host: "localhost", unsafeExternal: false });
    expect((ok as any).token).toBe("y".repeat(MIN_DEV_TOKEN_LENGTH));
  });
});

describe("M3 · ?token= is for the SSE stream routes only", () => {
  const server = createDevServer({ port: PORT + 4, host: "localhost", unsafeExternal: false });
  const app = server.app;
  const token = (server as any).token as string;
  const host = `localhost:${PORT + 4}`;

  it("DL-7 GET /api/health?token= is refused (401), the header form works", async () => {
    expect((await app.request(`/api/health?token=${token}`, { headers: { host } })).status).toBe(401);
    expect((await app.request(`/api/health`, { headers: { host, Authorization: `Bearer ${token}` } })).status).toBe(200);
  });

  it("DL-8 GET on the stream routes with ?token= passes the token check (not 401)", async () => {
    for (const route of ["/api/stream", "/api/artifacts/stream"]) {
      const res = await app.request(`${route}?token=${token}`, { headers: { host } });
      expect(res.status, route).not.toBe(401);
      await res.body?.cancel().catch(() => {});
    }
  });
});
