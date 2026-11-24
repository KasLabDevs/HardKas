import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { cliDist } from "./first-contact-helpers.js";
import { hermeticChildEnv, assertHermeticPreloadActive } from "./hermetic-child.js";
import { startDecoy, attemptsIn, type Decoy } from "./helpers/mainnet-decoy.js";

vi.setConfig({ testTimeout: 300_000, hookTimeout: 180_000 });

// -----------------------------------------------------------------------------
// BETA-FIX W2 · task 1 — every CLI command that broadcasts a transaction asks for the explicit confirmation of
// `tx send` on a network other than the simulator or a local simnet (AUX-11): without --yes it is refused with
// TX_SEND_CONFIRMATION_REQUIRED (exit 3, `outcome: "not_executed"`, the retry with --yes), BEFORE any node is contacted,
// any key or password is read or anything is written. Found on Testnet-10 (21-nov): `tx batch`, `wallet hd send`,
// `escrow fund | release` and `kcc20 deploy | transfer` broadcast there without --yes. Mainnet stays refused first
// (MAINNET_*), --yes or not; simnet keeps needing no --yes.
// Hermetic: the "testnet-10 node" is a loopback decoy that counts TCP connections, the preload logs every attempt;
// throwaway keys, nothing funded, nothing sent.
// -----------------------------------------------------------------------------

const made: string[] = [];
const decoys: Decoy[] = [];
const logs = fs.mkdtempSync(path.join(os.tmpdir(), "hk-w2-yes-logs-"));
made.push(logs);
const DENY = "16110,16210,17110,17210,18110,18210,18211";
const KEY = "22".repeat(32);
const BOB_KEY = "33".repeat(32);
const PW = "w2-yes-test-password";
let k: any;
let ALICE = "";
let BOB = "";
let n = 0;

interface Run {
  exit: number | null;
  stdout: string;
  stderr: string;
  log: string;
}

async function cli(args: string[], cwd: string): Promise<Run> {
  const log = path.join(logs, `${++n}.net.log`);
  const env = hermeticChildEnv(log, { NO_COLOR: "1", HARDKAS_HERMETIC_DENY_PORTS: DENY, DOCKER_HOST: "tcp://127.0.0.1:9", HK_W2_KEY: KEY, HK_W2_BOB_KEY: BOB_KEY, HK_W2_PW: PW });
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

function documents(stdout: string): any[] {
  return stdout
    .trim()
    .split(/\r?\n(?=\{)/)
    .map((chunk) => {
      try {
        return JSON.parse(chunk);
      } catch {
        return undefined;
      }
    })
    .filter((d) => d && typeof d === "object");
}
const failure = (r: Run) => documents(r.stdout).find((d) => d.ok === false && typeof d.code === "string");
const brief = (r: Run, d?: Decoy) =>
  JSON.stringify({ exit: r.exit, code: failure(r)?.code, decoy: d ? { connections: d.connections, methods: d.methods } : undefined, stdout: r.stdout.slice(-1200), stderr: r.stderr.slice(-600) });

function workspace(label: string, cfg: Record<string, unknown>): string {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), `hk-w2-yes-${label}-`));
  made.push(ws);
  fs.mkdirSync(path.join(ws, ".hardkas"));
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), `export default ${JSON.stringify(cfg, null, 2)};\n`);
  return ws;
}

/** testnet-10 opened as a payment network would be (experimental + allowPublic), its node the decoy; simnet unreachable. */
const publicCfg = (url: string) => ({
  defaultNetwork: "testnet-10",
  experimental: true,
  network: { allowPublic: true },
  execution: { default: "tn", targets: { tn: { mode: "rpc", domain: "kaspa-l1", network: "testnet-10" } } },
  networks: {
    simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: "ws://127.0.0.1:9" },
    "testnet-10": { kind: "kaspa-rpc", network: "testnet-10", rpcUrl: url }
  },
  accounts: {
    alice: { kind: "kaspa", network: "testnet-10", address: ALICE, privateKeyEnv: "HK_W2_KEY" },
    bob: { kind: "kaspa", network: "testnet-10", address: BOB, privateKeyEnv: "HK_W2_BOB_KEY" }
  }
});

const COVENANT = "ab".repeat(32);
const ESCROW_ID = "0c9b3f0e-4b1c-4c7e-9a51-6c0f2f9e1a10";

