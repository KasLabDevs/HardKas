import { describe, it, expect, vi } from "vitest";
import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

vi.setConfig({ testTimeout: 180_000 });

// -----------------------------------------------------------------------------
// DASHBOARD-CLOSE-1 (2026-10-21). The semantic dashboard is reached through the public API (`runDashboard`, exported by
// `@hardkas/cli/public`; the `hardkas dashboard` command is not registered). Since SA-2 it listens on loopback only, with a
// per-run token — but the call resolved with nothing, so a program that started it could not stop it: the server kept
// its process alive until the process was killed (the SA-2 test has to kill its child). Fixed: runDashboard resolves
// with the server's URL and a close() that stops it. The harness preload of SA-2 keeps the bind on loopback.
// -----------------------------------------------------------------------------

const PORT = 3333;
const fixture = path.resolve(__dirname, "fixtures/dashboard-close-1.mjs");
const shimPath = path.resolve(__dirname, "fixtures/sa2-listen-loopback-shim.cjs").replace(/\\/g, "/");

function portOpen(): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.connect(PORT, "127.0.0.1");
    s.once("connect", () => {
      s.destroy();
      resolve(true);
    });
    s.once("error", () => resolve(false));
  });
}

describe("DASHBOARD-CLOSE-1 · a dashboard started through the public API can be closed by the program that started it", () => {
  it("runDashboard resolves with its URL and a close(); after close() the port is free and the process ends by itself", async () => {
    // the SA-2 test uses the same port: wait for it to be free (another file of the run may hold it for a while)
    const free = Date.now() + 120_000;
    while (await portOpen()) {
      if (Date.now() > free) throw new Error(`port ${PORT} stayed in use on 127.0.0.1: the dashboard cannot be tested`);
      await new Promise((r) => setTimeout(r, 500));
    }
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-dash-close-1-"));
    fs.mkdirSync(path.join(ws, ".hardkas", "artifacts"), { recursive: true });
    let output = "";
    const child = spawn(process.execPath, [fixture], {
      cwd: ws,
      env: { ...process.env, NO_COLOR: "1", SA2_LISTEN_LOG: path.join(ws, "listen.log"), NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --require=${shimPath}`.trim() },
      stdio: ["ignore", "pipe", "pipe"]
    });
    child.stdout?.on("data", (d) => (output += d));
    child.stderr?.on("data", (d) => (output += d));
    const exit = await new Promise<number | null>((resolve) => {
      const timer = setTimeout(() => {
        child.kill();
        resolve(null);
      }, 30_000);
      child.once("exit", (code) => {
        clearTimeout(timer);
        resolve(code);
      });
    });
    const docs = output
      .split(/\r?\n/)
      .filter((l) => l.startsWith("{"))
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return undefined;
        }
      })
      .filter(Boolean);
    try {
      expect(docs.find((d: any) => d.started), output).toMatchObject({ started: true, closable: true, url: `http://127.0.0.1:${PORT}` });
      expect(docs.some((d: any) => d.closed === true), output).toBe(true);
      expect(exit, `the process should end by itself once the dashboard is closed\n${output}`).toBe(0);
      expect(await portOpen()).toBe(false);
    } finally {
      if (child.exitCode === null) child.kill();
      fs.rmSync(ws, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    }
  });
});
