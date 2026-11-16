import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { cliDist } from "./first-contact-helpers.js";
import { hermeticChildEnv, assertHermeticPreloadActive } from "./hermetic-child.js";
import { startDecoy, attemptsIn, type Decoy } from "./helpers/mainnet-decoy.js";

vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 });

// -----------------------------------------------------------------------------
// ESCROW-LIFECYCLE-1 · `hardkas escrow create|fund|status|prepare|sign|release|reconcile`, refused where they must be,
// before anything is read, signed or sent. MAINNET TOTAL LOCKDOWN: every command on mainnet — the name, another
// spelling, an alias that declares it, the workspace's default — is MAINNET_CONNECTION_DISABLED (exit 3) in its JSON
// envelope, and the "mainnet node" (a loopback decoy that counts TCP connections) is never contacted; the hermetic
// preload logs every attempt. A public testnet without the payments' opt-in is PUBLIC_NETWORK_BLOCKED (exit 3). Usage
// refusals are exit 2. No silverc, no real node (the lifecycle itself: escrow-lifecycle.simnet.test.ts).
// -----------------------------------------------------------------------------

const made: string[] = [];
const logs = fs.mkdtempSync(path.join(os.tmpdir(), "hk-escrow-cli-logs-"));
made.push(logs);
const DENY = "16110,16210,17110,17210,18110,18210,18211";
const ID = crypto.randomUUID();
const KEY = "11".repeat(32);
let n = 0;
let decoy: Decoy;

interface Run {
  exit: number | null;
  stdout: string;
  stderr: string;
  log: string;
  json: any;
}

async function cli(args: string[], cwd: string): Promise<Run> {
  const log = path.join(logs, `${++n}.net.log`);
  const env = hermeticChildEnv(log, { HARDKAS_HERMETIC_DENY_PORTS: DENY, DOCKER_HOST: "tcp://127.0.0.1:9", HK_ESC_PW: "escrow-cli-test" });
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cliDist, ...args], { cwd, env, windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill(), 150_000);
    child.stdout.on("data", (d) => (stdout += String(d)));
    child.stderr.on("data", (d) => (stderr += String(d)));
    child.on("close", (exit) => {
      clearTimeout(timer);
      let json: any;
      for (const chunk of stdout.trim().split(/\r?\n(?=\{)/)) {
        try {
          json = json ?? JSON.parse(chunk);
        } catch {
          /* a human line */
        }
      }
      resolve({ exit, stdout, stderr, log, json });
    });
    child.stdin.end();
  });
}

const brief = (r: Run) => JSON.stringify({ exit: r.exit, code: r.json?.code, decoy: { connections: decoy.connections, methods: decoy.methods }, stdout: r.stdout.slice(-900), stderr: r.stderr.slice(-500) });

function workspace(label: string, network: string, declared: string, extra: Record<string, unknown> = {}): string {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), `hk-escrow-cli-${label}-`));
  made.push(ws);
  fs.mkdirSync(path.join(ws, ".hardkas"));
  const cfg = {
    execution: { default: "t", targets: { t: { mode: "rpc", domain: "kaspa-l1", network } } },
    networks: { [network]: { kind: "kaspa-rpc", network: declared, rpcUrl: decoy.url } },
    ...extra
  };
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), `export default ${JSON.stringify(cfg, null, 2)};\n`);
  return ws;
}

/** Every escrow lifecycle command, with what it needs to get past commander. */
function commands(network: string[]): Array<[string, string[]]> {
  return [
    ["create", ["escrow", "create", "--buyer", KEY, "--seller", "22".repeat(32), "--arbiter", "33".repeat(32), "--amount", "1", ...network, "--json"]],
    ["fund", ["escrow", "fund", ID, "--from", "alice", ...network, "--password-env", "HK_ESC_PW", "--json"]],
    ["prepare", ["escrow", "prepare", ID, "--branch", "mutualRelease", ...network, "--json"]],
    ["sign", ["escrow", "sign", ID, "--role", "buyer", "--account", "alice", ...network, "--password-env", "HK_ESC_PW", "--json"]],
    ["release", ["escrow", "release", ID, ...network, "--json"]],
    ["reconcile", ["escrow", "reconcile", ID, ...network, "--json"]]
  ];
}

