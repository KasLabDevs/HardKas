import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import type { AddressInfo } from "node:net";
import { WebSocketServer } from "ws";
import { cliDist } from "./first-contact-helpers.js";
import { hermeticChildEnv, assertHermeticPreloadActive } from "./hermetic-child.js";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

// -----------------------------------------------------------------------------
// L-02 (3-nov audit; CLI-CONTRACT-2B C6). `hardkas doctor` printed a report with failed checks and exited 0, so a script
// that trusted the exit code read a broken workspace as healthy. Now a report with a failed check exits 1; warnings and
// skips keep exit 0; the report itself (human or --json) is unchanged: one JSON document, same fields, no envelope added.
// Docker is unreachable on purpose (DOCKER_HOST at a closed loopback port); the testnet-10 endpoint is a loopback fake;
// `pnpm` is a shim on PATH so the runtime checks do not depend on the machine.
// -----------------------------------------------------------------------------

const made: string[] = [];
const tmp = (prefix: string) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  made.push(dir);
  return dir;
};

/** A directory with a `pnpm` that prints a version, for Windows (pnpm.cmd) and POSIX (pnpm). */
function pnpmShim(): string {
  const dir = tmp("hk-l02-bin-");
  fs.writeFileSync(path.join(dir, "pnpm.cmd"), "@echo 9.0.0\r\n");
  fs.writeFileSync(path.join(dir, "pnpm"), "#!/bin/sh\necho 9.0.0\n");
  fs.chmodSync(path.join(dir, "pnpm"), 0o755);
  return dir;
}

type Fake = { url: string; close(): Promise<void> };
async function startFake(network: string): Promise<Fake> {
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise<void>((r, j) => {
    server.on("listening", () => r());
    server.on("error", j);
  });
  server.on("connection", (socket) => {
    socket.on("message", (data) => {
      const text = String(data);
      const id = /"id"\s*:\s*(\d+)/.exec(text)?.[1];
      const method = /"method"\s*:\s*"([^"]+)"/.exec(text)?.[1] ?? "?";
      if (!id) return;
      if (method === "getServerInfo") {
        return socket.send(`{"id":${id},"method":"${method}","params":${JSON.stringify({ rpcApiVersion: 1, rpcApiRevision: 0, serverVersion: "2.1.0", networkId: network, hasUtxoIndex: true, isSynced: true, virtualDaaScore: 90_000_000 })}}`);
      }
      return socket.send(`{"id":${id},"error":{"code":0,"message":"fake does not implement ${method}","data":null}}`);
    });
  });
  return {
    url: `ws://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () =>
      new Promise<void>((r) => {
        for (const c of server.clients) c.terminate();
        server.close(() => r());
      })
  };
}

function workspace(label: string, rpcUrl?: string): string {
  const ws = tmp(`hk-l02-${label}-`);
  fs.mkdirSync(path.join(ws, ".hardkas"));
  const cfg = rpcUrl
    ? {
        execution: { default: "tn", targets: { tn: { mode: "rpc", domain: "kaspa-l1", network: "testnet-10" } } },
        network: { allowPublic: true },
        experimental: true,
        networks: { "testnet-10": { kind: "kaspa-rpc", network: "testnet-10", rpcUrl } }
      }
    : { execution: { default: "simulator", targets: { simulator: { mode: "simulator", domain: "kaspa-l1", network: "simulated" } } } };
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), `export default ${JSON.stringify(cfg, null, 2)};\n`);
  return ws;
}

const logs = tmp("hk-l02-logs-");
const pathKey = Object.keys(process.env).find((k) => k.toUpperCase() === "PATH") ?? "PATH";
let shim: string;

async function doctor(name: string, args: string[], cwd: string) {
  const env = hermeticChildEnv(path.join(logs, `${name}.net.log`), {
    HARDKAS_HERMETIC_DENY_PORTS: "16210,17210,18210",
    DOCKER_HOST: "tcp://127.0.0.1:1",
    [pathKey]: `${shim}${path.delimiter}${process.env[pathKey] ?? ""}`
  });
  const r = await new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, [cliDist, ...args], { cwd, env });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill(), 100_000);
    child.stdout.on("data", (d) => (stdout += String(d)));
    child.stderr.on("data", (d) => (stderr += String(d)));
    child.on("close", (status) => {
      clearTimeout(timer);
      resolve({ status, stdout, stderr });
    });
  });
  let json: any;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    json = undefined;
  }
  const failed: string[] = (json?.checks ?? []).filter((c: any) => c.status === "fail").map((c: any) => c.name);
  return { exit: r.status, json, failed, all: `${r.stdout}\n${r.stderr}`, brief: `exit ${r.status}\n${r.stdout.slice(-2500)}\n${r.stderr.slice(0, 1500)}` };
}

let T: Fake;
beforeAll(async () => {
  assertHermeticPreloadActive();
  shim = pnpmShim();
  T = await startFake("testnet-10");
});
afterAll(async () => {
  await T?.close();
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

describe("L-02 · hardkas doctor: the exit code follows the failed checks", () => {
  it("--json with a failed check (Docker unreachable in a simulator workspace) exits 1 and prints only the report", async () => {
    const r = await doctor("fail-json", ["doctor", "--json"], workspace("fail-json"));
    expect(r.json, r.brief).toBeDefined();
    expect(r.failed, r.brief).toContain("Docker daemon");
    expect(r.json.summary.failed, r.brief).toBe(r.failed.length);
    expect(r.exit, r.brief).toBe(1);
    // the report is one document with its own fields, no failure envelope around it or after it. RC1-R2 (D4) added its
    // schema id, the diagnosis scope, the node and the sections to that one document (still exact, still no `ok`/`error`)
    expect(Object.keys(r.json).sort(), r.brief).toEqual(["checks", "diagnosis", "node", "schema", "sections", "summary", "timestamp", "version"]);
    expect(r.json.ok, r.brief).toBeUndefined();
  });

  it("the human report with a failed check exits 1 too", async () => {
    const r = await doctor("fail-human", ["doctor"], workspace("fail-human"));
    expect(r.all, r.brief).toMatch(/Docker daemon: Not reachable/);
    expect(r.all, r.brief).toMatch(/Summary: \d+ passed, [1-9]\d* failed/);
    expect(r.exit, r.brief).toBe(1);
  });

  it("(control) warnings and skips only: exit 0", async () => {
    const r = await doctor("warn-only", ["doctor", "--json"], workspace("warn-only", T.url));
    expect(r.json, r.brief).toBeDefined();
    // the machine's Node.js major is the one check this file cannot fix; any other failure is a broken control
    expect(r.failed.filter((n) => n !== "Node.js version"), r.brief).toEqual([]);
    expect(r.json.summary.warnings, r.brief).toBeGreaterThan(0);
    expect(r.exit, r.brief).toBe(r.failed.length > 0 ? 1 : 0);
  });

  it("--strict with a failed check keeps exit 1 and raises DOCTOR_FAILED in the human form", async () => {
    const r = await doctor("strict", ["doctor", "--strict"], workspace("strict"));
    expect(r.all, r.brief).toMatch(/DOCTOR_FAILED/);
    expect(r.exit, r.brief).toBe(1);
  });
});