/** A well-formed legacy rescue package for testnet-10 (its draft does what it says), unsigned. */
function rescuePackage(dir: string): string {
  const target = ALICE;
  const spk = k.payToAddressScript(new k.Address(target));
  const pkg = {
    schema: "hardkas.escrow.rescue.v1",
    networkId: "testnet-10",
    outpoint: `${"cd".repeat(32)}:0`,
    totalSompi: "100000000",
    recoveredSompi: "99600000",
    feeSompi: "400000",
    targetAddress: target,
    draft: {
      networkId: "testnet-10",
      input: { outpoint: { transactionId: "cd".repeat(32), index: 0 }, amountSompi: "100000000" },
      outputs: [{ valueSompi: "99600000", scriptPublicKey: { version: Number(spk.version), script: String(spk.script) } }],
      feeSompi: "400000"
    },
    signatures: {}
  };
  const file = path.join(dir, "rescue.json");
  fs.writeFileSync(file, JSON.stringify(pkg, null, 2));
  return file;
}

beforeAll(async () => {
  assertHermeticPreloadActive();
  const core: any = await import("@hardkas/core");
  k = core.loadManagedKaspaWasmSync();
  ALICE = String(new k.PrivateKey(KEY).toPublicKey().toAddress("testnet-10").toString());
  BOB = String(new k.PrivateKey(BOB_KEY).toPublicKey().toAddress("testnet-10").toString());
});
afterAll(async () => {
  for (const d of decoys) await d.close();
  for (const p of made) fs.rmSync(p, { recursive: true, force: true });
});