function expectRefused(r: Run, code: string, exit: number) {
  const net = attemptsIn(r.log, decoy.port);
  expect(r.json?.ok, brief(r)).toBe(false);
  expect(r.json?.code, brief(r)).toBe(code);
  expect(r.exit, brief(r)).toBe(exit);
  expect(decoy.connections, brief(r)).toBe(0);
  expect(net.toPort, brief(r)).toBe(0);
}

beforeAll(async () => {
  assertHermeticPreloadActive();
  decoy = await startDecoy("mainnet");
});
afterAll(async () => {
  await decoy?.close();
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

describe("ESCROW-LIFECYCLE-1 · hardkas escrow, refusals before anything is read, signed or sent", () => {
  it("E-1 mainnet by name, by another spelling and by an alias: every command MAINNET_CONNECTION_DISABLED (exit 3); the decoy node never contacted, no escrow record written", async () => {
    const ws = workspace("mainnet", "mainnet", "mainnet", { network: { allowPublic: true }, experimental: true });
    const alias = workspace("alias", "prod", "mainnet", { network: { allowPublic: true }, experimental: true });
    for (const [cwd, flag] of [
      [ws, "mainnet"],
      [ws, "kaspa-mainnet"],
      [alias, "prod"]
    ] as const) {
      for (const [what, args] of commands(["--network", flag])) {
        const r = await cli(args, cwd);
        expectRefused(r, "MAINNET_CONNECTION_DISABLED", 3);
        expect(what).toBeTruthy();
      }
      // a request file of mainnet is refused the same way (its network read from the file, before any key)
      fs.writeFileSync(path.join(cwd, "mainnet.request.json"), JSON.stringify({ schema: "hardkas.escrow.releaseRequest.v1", networkId: "mainnet", escrowId: ID }));
      expectRefused(await cli(["escrow", "sign", "mainnet.request.json", "--role", "buyer", "--account", "alice", "--json"], cwd), "MAINNET_CONNECTION_DISABLED", 3);
      expect(fs.existsSync(path.join(cwd, ".hardkas", "escrows"))).toBe(false);
    }
  });

  it("E-2 the workspace's default network is mainnet: every command without --network is refused the same way (status too)", async () => {
    const ws = workspace("default", "mainnet", "mainnet", { network: { allowPublic: true }, experimental: true });
    for (const [, args] of [...commands([]), ["status", ["escrow", "status", ID, "--json"]] as [string, string[]]]) {
      expectRefused(await cli(args, ws), "MAINNET_CONNECTION_DISABLED", 3);
    }
  });

  it("E-3 a public testnet without experimental + network.allowPublic: PUBLIC_NETWORK_BLOCKED (exit 3), nothing contacted", async () => {
    const ws = workspace("testnet", "testnet-10", "testnet-10");
    for (const [, args] of commands(["--network", "testnet-10"])) {
      expectRefused(await cli(args, ws), "PUBLIC_NETWORK_BLOCKED", 3);
    }
  });

  it("E-4 usage: create needs --amount or both split amounts (ESCROW_CONFIG_INVALID, exit 2); an unknown escrow is ESCROW_NOT_FOUND; the commands are listed by escrow --help", async () => {
    const ws = workspace("simnet", "simnet", "simnet");
    const both = await cli(["escrow", "create", "--buyer", KEY, "--seller", "22".repeat(32), "--arbiter", "33".repeat(32), "--amount", "1", "--buyer-amount", "1", "--json"], ws);
    expectRefused(both, "ESCROW_CONFIG_INVALID", 2);
    const neither = await cli(["escrow", "create", "--buyer", KEY, "--seller", "22".repeat(32), "--arbiter", "33".repeat(32), "--json"], ws);
    expectRefused(neither, "ESCROW_CONFIG_INVALID", 2);
    expectRefused(await cli(["escrow", "status", ID, "--json"], ws), "ESCROW_NOT_FOUND", 2);
    expectRefused(await cli(["escrow", "prepare", ID, "--branch", "mutualRelease", "--json"], ws), "ESCROW_NOT_FOUND", 2);
    const help = await cli(["escrow", "--help"], ws);
    for (const c of ["create", "fund", "status", "prepare", "sign", "release", "reconcile", "rescue-v1"]) expect(help.stdout, help.stdout).toMatch(new RegExp(`\\n\\s+${c}\\b`));
  });
});
