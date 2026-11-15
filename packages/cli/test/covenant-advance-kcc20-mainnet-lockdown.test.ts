import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { cliDist } from "./first-contact-helpers.js";
import { hermeticChildEnv, assertHermeticPreloadActive } from "./hermetic-child.js";
import { startDecoy, attemptsIn, type Decoy } from "./helpers/mainnet-decoy.js";

vi.setConfig({ testTimeout: 240_000, hookTimeout: 120_000 });

// -----------------------------------------------------------------------------
// R3-A3 · MAINNET TOTAL LOCKDOWN for the commands this round adds: `silver covenant start | advance` (Silver's own code,
// SILVERSCRIPT_MAINNET_NOT_ENABLED, before any record is read) and `kcc20 deploy | transfer` (MAINNET_SIGNING_DISABLED)
// and `kcc20 balance` (MAINNET_CONNECTION_DISABLED), decided first, before any record, key or node. Every "mainnet node"
// is a loopback decoy that counts TCP connections; the hermetic preload logs every attempt. Mainnet asked three ways:
// every spelling as --network, an alias whose config entry declares mainnet, and the workspace's own network. Throwaway
// keys, nothing funded, no real node. The pattern of mainnet-lockdown-codes.test.ts.
// -----------------------------------------------------------------------------

const made: string[] = [];
const decoys: Decoy[] = [];
const logs = fs.mkdtempSync(path.join(os.tmpdir(), "hk-r3-mlk-logs-"));
made.push(logs);
const FIXTURE = path.join(__dirname, "fixtures", "silver-keys-1", "vault-compile-record.json");
const DENY = "16110,16210,17110,17210,18110,18210,18211";
const COVENANT = "ab".repeat(32);
const OUTPOINT = `${"cd".repeat(32)}:0`;
const SPELLINGS = ["kaspa", "mainnet-1", "kaspa-mainnet", "MAINNET"] as const;
let M1 = "";
let M2 = "";
let T1 = "";
let T2 = "";
let n = 0;

interface Run {
  exit: number | null;
  stdout: string;
  stderr: string;
  log: string;
}

async function cli(args: string[], cwd: string): Promise<Run> {
  const log = path.join(logs, `${++n}.net.log`);
  const env = hermeticChildEnv(log, { HARDKAS_HERMETIC_DENY_PORTS: DENY, DOCKER_HOST: "tcp://127.0.0.1:9", HK_R3_MLK_PW: "r3-mlk-test-password", HK_R3_MLK_KEY: "11".repeat(32) });
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cliDist, ...args], { cwd, env, windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill(), 150_000);
    child.stdout.on("data", (d) => (stdout += String(d)));
    child.stderr.on("data", (d) => (stderr += String(d)));
    child.on("close", (exit) => {
      clearTimeout(timer);
      resolve({ exit, stdout, stderr, log });
    });
    child.stdin.end();
  });
}

function envelopeCode(r: Run): string | undefined {
  for (const chunk of r.stdout.trim().split(/\r?\n(?=\{)/)) {
    try {
      const d = JSON.parse(chunk);
      if (d?.ok === false && typeof d.code === "string") return d.code;
    } catch {
      /* a human line */
    }
  }
  return undefined;
}

const brief = (r: Run, d?: Decoy) => JSON.stringify({ exit: r.exit, code: envelopeCode(r), decoy: d ? { connections: d.connections, methods: d.methods } : undefined, stdout: r.stdout.slice(-900), stderr: r.stderr.slice(-500) });

function expectEnvelope(r: Run, d: Decoy, code: string) {
  const net = attemptsIn(r.log, d.port);
  expect(envelopeCode(r), brief(r, d)).toBe(code);
  expect(r.exit, brief(r, d)).not.toBe(0);
  expect(d.connections, brief(r, d)).toBe(0);
  expect(net.toPort, brief(r, d)).toBe(0);
  expect(net.refused, brief(r, d)).toEqual([]);
}

function workspace(label: string, cfg: Record<string, unknown>): string {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), `hk-r3-mlk-${label}-`));
  made.push(ws);
  fs.mkdirSync(path.join(ws, ".hardkas"));
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), `export default ${JSON.stringify(cfg, null, 2)};\n`);
  fs.writeFileSync(path.join(ws, "state.json"), JSON.stringify({ value: { kind: "int", value: 1 } }));
  return ws;
}