describe("BETA-FIX W2 · every broadcasting command needs --yes on testnet-10 (TX_SEND_CONFIRMATION_REQUIRED, nothing contacted)", () => {
  it("tx batch (both forms), wallet hd send, escrow fund | release | rescue-v1 broadcast, kcc20 deploy | transfer, silver deploy | spend | covenant genesis | transition | start | advance | test --on-node, accounts consolidate --execute", async () => {
    const d = await startDecoy("testnet-10");
    decoys.push(d);
    const ws = workspace("tn", publicCfg(d.url));
    fs.writeFileSync(path.join(ws, "batch.json"), JSON.stringify({ payments: [{ from: "alice", to: "bob", amount: "1" }, { from: "alice", to: "bob", amount: "2" }] }));
    fs.writeFileSync(path.join(ws, "cases.test.json"), JSON.stringify({ tests: [] }));
    const rescue = rescuePackage(ws);
    // an HD wallet declared on testnet-10 (made offline; nothing contacted)
    const created = await cli(["wallet", "hd", "create", "--name", "tw", "--network", "testnet-10", "--password-env", "HK_W2_PW", "--words", "12", "--json"], ws);
    expect(created.exit, brief(created, d)).toBe(0);
    const connectionsBefore = d.connections;
    expect(connectionsBefore).toBe(0);

    const cases: Array<[string, string[]]> = [
      ["tx batch", ["tx", "batch", "--file", "batch.json", "--network", "testnet-10", "--json"]],
      ["tx batch --one-transaction", ["tx", "batch", "--file", "batch.json", "--network", "testnet-10", "--one-transaction", "--json"]],
      ["wallet hd send", ["wallet", "hd", "send", "tw", "--to", BOB, "--amount", "1", "--network", "testnet-10", "--password-env", "HK_W2_PW", "--json"]],
      ["escrow fund", ["escrow", "fund", ESCROW_ID, "--from", "alice", "--network", "testnet-10", "--json"]],
      ["escrow release", ["escrow", "release", ESCROW_ID, "--network", "testnet-10", "--json"]],
      ["escrow rescue-v1 broadcast", ["escrow", "rescue-v1", "broadcast", rescue, "--network", "testnet-10", "--json"]],
      ["kcc20 deploy", ["kcc20", "deploy", "token.compile.json", "--from", "alice", "--holder", "alice=1", "--network", "testnet-10", "--json"]],
      ["kcc20 transfer", ["kcc20", "transfer", "--covenant", COVENANT, "--from", "alice", "--to", "bob=1", "--network", "testnet-10", "--json"]],
      ["silver deploy", ["silver", "deploy", "contract.compile.json", "--from", "alice", "--amount", "1", "--network", "testnet-10", "--json"]],
      ["silver spend", ["silver", "spend", "contract.deploy.json", "--entry", "release", "--to", BOB, "--network", "testnet-10", "--json"]],
      ["silver covenant genesis", ["silver", "covenant", "genesis", "contract.compile.json", "--from", "alice", "--amount", "1", "--network", "testnet-10", "--json"]],
      [
        "silver covenant transition",
        ["silver", "covenant", "transition", "covenant.json", "--policy", "step", "--constructor-args", "ctor.json", "--state-map", "{\"value\":0}", "--next-state", "next.json", "--network", "testnet-10", "--json"]
      ],
      ["silver covenant start", ["silver", "covenant", "start", "contract.compile.json", "--from", "alice", "--output", "1", "--network", "testnet-10", "--json"]],
      ["silver covenant advance", ["silver", "covenant", "advance", "contract.compile.json", "--covenant", COVENANT, "--policy", "step", "--network", "testnet-10", "--json"]],
      ["silver test --on-node", ["silver", "test", "contract.compile.json", "--tests", "cases.test.json", "--on-node", "--from", "alice", "--network", "testnet-10", "--json"]],
      ["accounts consolidate", ["accounts", "consolidate", "alice", "--network", "testnet-10", "--execute", "--json"]]
    ];
    // every command is run, then the whole table is compared: a red run shows every command that broadcasts unconfirmed
    const table: Array<{ command: string; exit: number | null; code: string | undefined; connections: number; attempts: number; shape: boolean }> = [];
    const details: string[] = [];
    for (const [command, argv] of cases) {
      const before = d.connections;
      const r = await cli(argv, ws);
      const env = failure(r);
      const shape =
        env !== undefined &&
        env.command === command &&
        env.outcome === "not_executed" &&
        env.network === "testnet-10" &&
        /^NOT EXECUTED: .* requires explicit confirmation\. .*To execute, re-run with --yes\.$/.test(String(env.message)) &&
        /--yes/.test((env.nextSteps ?? []).join(" "));
      table.push({ command, exit: r.exit, code: env?.code, connections: d.connections - before, attempts: attemptsIn(r.log, d.port).toPort, shape });
      details.push(`${command}: ${brief(r)}`);
    }
    expect(table, details.join("\n")).toEqual(
      cases.map(([command]) => ({ command, exit: 3, code: "TX_SEND_CONFIRMATION_REQUIRED", connections: 0, attempts: 0, shape: true }))
    );
    // nothing written by any refusal: no artifact
    expect(fs.existsSync(path.join(ws, ".hardkas", "artifacts")) ? fs.readdirSync(path.join(ws, ".hardkas", "artifacts")) : []).toEqual([]);
  });

  it("the same commands with mainnet named are still refused by the lockdown first (MAINNET_*), without --yes", async () => {
    const d = await startDecoy("mainnet");
    decoys.push(d);
    const ws = workspace("main", publicCfg("ws://127.0.0.1:9"));
    fs.writeFileSync(path.join(ws, "batch.json"), JSON.stringify([{ from: "alice", to: "bob", amount: "1" }]));
    for (const argv of [
      ["tx", "batch", "--file", "batch.json", "--network", "mainnet", "--json"],
      ["escrow", "fund", ESCROW_ID, "--from", "alice", "--network", "mainnet", "--json"],
      ["kcc20", "transfer", "--covenant", COVENANT, "--from", "alice", "--to", "bob=1", "--network", "mainnet", "--json"],
      ["silver", "deploy", "contract.compile.json", "--from", "alice", "--amount", "1", "--network", "mainnet", "--json"]
    ]) {
      const r = await cli(argv, ws);
      expect(String(failure(r)?.code), `${argv.join(" ")} ${brief(r)}`).toMatch(/^(MAINNET_|SILVERSCRIPT_MAINNET_NOT_ENABLED$)/);
      expect(d.connections).toBe(0);
    }
  });

  it("control: on simnet nothing changes (no --yes asked: the command goes on to its own next step)", async () => {
    const ws = workspace("sim", { ...publicCfg("ws://127.0.0.1:9"), defaultNetwork: "simnet", execution: { default: "node", targets: { node: { mode: "rpc", domain: "kaspa-l1", network: "simnet" } } } });
    fs.writeFileSync(path.join(ws, "batch.json"), JSON.stringify([{ from: "alice", to: "bob", amount: "1" }]));
    for (const argv of [
      ["tx", "batch", "--file", "batch.json", "--network", "simnet", "--json"],
      ["escrow", "fund", ESCROW_ID, "--from", "alice", "--network", "simnet", "--json"],
      ["kcc20", "deploy", "token.compile.json", "--from", "alice", "--holder", "alice=1", "--network", "simnet", "--json"],
      ["silver", "deploy", "contract.compile.json", "--from", "alice", "--amount", "1", "--network", "simnet", "--json"]
    ]) {
      const r = await cli(argv, ws);
      expect(failure(r)?.code, `${argv.join(" ")} ${brief(r)}`).not.toBe("TX_SEND_CONFIRMATION_REQUIRED");
    }
    // `silver test --yes` confirms the node mode's broadcasts: without --on-node it has no effect, so it is refused
    fs.writeFileSync(path.join(ws, "cases.test.json"), JSON.stringify({ tests: [] }));
    const runnerYes = await cli(["silver", "test", "contract.compile.json", "--tests", "cases.test.json", "--yes", "--json"], ws);
    expect(failure(runnerYes)?.code, brief(runnerYes)).toBe("SILVER_TEST_OPTION_NEEDS_ON_NODE");
    expect(runnerYes.exit, brief(runnerYes)).toBe(2);
  });
});
