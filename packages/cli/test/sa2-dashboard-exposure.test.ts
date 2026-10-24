import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

// SA-2 (SECURITY-AUDIT-1, 2026-10-21): the semantic dashboard (`runDashboard`, exported by `@hardkas/cli/public`) must not
// hand the workspace's data to other web origins or other machines: loopback only, no wildcard CORS, Host and Origin
// checked, a per-run token on /api/*. The page it serves carries that token (window.__HARDKAS_DEV_TOKEN__), as the
// dev-server's page does; another origin can read neither the page nor the API. The harness preload records the
// requested listen host and never lets the process bind beyond loopback, so this test is safe to run against code that
// would listen on every interface.
const runnerPath = path.resolve(__dirname, "fixtures/sa2-run-dashboard.mjs");
const shimPath = path.resolve(__dirname, "fixtures/sa2-listen-loopback-shim.cjs").replace(/\\/g, "/");
const PORT = 3333;
const EVIL = "http://evil.example";

let wsDir: string;
let listenLog: string;
let child: ChildProcess | undefined;
let childOutput = "";

function request(options: { method?: string; path: string; headers?: Record<string, string> }): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port: PORT, method: options.method ?? "GET", path: options.path, headers: { Host: `127.0.0.1:${PORT}`, ...(options.headers ?? {}) }, timeout: 5000 },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
      }
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.end();
  });
}

function portOpen(): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.connect(PORT, "127.0.0.1");
    s.once("connect", () => { s.destroy(); resolve(true); });
    s.once("error", () => resolve(false));
  });
}

async function tokenFromPage(): Promise<string | undefined> {
  const page = await request({ path: "/" });
  return /__HARDKAS_DEV_TOKEN__\s*=\s*"([0-9a-f]{64})"/.exec(page.body)?.[1];
}

describe("SA-2 · semantic dashboard: loopback only, no wildcard CORS, token-protected API", () => {
  beforeAll(async () => {
    if (await portOpen()) throw new Error(`port ${PORT} is already in use on 127.0.0.1 (environment): the dashboard cannot be tested`);
    wsDir = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-sa2-"));
    fs.mkdirSync(path.join(wsDir, ".hardkas", "artifacts"), { recursive: true });
    listenLog = path.join(wsDir, "listen.log");
    child = spawn(process.execPath, [runnerPath], {
      cwd: wsDir,
      env: { ...process.env, NO_COLOR: "1", SA2_LISTEN_LOG: listenLog, NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --require=${shimPath}`.trim() },
      stdio: ["ignore", "pipe", "pipe"]
    });
    child.stdout?.on("data", (d) => (childOutput += d));
    child.stderr?.on("data", (d) => (childOutput += d));
    const deadline = Date.now() + 30000;
    while (!(await portOpen())) {
      if (Date.now() > deadline || child.exitCode !== null) throw new Error(`the dashboard did not start: ${childOutput}`);
      await new Promise((r) => setTimeout(r, 250));
    }
  }, 60000);

  afterAll(async () => {
    // on Windows kill() is asynchronous and the exiting process still holds its cwd: wait for it, then remove with retries
    if (child && child.exitCode === null) {
      const exited = new Promise((resolve) => child!.once("exit", resolve));
      child.kill();
      await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5000))]);
    }
    if (wsDir) fs.rmSync(wsDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  });

  it("asks to listen on 127.0.0.1, never on every interface", () => {
    const calls = fs.readFileSync(listenLog, "utf8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
    const dashboardCall = calls.find((c) => Number(c.port) === PORT);
    expect(dashboardCall?.requestedHost).toBe("127.0.0.1");
  });

  it("refuses the API without the session token", async () => {
    const res = await request({ path: "/api/status" });
    expect(res.status).toBe(401);
  });

  it("gives another web origin neither the data nor a CORS grant", async () => {
    const res = await request({ path: "/api/status", headers: { Origin: EVIL } });
    expect([401, 403]).toContain(res.status);
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    const preflight = await request({ method: "OPTIONS", path: "/api/status", headers: { Origin: EVIL, "Access-Control-Request-Method": "GET" } });
    expect(preflight.headers["access-control-allow-origin"]).toBeUndefined();
    const page = await request({ path: "/", headers: { Origin: EVIL } });
    expect(page.headers["access-control-allow-origin"]).toBeUndefined();
    expect(page.body).not.toMatch(/__HARDKAS_DEV_TOKEN__\s*=\s*"[0-9a-f]{64}"/);
  });

  it("refuses a foreign Host header (DNS rebinding)", async () => {
    const res = await request({ path: "/", headers: { Host: `evil.example:${PORT}` } });
    expect(res.status).toBe(403);
    expect(res.body).not.toMatch(/__HARDKAS_DEV_TOKEN__/);
  });

  it("serves its own page with a per-run token, and the API answers that token only", async () => {
    const token = await tokenFromPage();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    const ok = await request({ path: "/api/status", headers: { Authorization: `Bearer ${token}` } });
    expect(ok.status).toBe(200);
    expect(() => JSON.parse(ok.body)).not.toThrow();
    expect(ok.headers["access-control-allow-origin"]).toBeUndefined();
    const wrong = await request({ path: "/api/status", headers: { Authorization: `Bearer ${"0".repeat(64)}` } });
    expect(wrong.status).toBe(401);
  });

  it("the dashboard doctor still reaches the API (it is not registered as a command in this release)", async () => {
    const lines: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => { lines.push(a.map(String).join(" ")); });
    try {
      const { runDashboardDoctor } = await import("../src/runners/dashboard-doctor-runner.js");
      await runDashboardDoctor();
    } finally {
      spy.mockRestore();
    }
    const out = lines.join("\n");
    expect(out).toContain("Dashboard API Server");
    expect(out).not.toMatch(/Offline\/unreachable/);
    expect(out).not.toMatch(/HTTP status 40[13]/);
  }, 60000);
});
