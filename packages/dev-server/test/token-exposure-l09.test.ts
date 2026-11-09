// REMED-CLOSE: a workspace of its own (HARDKAS_ROOT), never the repository root's .hardkas — imported first
import "./helpers/isolated-root.js";
import { describe, it, expect } from "vitest";
import { createDevServer } from "../src/server.js";

// -----------------------------------------------------------------------------
// L-09 (3-nov audit). The dev server read the dashboard's index.html and injected
// `window.__HARDKAS_DEV_TOKEN__ = "<token>"` into every `GET /*` whose Host was valid; with --unsafe-external the Host
// check is off, so any client that reached the port got the session token from the HTML. The owner's 0.13.0-rc.1
// (5ee6b2545) retired the dashboard: `GET /` answers the JSON endpoint catalog and no route embeds the token. These
// cases pin that, for both configurations, and add `Cache-Control: no-store` to every response (workspace data and the
// catalog are never kept by a browser or proxy cache). The token reaches a client only out of band: the 0600 file
// .hardkas/dev-server-token the CLI writes, or HARDKAS_DEV_TOKEN set by the operator.
// -----------------------------------------------------------------------------

const PORT = 7420;

function servers() {
  return [
    { label: "default (loopback Host only)", server: createDevServer({ port: PORT, host: "localhost", unsafeExternal: false }), host: `localhost:${PORT}` },
    { label: "--unsafe-external (any Host)", server: createDevServer({ port: PORT, host: "0.0.0.0", unsafeExternal: true }), host: "lan-peer.example:7420" }
  ];
}

/** Every byte a client can read from a response: status line, headers and body. */
async function readable(res: Response): Promise<string> {
  const headers: string[] = [];
  res.headers.forEach((v, k) => headers.push(`${k}: ${v}`));
  return `${res.status}\n${headers.join("\n")}\n\n${await res.text()}`;
}

const UNAUTHENTICATED_PATHS = ["/", "/index.html", "/dashboard", "/assets/index.js", "/?launch=x", "/api/health", "/api/stream"];

describe("L-09 · the dev server never hands its session token to an unauthenticated request", () => {
  for (const { label, server, host } of servers()) {
    it(`${label}: no unauthenticated GET carries the token in its status, headers or body`, async () => {
      expect(server.token.length).toBeGreaterThanOrEqual(8);
      for (const p of UNAUTHENTICATED_PATHS) {
        const res = await server.app.request(p, { headers: { host } });
        const seen = await readable(res);
        expect(seen.includes(server.token), `${p} leaked the token:\n${seen.slice(0, 400)}`).toBe(false);
      }
    });

    it(`${label}: GET / is the JSON endpoint catalog, never an HTML page a script could be injected into`, async () => {
      const res = await server.app.request("/", { headers: { host } });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type") ?? "").toMatch(/application\/json/);
      expect(res.headers.get("content-type") ?? "").not.toMatch(/text\/html/);
      const body = await res.json();
      expect(body).toMatchObject({ name: "HardKas Dev Server", status: "running" });
      expect(JSON.stringify(body)).not.toMatch(/__HARDKAS_DEV_TOKEN__|token/i);
    });

    it(`${label}: the API still needs the token (401 without it, 200 with it)`, async () => {
      expect((await server.app.request("/api/health", { headers: { host } })).status).toBe(401);
      expect((await server.app.request("/api/health", { headers: { host, Authorization: `Bearer ${server.token}` } })).status).toBe(200);
    });

    it(`${label}: every response says Cache-Control: no-store (catalog, 401 and authenticated API answers)`, async () => {
      const responses = [
        await server.app.request("/", { headers: { host } }),
        await server.app.request("/api/health", { headers: { host } }),
        await server.app.request("/api/health", { headers: { host, Authorization: `Bearer ${server.token}` } })
      ];
      for (const res of responses) expect(res.headers.get("cache-control"), `status ${res.status}`).toBe("no-store");
    });
  }

  it("a request refused for its Host (DNS rebinding) carries no token and is not cacheable either", async () => {
    const server = createDevServer({ port: PORT, host: "localhost", unsafeExternal: false });
    const res = await server.app.request("/", { headers: { host: "attacker.example" } });
    expect(res.status).toBe(403);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect((await readable(res)).includes(server.token)).toBe(false);
  });
});
