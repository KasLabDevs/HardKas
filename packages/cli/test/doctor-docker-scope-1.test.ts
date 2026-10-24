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
// DOCTOR-DOCKER-SCOPE-1 (2026-10-24). Found certifying the release candidate on Testnet-10: in a testnet-10 workspace
// `doctor` failed "Docker daemon: Not reachable", and `ci verify` (the doctor checks, offline) answered CI_VERIFY_FAILED,
// although a workspace on a public network runs against the endpoint it declares and never uses a local node (doctor's
// own "Network endpoint" check, HARDKAS-NETWORK-PORTABILITY-1 C6). A case of the known gap CLI-CONTRACT-2B C5 ("ci verify
// blames the workspace when only Docker is down"), for public-network workspaces. Fixed: where the workspace's network is
// public (testnet-<n>, mainnet) and it declares no localnet target, the Docker check still runs and says what it finds,
// but an unreachable daemon is `skip` (not needed by this workspace) instead of `fail`. What really depends on Docker
// keeps failing: a workspace that also declares a localnet target, `hardkas doctor node` (the local node, whatever the
// workspace's network), local workspaces (simnet, devnet, the simulator); and every other failure (a plaintext key, …)
// still fails doctor and ci verify.
// Docker is unreachable on purpose (DOCKER_HOST at a closed loopback port); loopback fakes only.
// -----------------------------------------------------------------------------

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

const made: string[] = [];
const logs = fs.mkdtempSync(path.join(os.tmpdir(), "hk-dds1-logs-"));
made.push(logs);

function workspace(label: string, network: "simnet" | "testnet-10" | "testnet-10+localnet", rpcUrl?: string): string {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), `hk-dds1-${label}-`));
  made.push(ws);
  fs.mkdirSync(path.join(ws, ".hardkas"));
  const localnet = { mode: "localnet", domain: "kaspa-l1", network: "simnet" };
  const cfg =
    network === "simnet"
      ? { execution: { default: "localnet", targets: { localnet } } }
      : {
          execution: {
            default: "tn",
            targets: { tn: { mode: "rpc", domain: "kaspa-l1", network: "testnet-10" }, ...(network === "testnet-10+localnet" ? { localnet } : {}) }
          },
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
    const child = spawn(process.execPath, [cliDist, ...args], {
      cwd,
      env: hermeticChildEnv(log, { HARDKAS_HERMETIC_DENY_PORTS: "16210,17210,18210", DOCKER_HOST: "tcp://127.0.0.1:1" })
    });
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
  return { exit: r.status, json, stdout: r.stdout, stderr: r.stderr, all: `${r.stdout}\n${r.stderr}`, brief: `exit ${r.status}\n${r.stdout.slice(-2500)}\n${r.stderr.slice(0, 1500)}` };
}

const dockerCheck = (doc: any) => (doc?.checks ?? []).find((c: any) => c.name === "Docker daemon");

let T: Fake;
beforeAll(async () => {
  assertHermeticPreloadActive();
  T = await startFake("testnet-10");
});
afterAll(async () => {
  await T?.close();
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

describe("DOCTOR-DOCKER-SCOPE-1 · a public-network workspace does not need the local Docker node", () => {
  it("D-1 testnet-10 workspace, Docker unreachable: the Docker check says so and is `skip`, not `fail`", async () => {
    const r = await run("d1", ["doctor", "--json"], workspace("d1", "testnet-10", T.url));
    const check = dockerCheck(r.json);
    expect(check, r.brief).toBeDefined();
    expect(check.status, r.brief).toBe("skip");
    expect(check.message, r.brief).toMatch(/not reachable/i);
    expect(check.message, r.brief).toMatch(/testnet-10/);
  });

  it("D-2 testnet-10 workspace, Docker unreachable, nothing else wrong: `ci verify` passes", async () => {
    const r = await run("d2", ["ci", "verify"], workspace("d2", "testnet-10", T.url));
    expect(r.exit, r.brief).toBe(0);
    expect(r.all, r.brief).toMatch(/CI Verification Passed/);
    expect(r.all, r.brief).not.toMatch(/CI_VERIFY_FAILED/);
  });

  it("D-3 (control, unchanged) simnet workspace, Docker unreachable: the check fails and `ci verify` fails", async () => {
    const ws = workspace("d3", "simnet");
    const doc = await run("d3-doctor", ["doctor", "--json"], ws);
    expect(dockerCheck(doc.json)?.status, doc.brief).toBe("fail");
    const ci = await run("d3-ci", ["ci", "verify"], ws);
    expect(ci.exit, ci.brief).toBe(1);
    expect(ci.all, ci.brief).toMatch(/CI_VERIFY_FAILED/);
  });

  it("D-4 (control) testnet-10 workspace with a plaintext key: doctor and `ci verify` still fail", async () => {
    const ws = workspace("d4", "testnet-10", T.url);
    // a placeholder value, never a key of any account
    fs.writeFileSync(path.join(ws, ".hardkas", "accounts.real.json"), JSON.stringify({ accounts: [{ name: "x", address: "kaspatest:x", privateKey: "0".repeat(64) }] }));
    const doc = await run("d4-doctor", ["doctor", "--json"], ws);
    expect((doc.json?.checks ?? []).find((c: any) => c.name === "Plaintext keys check")?.status, doc.brief).toBe("fail");
    const ci = await run("d4-ci", ["ci", "verify"], ws);
    expect(ci.exit, ci.brief).toBe(1);
    expect(ci.all, ci.brief).toMatch(/CI_VERIFY_FAILED/);
  });

  it("D-5 (control) testnet-10 workspace that also declares a localnet target: that target needs Docker, so the check still fails and so does `ci verify`", async () => {
    const ws = workspace("d5", "testnet-10+localnet", T.url);
    const doc = await run("d5-doctor", ["doctor", "--json"], ws);
    expect(dockerCheck(doc.json)?.status, doc.brief).toBe("fail");
    const ci = await run("d5-ci", ["ci", "verify"], ws);
    expect(ci.exit, ci.brief).toBe(1);
    expect(ci.all, ci.brief).toMatch(/CI_VERIFY_FAILED/);
  });

  it("D-6 (control) `hardkas doctor node` in a testnet-10 workspace still checks the local node and fails without it", async () => {
    const r = await run("d6", ["doctor", "node", "--json"], workspace("d6", "testnet-10", T.url));
    expect(r.exit, r.brief).not.toBe(0);
    expect(r.all, r.brief).toMatch(/NODE_NOT_RUNNING|not running|docker/i);
  });
});