function cfgFor(name: string, declared: string, url: string, extraNetworks: Record<string, unknown> = {}): Record<string, unknown> {
  const isMain = /mainnet|^kaspa$/i.test(declared);
  return {
    defaultNetwork: name,
    execution: { default: "t", targets: { t: { mode: "rpc", domain: "kaspa-l1", network: name } } },
    network: { allowPublic: true },
    experimental: true,
    networks: { [name]: { kind: "kaspa-rpc", network: declared, rpcUrl: url, allowMainnet: true }, ...extraNetworks },
    accounts: {
      alice: { kind: "kaspa", network: declared, address: isMain ? M1 : T1, privateKeyEnv: "HK_R3_MLK_KEY" },
      bob: { kind: "kaspa", network: declared, address: isMain ? M2 : T2 },
      funder: { kind: "kaspa", network: declared, address: isMain ? M1 : T1, privateKeyEnv: "HK_R3_MLK_KEY" }
    }
  };
}

/** The five commands, `--network <network>` appended when given, and the code each must answer. */
function cases(network: string | undefined, ws: string): Array<[string[], string]> {
  const net = network === undefined ? [] : ["--network", network];
  return [
    [["silver", "covenant", "start", FIXTURE, "--from", "funder", "--output", "1", "--password-env", "HK_R3_MLK_PW", ...net, "--json"], "SILVERSCRIPT_MAINNET_NOT_ENABLED"],
    [["silver", "covenant", "advance", FIXTURE, "--covenant", COVENANT, "--policy", "step", "--input", OUTPOINT, "--next", path.join(ws, "state.json"), ...net, "--json"], "SILVERSCRIPT_MAINNET_NOT_ENABLED"],
    [["kcc20", "deploy", FIXTURE, "--from", "funder", "--holder", "alice=1", "--password-env", "HK_R3_MLK_PW", ...net, "--json"], "MAINNET_SIGNING_DISABLED"],
    [["kcc20", "transfer", "--covenant", COVENANT, "--from", "alice", "--to", "bob=1", ...net, "--json"], "MAINNET_SIGNING_DISABLED"],
    [["kcc20", "balance", "alice", "--covenant", COVENANT, ...net, "--json"], "MAINNET_CONNECTION_DISABLED"]
  ];
}

beforeAll(async () => {
  assertHermeticPreloadActive();
  const core: any = await import("@hardkas/core");
  const kaspa = core.loadManagedKaspaWasmSync();
  const k1 = new kaspa.PrivateKey("11".repeat(32)).toPublicKey();
  const k2 = new kaspa.PrivateKey("22".repeat(32)).toPublicKey();
  M1 = k1.toAddress("mainnet").toString();
  M2 = k2.toAddress("mainnet").toString();
  T1 = k1.toAddress("testnet-10").toString();
  T2 = k2.toAddress("testnet-10").toString();
});

afterAll(async () => {
  for (const d of decoys) await d.close();
  for (const p of made) fs.rmSync(p, { recursive: true, force: true });
});

async function decoy(network: string): Promise<Decoy> {
  const d = await startDecoy(network);
  decoys.push(d);
  return d;
}

describe("R3-A3 · covenant start|advance and kcc20 deploy|transfer|balance refuse mainnet first; nothing is contacted", () => {
  for (const spelling of SPELLINGS) {
    it(`--network ${spelling}`, async () => {
      const d = await decoy("mainnet");
      const other = await decoy("testnet-10");
      const ws = workspace(`net-${spelling}`, cfgFor("testnet-10", "testnet-10", other.url));
      for (const [argv, code] of cases(spelling, ws)) expectEnvelope(await cli(argv, ws), d, code);
      expect(other.connections).toBe(0);
    });
  }

  it("an alias 'prod' whose config entry declares mainnet: the same codes as the name", async () => {
    const d = await decoy("mainnet");
    const other = await decoy("testnet-10");
    const ws = workspace("alias", cfgFor("testnet-10", "testnet-10", other.url, { prod: { kind: "kaspa-rpc", network: "mainnet", rpcUrl: d.url, allowMainnet: true } }));
    for (const [argv, code] of cases("prod", ws)) expectEnvelope(await cli(argv, ws), d, code);
    expect(other.connections).toBe(0);
  });

  it("a workspace whose own network is mainnet (no --network): the same codes", async () => {
    const d = await decoy("mainnet");
    const ws = workspace("default", cfgFor("mainnet", "mainnet", d.url));
    for (const [argv, code] of cases(undefined, ws)) expectEnvelope(await cli(argv, ws), d, code);
  });
});
