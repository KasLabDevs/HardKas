import { describe, it, expect, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { cliDist } from "./first-contact-helpers.js";
import { hermeticChildEnv } from "./hermetic-child.js";
import { startDecoy, attemptsIn, type Decoy } from "./helpers/mainnet-decoy.js";

vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 });

// R3-D · `hardkas history <address>` (packages/cli/dist): MAINNET TOTAL LOCKDOWN — a mainnet network (the workspace's
// own, a --network, any spelling) or a mainnet address is refused with MAINNET_CONNECTION_DISABLED in the JSON envelope
// before anything is contacted: every "mainnet node" is a loopback decoy that counts TCP connections, and the hermetic
// preload logs every attempt. Usage errors are typed before any contact too. The real node is in
// packages/sdk/test/address-history-node.simnet.test.ts.

const made: string[] = [];
const decoys: Decoy[] = [];
const logs = fs.mkdtempSync(path.join(os.tmpdir(), "hk-r3d-hist-logs-"));
made.push(logs);
const SIM = "kaspasim:qra97q5zuevchu7w45mkjte5qa7saelqw3nfy2rljqjhkz0ngwk7vh34ldcsy";
const MAIN = "kaspa:qra97q5zuevchu7w45mkjte5qa7saelqw3nfy2rljqjhkz0ngwk7vh34ldcsy";
let n = 0;

afterAll(async () => {
  for (const d of decoys) await d.close().catch(() => {});
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

interface Run {
  exit: number | null;
  stdout: string;
  stderr: string;
  log: string;
}

async function cli(args: string[], cwd: string): Promise<Run> {
  const log = path.join(logs, `${++n}.net.log`);
  const env = hermeticChildEnv(log, { DOCKER_HOST: "tcp://127.0.0.1:9" });
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

const envelopeCode = (r: Run): string | undefined => {
  for (const chunk of r.stdout.trim().split(/\r?\n(?=\{)/)) {
    try {
      const d = JSON.parse(chunk.slice(chunk.indexOf("{"), chunk.lastIndexOf("}") + 1));
      if (d?.ok === false && typeof d.code === "string") return d.code;
    } catch {
      // a human line
    }
  }
  return undefined;
};

function workspace(label: string, name: string, declared: string, url: string, valid = true): string {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), `hk-r3d-hist-${label}-`));
  made.push(ws);
  fs.mkdirSync(path.join(ws, ".hardkas"));
  const cfg = {
    defaultNetwork: name,
    execution: { default: "t", targets: { t: { mode: "rpc", domain: "kaspa-l1", network: name } } },
    network: { allowPublic: true },
    // allowPublic requires experimental; without it the config does not load (HC-4)
    ...(valid ? { experimental: true } : {}),
    networks: { [name]: { kind: "kaspa-rpc", network: declared, rpcUrl: url, allowMainnet: true } }
  };
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), `export default ${JSON.stringify(cfg, null, 2)};\n`);
  return ws;
}

async function decoy(network: string): Promise<Decoy> {
  const d = await startDecoy(network);
  decoys.push(d);
  return d;
}

function expectRefused(r: Run, d: Decoy, code: string) {
  const brief = JSON.stringify({ exit: r.exit, code: envelopeCode(r), connections: d.connections, stdout: r.stdout.slice(-700), stderr: r.stderr.slice(-400) });
  expect(envelopeCode(r), brief).toBe(code);
  expect(r.exit, brief).not.toBe(0);
  expect(d.connections, brief).toBe(0);
  expect(attemptsIn(r.log, d.port).toPort, brief).toBe(0);
}

describe("R3-D · hardkas history: refused before any contact", () => {
  it("HC-1 a workspace whose network is mainnet (any spelling): MAINNET_CONNECTION_DISABLED, the decoy never contacted", async () => {
    for (const spelling of ["mainnet", "kaspa-mainnet"]) {
      const d = await decoy("mainnet");
      const ws = workspace(`m-${spelling}`, "main", spelling, d.url);
      expectRefused(await cli(["history", SIM, "--json"], ws), d, "MAINNET_CONNECTION_DISABLED");
    }
  });

  it("HC-2 --network mainnet with a --url, and a mainnet address: MAINNET_CONNECTION_DISABLED, nothing contacted", async () => {
    const d = await decoy("mainnet");
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "hk-r3d-hist-raw-"));
    made.push(cwd);
    expectRefused(await cli(["history", SIM, "--network", "mainnet", "--url", d.url, "--json"], cwd), d, "MAINNET_CONNECTION_DISABLED");
    expectRefused(await cli(["history", MAIN, "--url", d.url, "--json"], cwd), d, "MAINNET_CONNECTION_DISABLED");
  });

  it("HC-4 a workspace config that cannot be read: HARDKAS_CONFIG_ERROR before any connection (never a fallback to the canonical localnet)", async () => {
    const d = await decoy("mainnet");
    const ws = workspace("bad", "main", "mainnet", d.url, false);
    const r = await cli(["history", SIM, "--json"], ws);
    expectRefused(r, d, "HARDKAS_CONFIG_ERROR");
    expect(attemptsIn(r.log).all, "no connection attempted anywhere").toEqual([]);
  });

  it("HC-3 usage errors are typed before any contact (an option out of range; a testnet address with only --url)", async () => {
    const d = await decoy("simnet");
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "hk-r3d-hist-usage-"));
    made.push(cwd);
    expectRefused(await cli(["history", SIM, "--url", d.url, "--limit", "0", "--json"], cwd), d, "ADDRESS_HISTORY_USAGE");
    expectRefused(await cli(["history", SIM.replace("kaspasim:", "kaspatest:"), "--url", d.url, "--json"], cwd), d, "ADDRESS_HISTORY_USAGE");
  });
});
