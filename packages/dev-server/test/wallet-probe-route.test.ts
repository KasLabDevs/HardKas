// REMED-CLOSE: a workspace of its own (HARDKAS_ROOT), never the repository root's .hardkas — imported first
import "./helpers/isolated-root.js";
import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Hono } from "hono";
import { createDevServer } from "../src/server.js";
import { createWalletProbeRoutes } from "../src/routes/wallet-probe.js";

// -----------------------------------------------------------------------------
// R3-C · the wallet probe route: the page and the SDK's browser entry are served to loopback peers only; the API is
// behind the server's token and CSRF header like every /api route; mainnet (by name or by an alias that declares it) is
// refused before anything is planned; only the browser entry and its chunks are served from the SDK's dist.
// -----------------------------------------------------------------------------

const LOOP = { incoming: { socket: { remoteAddress: "127.0.0.1" } } };
const FAR = { incoming: { socket: { remoteAddress: "192.168.1.20" } } };
const made: string[] = [];
afterAll(() => {
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

function distDir(withSigner = true): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "hk-r3c-probe-dist-"));
  made.push(d);
  fs.writeFileSync(path.join(d, "client.js"), withSigner ? 'import "./chunk-ABC123.js";\nexport { connectBrowserWallet } from "./chunk-ABC123.js";\n' : "export const createHardkasClient = 1;\n");
  fs.writeFileSync(path.join(d, "chunk-ABC123.js"), "export function connectBrowserWallet() {}\n");
  fs.writeFileSync(path.join(d, "index.js"), "import fs from 'node:fs';\n");
  return d;
}

function fakeSdk(network: string, config: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const sdk: any = {
    network,
    config: { config },
    sdkConfig: config,
    execution: { mode: "rpc" },
    close: async () => calls.push("close"),
    tx: {
      plan: async () => {
        calls.push("tx.plan");
        throw new Error("must not be reached");
      }
    },
    rpc: new Proxy({}, { get: (_t, p) => () => calls.push(`rpc.${String(p)}`) })
  };
  return { sdk, calls };
}

function app(options: Parameters<typeof createWalletProbeRoutes>[0]) {
  const a = new Hono();
  a.route("/", createWalletProbeRoutes(options));
  return a;
}

describe("R3-C · the probe page and the SDK's browser entry: loopback only", () => {
  it("the page is served to 127.0.0.1, loads the browser entry from this server, carries no token, and refuses everyone else", async () => {
    const a = app({ sdkDistDir: distDir() });
    const ok = await a.request("/wallet-probe", {}, LOOP);
    expect(ok.status).toBe(200);
    const html = await ok.text();
    expect(html).toContain('from "/wallet-probe/sdk/client.js"');
    expect(html).toContain("Send through HardKAS");
    expect(html).toContain('"/api/tx/send"');
    expect(html).not.toMatch(/[0-9a-f]{64}/);
    for (const env of [FAR, undefined]) {
      const r = await a.request("/wallet-probe", {}, env as any);
      expect(r.status).toBe(403);
      expect((await r.json()).error.code).toBe("WALLET_PROBE_LOOPBACK_ONLY");
    }
    expect((await a.request("/api/wallet-probe/network", {}, FAR)).status).toBe(403);
  });

  it("only client.js and its chunks are served, as JavaScript; a build without the signer says so", async () => {
    const a = app({ sdkDistDir: distDir() });
    const client = await a.request("/wallet-probe/sdk/client.js", {}, LOOP);
    expect([client.status, client.headers.get("content-type")]).toEqual([200, "text/javascript; charset=utf-8"]);
    expect((await a.request("/wallet-probe/sdk/chunk-ABC123.js", {}, LOOP)).status).toBe(200);
    for (const f of ["index.js", "chunk-NOPE.js", "..%2Fpackage.json", "client.d.ts"]) {
      expect((await a.request(`/wallet-probe/sdk/${f}`, {}, LOOP)).status, f).toBe(404);
    }
    expect((await a.request("/wallet-probe/sdk/client.js", {}, FAR)).status).toBe(403);
    const old = app({ sdkDistDir: distDir(false) });
    expect((await old.request("/wallet-probe/sdk/client.js", {}, LOOP)).status).toBe(503);
  });
});

