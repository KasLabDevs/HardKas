import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { cliDist } from "./first-contact-helpers.js";
import { hermeticChildEnv, assertHermeticPreloadActive } from "./hermetic-child.js";
import { startDecoy, attemptsIn, type Decoy } from "./helpers/mainnet-decoy.js";

vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 });

// -----------------------------------------------------------------------------
// R3-F · `hardkas silver spend --lock-time-daa | --lock-time-ms` before anything is read or contacted: mainnet is refused
// first (SILVERSCRIPT_MAINNET_NOT_ENABLED, as without the options; the "mainnet node" is a loopback decoy that counts TCP
// connections, the hermetic preload logs every attempt); a lock time that is not a typed value is LOCK_TIME_INVALID, a
// usage error (exit 2), before the deploy record is read (it does not exist here). The lock against the node and the
// entry: packages/sdk/test/cltv-v1-engine-cli-node.simnet.test.ts (C-0, C-1).
// -----------------------------------------------------------------------------

const made: string[] = [];
const decoys: Decoy[] = [];
let logs = "";
let n = 0;
const TO = "kaspasim:qypq2vmzm3zs6fljlwv0x2nq8nz3vh6hpn9n0x9sc5ekcl7w5yjxtrgwxj8cq9s";

interface Run {
  exit: number | null;
  stdout: string;
  stderr: string;
  log: string;
}

function cli(args: string[], cwd: string): Promise<Run> {
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

const codeOf = (r: Run): string | undefined => {
  for (const chunk of r.stdout.trim().split(/\r?\n(?=\{)/)) {
    try {
      const d = JSON.parse(chunk);
      if (d?.ok === false && typeof d.code === "string") return d.code;
    } catch {
      /* a human line */
    }
  }
  return undefined;
};
const brief = (r: Run, d?: Decoy) => JSON.stringify({ exit: r.exit, code: codeOf(r), decoy: d ? { connections: d.connections, methods: d.methods } : undefined, stdout: r.stdout.slice(-800), stderr: r.stderr.slice(-400) });

function workspace(label: string, cfg: Record<string, unknown>): string {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), `hk-r3f-${label}-`));
  made.push(ws);
  fs.mkdirSync(path.join(ws, ".hardkas"));
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), `export default ${JSON.stringify(cfg, null, 2)};\n`);
  return ws;
}

beforeAll(() => {
  assertHermeticPreloadActive();
  logs = fs.mkdtempSync(path.join(os.tmpdir(), "hk-r3f-logs-"));
  made.push(logs);
});
afterAll(async () => {
  for (const d of decoys) await d.close();
  for (const p of made) fs.rmSync(p, { recursive: true, force: true });
});

describe("R3-F · silver spend lock-time options", () => {
  it("LTC-1 mainnet (by name, and by an alias declaring it): SILVERSCRIPT_MAINNET_NOT_ENABLED with --lock-time-daa / --lock-time-ms, nothing contacted", async () => {
    const d = await startDecoy("mainnet");
    decoys.push(d);
    const ws = workspace("mainnet", {
      defaultNetwork: "prod",
      execution: { default: "t", targets: { t: { mode: "rpc", domain: "kaspa-l1", network: "prod" } } },
      network: { allowPublic: true },
      experimental: true,
      networks: { prod: { kind: "kaspa-rpc", network: "mainnet", rpcUrl: d.url, allowMainnet: true } }
    });
    const missing = path.join(ws, "no-such-deploy.json");
    for (const network of ["prod", "mainnet"]) {
      for (const lock of [["--lock-time-daa", "100"], ["--lock-time-ms", "1800000000000"], ["--lock-time-daa", "5", "--lock-time-ms", "1800000000000"]]) {
        const r = await cli(["silver", "spend", missing, "--entry", "claim", "--to", TO, "--network", network, ...lock, "--json"], ws);
        const net = attemptsIn(r.log, d.port);
        expect(codeOf(r), brief(r, d)).toBe("SILVERSCRIPT_MAINNET_NOT_ENABLED");
        expect(r.exit, brief(r, d)).toBe(2);
        expect(net.toPort, brief(r, d)).toBe(0);
        expect(net.refused, brief(r, d)).toEqual([]);
      }
    }
    expect(d.connections).toBe(0);
  });

  it("LTC-2 a lock time that is not a typed value: LOCK_TIME_INVALID, exit 2, before the deploy record is read", async () => {
    const ws = workspace("usage", { defaultNetwork: "simnet" });
    const missing = path.join(ws, "no-such-deploy.json");
    const cases: string[][] = [
      ["--lock-time-daa", "5", "--lock-time-ms", "1800000000000"],
      ["--lock-time-daa", "500000000000"],
      ["--lock-time-ms", "1153"],
      ["--lock-time-daa", "0"],
      ["--lock-time-daa", "12abc"],
      ["--lock-time-ms", "1800000000000.5"]
    ];
    for (const lock of cases) {
      const r = await cli(["silver", "spend", missing, "--entry", "claim", "--to", TO, ...lock, "--json"], ws);
      expect(codeOf(r), `${lock.join(" ")}: ${brief(r)}`).toBe("LOCK_TIME_INVALID");
      expect(r.exit, brief(r)).toBe(2);
      expect(attemptsIn(r.log).refused, brief(r)).toEqual([]);
    }
    // without a lock-time option the same command reaches the record (it does not exist): the options decide first
    const plain = await cli(["silver", "spend", missing, "--entry", "claim", "--to", TO, "--json"], ws);
    expect(codeOf(plain), brief(plain)).toBe("SILVER_FILE_NOT_FOUND");
  });

  it("LTC-3 the help names both options and what they do", async () => {
    const ws = workspace("help", { defaultNetwork: "simnet" });
    const r = await cli(["silver", "spend", "--help"], ws);
    const text = r.stdout.replace(/\s+/g, " ");
    expect(text).toMatch(/--lock-time-daa <n>/);
    expect(text).toMatch(/--lock-time-ms <t>/);
    expect(text).toMatch(/LOCK_TIME_NOT_REACHED/);
    expect(text).toMatch(/tx\.daa >= x/);
    expect(text).toMatch(/tx\.time >= t/);
  });
});
