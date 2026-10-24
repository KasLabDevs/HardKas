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
// RPC-DEFAULT-TARGET-NOTE-1 (2026-10-24). Found certifying the release candidate on Testnet-10: the demo's
// `rpc health --json`, run in a testnet-10 workspace, answered RPC_NOT_READY for ws://127.0.0.1:18210. That target is
// the documented contract of the rpc family — no --network and no --url: the canonical localnet, unchecked
// (HARDKAS-NETWORK-PORTABILITY-1, NP-3e) — and is kept. What was missing is saying so where the workspace runs elsewhere.
// Fixed: in a workspace whose network is public (testnet-<n>, mainnet), an rpc command without --network and --url
// says on stderr that it checks the canonical localnet, not that network, and how to check the workspace's endpoint.
// The target, stdout (the JSON envelope) and the exit code do not change. Loopback fakes only; the canonical ports are
// denied.
// -----------------------------------------------------------------------------

type Fake = { url: string; port: number; close(): Promise<void> };
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
      const ok = (r: unknown) => socket.send(`{"id":${id},"method":"${method}","params":${JSON.stringify(r)}}`);
      if (method === "getServerInfo") return ok({ rpcApiVersion: 1, rpcApiRevision: 0, serverVersion: "2.1.0", networkId: network, hasUtxoIndex: true, isSynced: true, virtualDaaScore: 90_000_000 });
      if (method === "getInfo") return ok({ p2pId: "note", mempoolSize: 0, serverVersion: "2.1.0", isUtxoIndexed: true, isSynced: true, hasNotifyCommand: true, hasMessageId: true });
      if (method === "getBlockDagInfo") return ok({ network, blockCount: 10, headerCount: 10, tipHashes: ["1".padStart(64, "0")], difficulty: 1, pastMedianTime: Date.now(), virtualParentHashes: ["1".padStart(64, "0")], pruningPointHash: "2".padStart(64, "0"), virtualDaaScore: 90_000_000, sink: "1".padStart(64, "0") });
      return socket.send(`{"id":${id},"error":{"code":0,"message":"fake does not implement ${method}","data":null}}`);
    });
  });
  const port = (server.address() as AddressInfo).port;
  return {
    url: `ws://127.0.0.1:${port}`,
    port,
    close: () =>
      new Promise<void>((r) => {
        for (const c of server.clients) c.terminate();
        server.close(() => r());
      })
  };
}

const made: string[] = [];
const logs = fs.mkdtempSync(path.join(os.tmpdir(), "hk-rdtn1-logs-"));
made.push(logs);

function workspace(label: string, network: "simnet" | "testnet-10", rpcUrl?: string): string {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), `hk-rdtn1-${label}-`));
  made.push(ws);
  fs.mkdirSync(path.join(ws, ".hardkas"));
  const cfg =
    network === "simnet"
      ? { execution: { default: "localnet", targets: { localnet: { mode: "localnet", domain: "kaspa-l1", network: "simnet" } } } }
      : {
          execution: { default: "tn", targets: { tn: { mode: "rpc", domain: "kaspa-l1", network: "testnet-10" } } },
          network: { allowPublic: true },
          experimental: true,
          networks: { "testnet-10": { kind: "kaspa-rpc", network: "testnet-10", rpcUrl } }
        };
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), `export default ${JSON.stringify(cfg, null, 2)};\n`);
  return ws;
}

async function run(name: string, args: string[], cwd: string) {
  const log = path.join(logs, `${name}.net.log`);
  const r = await new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, [cliDist, ...args], { cwd, env: hermeticChildEnv(log, { HARDKAS_HERMETIC_DENY_PORTS: "16210,17210,18210" }) });
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
  const dialled = fs.existsSync(log)
    ? [...new Set(fs.readFileSync(log, "utf8").split(/\r?\n/).filter(Boolean).map((l) => l.split("\t")).map(([, k, t]) => `${k} ${t}`))]
    : [];
  let json: any;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    json = undefined;
  }
  return { exit: r.status, json, dialled, stdout: r.stdout, stderr: r.stderr, brief: `exit ${r.status}\n${r.stdout.slice(-1500)}\n${r.stderr.slice(0, 1500)}` };
}

const NOTE = /canonical localnet/i;

let T: Fake;
beforeAll(async () => {
  assertHermeticPreloadActive();
  T = await startFake("testnet-10");
});
afterAll(async () => {
  await T?.close();
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

describe("RPC-DEFAULT-TARGET-NOTE-1 · an rpc command that falls back to the canonical localnet says so in a public-network workspace", () => {
  it("R-1 `rpc health --json` in a testnet-10 workspace: same target and envelope, and a note on stderr naming the workspace's network", async () => {
    const r = await run("r1", ["rpc", "health", "--json"], workspace("r1", "testnet-10", T.url));
    expect(r.exit, r.brief).toBe(1);
    expect(r.json, r.brief).toMatchObject({ ok: false, code: "RPC_NOT_READY", endpoint: "ws://127.0.0.1:18210" });
    expect(r.dialled.some((d) => d.endsWith(`:${T.port}`)), JSON.stringify(r.dialled)).toBe(false);
    expect(r.stderr, r.brief).toMatch(NOTE);
    expect(r.stderr, r.brief).toMatch(/testnet-10/);
    expect(r.stderr, r.brief).toMatch(/--network testnet-10/);
  });

  it("R-2 the same note for `rpc info --json` (the shared target), its url unchanged (NP-3e)", async () => {
    const r = await run("r2", ["rpc", "info", "--json"], workspace("r2", "testnet-10", T.url));
    expect(r.json?.url, r.brief).toBe("ws://127.0.0.1:18210");
    expect(r.stderr, r.brief).toMatch(NOTE);
    expect(r.stderr, r.brief).toMatch(/--network testnet-10/);
  });

  it("R-3 (control) in a simnet workspace the canonical localnet is the workspace's node: no note", async () => {
    const r = await run("r3", ["rpc", "health", "--json"], workspace("r3", "simnet"));
    expect(r.json, r.brief).toMatchObject({ ok: false, code: "RPC_NOT_READY" });
    expect(r.stderr, r.brief).not.toMatch(NOTE);
  });

  it("R-4 (control) with --network or --url the command checks what it was given: no note", async () => {
    const ws = workspace("r4", "testnet-10", T.url);
    const byNetwork = await run("r4-network", ["rpc", "health", "--network", "testnet-10", "--json"], ws);
    expect(byNetwork.json, byNetwork.brief).toMatchObject({ ok: true });
    expect(byNetwork.stderr, byNetwork.brief).not.toMatch(NOTE);
    const byUrl = await run("r4-url", ["rpc", "health", "--url", T.url, "--json"], ws);
    expect(byUrl.json, byUrl.brief).toMatchObject({ ok: true });
    expect(byUrl.stderr, byUrl.brief).not.toMatch(NOTE);
  });

  it("R-5 (contract) stdout stays exactly one JSON envelope: the note never reaches it", async () => {
    const r = await run("r5", ["rpc", "health", "--json"], workspace("r5", "testnet-10", T.url));
    expect(() => JSON.parse(r.stdout), r.brief).not.toThrow();
    expect(r.stdout, r.brief).not.toMatch(NOTE);
  });
});