describe("R3-C · the probe's API: mainnet refused before anything is planned", () => {
  for (const [network, config] of [
    ["mainnet", {}],
    ["prod", { networks: { prod: { kind: "kaspa-rpc", network: "mainnet", rpcUrl: "ws://127.0.0.1:1" } } }]
  ] as const) {
    it(`network '${network}': network, payment and complete are refused; tx.plan and the node are never reached`, async () => {
      const f = fakeSdk(network, config as any);
      const a = app({ sdkDistDir: distDir(), openSdk: async () => f.sdk });
      const n = await a.request("/api/wallet-probe/network", {}, LOOP);
      expect((await n.json()).error.code).toBe("MAINNET_SIGNING_DISABLED");
      const p = await a.request("/api/wallet-probe/payment", { method: "POST", body: JSON.stringify({ address: "kaspa:q", to: "kaspa:q", amountSompi: "1" }) }, LOOP);
      expect([p.status, (await p.json()).error.code]).toEqual([400, "MAINNET_SIGNING_DISABLED"]);
      expect(f.calls.filter((c) => c !== "close")).toEqual([]);
    });
  }

  it("complete for a payment this server did not plan: WALLET_REQUEST_MISMATCH, nothing signed", async () => {
    const f = fakeSdk("simnet");
    const a = app({ sdkDistDir: distDir(), openSdk: async () => f.sdk });
    const r = await a.request("/api/wallet-probe/complete", { method: "POST", body: JSON.stringify({ txId: "ab".repeat(32), returned: "{}" }) }, LOOP);
    expect((await r.json()).error.code).toBe("WALLET_REQUEST_MISMATCH");
    expect(f.calls).toEqual([]);
  });

  it("a malformed payment body: BAD_REQUEST before the SDK is opened", async () => {
    let opened = 0;
    const a = app({ sdkDistDir: distDir(), openSdk: async () => (opened++, fakeSdk("simnet").sdk) });
    const r = await a.request("/api/wallet-probe/payment", { method: "POST", body: JSON.stringify({ address: "x", to: "y", amountSompi: "1.5" }) }, LOOP);
    expect((await r.json()).error.code).toBe("BAD_REQUEST");
    expect(opened).toBe(0);
  });
});

describe("R3-C · the probe's message check (trap 7)", () => {
  it("the page has the message step; a real kaspa-wasm signature verifies; another address is refused; mainnet and a malformed body too", async () => {
    const { loadManagedKaspaWasmSync } = await import("@hardkas/core");
    const k: any = loadManagedKaspaWasmSync();
    const key = new k.PrivateKey("b7e151628aed2a6abf7158809cf4f3c762e7160f38b4da56a784d9045190cfef");
    const address = String(key.toPublicKey().toAddress("simnet").toString());
    const other = String(new k.PrivateKey("c90fdaa22168c234c4c6628b80dc1cd129024e088a67cc74020bbea63b14e5c9").toPublicKey().toAddress("simnet").toString());
    const hex = String(k.signMessage({ message: "probe", privateKey: key }));
    const a = app({ sdkDistDir: distDir(), openSdk: async () => fakeSdk("simnet").sdk });
    expect(await (await a.request("/wallet-probe", {}, LOOP)).text()).toContain("Ask the wallet to sign the message");
    const post = async (body: unknown, x = a): Promise<any> => (await x.request("/api/wallet-probe/verify-message", { method: "POST", body: JSON.stringify(body) }, LOOP)).json();
    const ok = await post({ address, message: "probe", returned: { address, signature: hex } });
    expect([ok.ok, ok.data?.verdict, ok.data?.shape]).toEqual([true, "VERIFIED", "object"]);
    expect((await post({ address: other, message: "probe", returned: hex })).error.code).toBe("WALLET_MESSAGE_SIGNATURE_INVALID");
    expect((await post({ address, message: 7 })).error.code).toBe("BAD_REQUEST");
    const main = app({ sdkDistDir: distDir(), openSdk: async () => fakeSdk("mainnet").sdk });
    expect((await post({ address, message: "probe", returned: hex }, main)).error.code).toBe("MAINNET_SIGNING_DISABLED");
  });
});

describe("R3-C · registered in the dev server: the page through its host check, the API behind its token", () => {
  const PORT = 7433;
  const host = `127.0.0.1:${PORT}`;
  const server = createDevServer({ port: PORT, host: "127.0.0.1", unsafeExternal: false });

  it("GET /wallet-probe answers the page; /api/wallet-probe/* without the token is 401; a POST without the CSRF header is 403", async () => {
    const page = await server.app.request("/wallet-probe", { headers: { host } }, LOOP);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("HardKAS wallet probe");
    expect((await server.app.request("/api/wallet-probe/network", { headers: { host } }, LOOP)).status).toBe(401);
    const noCsrf = await server.app.request("/api/wallet-probe/payment", { method: "POST", headers: { host, Authorization: `Bearer ${(server as any).token}` }, body: "{}" }, LOOP);
    expect(noCsrf.status).toBe(403);
    // the server's other routes are untouched by the probe's loopback rule
    expect((await server.app.request("/", { headers: { host } })).status).toBe(200);
  });

  it("BETA-FIX W1 · the root's endpoint catalog lists the probe page", async () => {
    const root = await (await server.app.request("/", { headers: { host } })).json();
    expect(root.endpoints.walletProbe).toBe("/wallet-probe");
  });

  it("BETA-FIX W1 · the page shows the call the session makes (walletSignCallOf: Kastle's signTx, the others' signPskt)", async () => {
    const html = await (await server.app.request("/wallet-probe", { headers: { host } }, LOOP)).text();
    expect(html).toContain("walletSignCallOf");
    expect(html).toContain("walletCall");
  });
});
