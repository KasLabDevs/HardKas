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
// R4-S · `hardkas silver test --on-node`, everything decided before a node is contacted, on the built CLI (hermetic: every
// "node" is a loopback decoy that counts TCP connections, and the preload logs every attempt; throwaway keys, nothing
// funded):
//   R1 mainnet in every spelling and as an alias: SILVERSCRIPT_MAINNET_NOT_ENABLED first, with or without --on-node;
//      testnet-10 without the payments' opt-in: PUBLIC_NETWORK_BLOCKED; zero connections
//   R2 the mode's options: --runner / --allow-unverified-runner with --on-node, --network / --url / --from / --timeout
//      without it, no --from, a bad --timeout: usage errors, nothing read
//   R3 cases no real transaction reproduces (no tx, a literal sig, a covenant field) and cases HardKAS refuses before
//      funding (fee below the node's minimum, above HardKAS's fee limit): each NOT_REPRODUCIBLE in the record, never a
//      pass; exit 1 SILVER_TEST_NOT_REPRODUCIBLE; no node contacted (nothing to fund)
// The node verdicts themselves: silver-test-on-node.simnet.test.ts.
// -----------------------------------------------------------------------------

const made: string[] = [];
const decoys: Decoy[] = [];
const logs = fs.mkdtempSync(path.join(os.tmpdir(), "hk-r4s-logs-"));
made.push(logs);
const FIXTURES = path.join(__dirname, "fixtures", "silver-keys-1");
const RECORD = path.join(FIXTURES, "vault-compile-record.json");
const CTOR = path.join(FIXTURES, "vault-ctor.args.json");
const DENY = "16110,16210,17110,17210,18110,18210,18211";
const KEY = "11".repeat(32);
const P2PK = `20${"11".repeat(32)}ac`;
let ALICE = "";
let n = 0;

interface Run {
  exit: number | null;
  stdout: string;
  stderr: string;
  log: string;
}

async function cli(args: string[], cwd: string): Promise<Run> {
  const log = path.join(logs, `${++n}.net.log`);
  const env = hermeticChildEnv(log, { NO_COLOR: "1", HARDKAS_HERMETIC_DENY_PORTS: DENY, DOCKER_HOST: "tcp://127.0.0.1:9", HK_R4S_KEY: KEY });
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
const envelopeCode = (r: Run) => documents(r.stdout).find((d) => d.ok === false && typeof d.code === "string")?.code;
const recordOf = (r: Run) => documents(r.stdout).find((d) => d.schema === "hardkas.silverNodeTest.v1");
const brief = (r: Run, d?: Decoy) => JSON.stringify({ exit: r.exit, code: envelopeCode(r), decoy: d ? { connections: d.connections, methods: d.methods } : undefined, stdout: r.stdout.slice(-1500), stderr: r.stderr.slice(-600) });

function expectNoContact(r: Run, d: Decoy) {
  const net = attemptsIn(r.log, d.port);
  expect(d.connections, brief(r, d)).toBe(0);
  expect(net.toPort, brief(r, d)).toBe(0);
}

async function decoy(network: string): Promise<Decoy> {
  const d = await startDecoy(network);
  decoys.push(d);
  return d;
}

function workspace(label: string, cfg: Record<string, unknown>, tests?: unknown): string {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), `hk-r4s-${label}-`));
  made.push(ws);
  fs.mkdirSync(path.join(ws, ".hardkas"));
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), `export default ${JSON.stringify(cfg, null, 2)};\n`);
  if (tests !== undefined) fs.writeFileSync(path.join(ws, "cases.test.json"), JSON.stringify(tests));
  return ws;
}

const simnetCfg = (url: string) => ({
  defaultNetwork: "simnet",
  execution: { default: "node", targets: { node: { mode: "rpc", domain: "kaspa-l1", network: "simnet" } } },
  networks: { simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: url } },
  accounts: { alice: { kind: "kaspa", network: "simnet", address: ALICE, privateKeyEnv: "HK_R4S_KEY" } }
});

const onNode = (extra: string[] = []) => ["silver", "test", RECORD, "--args", CTOR, "--tests", "cases.test.json", "--on-node", ...extra, "--json"];

beforeAll(async () => {
  assertHermeticPreloadActive();
  const core: any = await import("@hardkas/core");
  const k = core.loadManagedKaspaWasmSync();
  ALICE = String(new k.PrivateKey(KEY).toPublicKey().toAddress("simnet").toString());
});
afterAll(async () => {
  for (const d of decoys) await d.close();
  for (const p of made) fs.rmSync(p, { recursive: true, force: true });
});

const anyCase = { tests: [{ name: "t", function: "release", args: [{ signature: "alice" }], expect: "pass", tx: { version: 0, inputs: [{ utxo_value: 1_000_000_000 }], outputs: [{ value: 999_000_000, script_hex: P2PK }] } }] };

describe("R4-S · R1 the network is refused first, nothing contacted", () => {
  it("mainnet in every spelling, with and without --on-node, and an alias declaring mainnet: SILVERSCRIPT_MAINNET_NOT_ENABLED, exit 2, zero connections", async () => {
    const d = await decoy("mainnet");
    const ws = workspace("r1-main", {
      ...simnetCfg(d.url),
      network: { allowPublic: true },
      experimental: true,
      networks: { simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: d.url }, prod: { kind: "kaspa-rpc", network: "mainnet", rpcUrl: d.url, allowMainnet: true } }
    }, anyCase);
    for (const network of ["mainnet", "kaspa", "mainnet-1", "kaspa-mainnet", "MAINNET", "prod"]) {
      for (const argv of [onNode(["--network", network, "--from", "alice", "--url", d.url]), ["silver", "test", RECORD, "--args", CTOR, "--tests", "cases.test.json", "--network", network, "--json"]]) {
        const r = await cli(argv, ws);
        expect(envelopeCode(r), `${network} ${brief(r, d)}`).toBe("SILVERSCRIPT_MAINNET_NOT_ENABLED");
        expect(r.exit, brief(r, d)).toBe(2);
        expectNoContact(r, d);
        expect(recordOf(r)).toBeUndefined();
      }
    }
  });

  it("testnet-10 without experimental + network.allowPublic: PUBLIC_NETWORK_BLOCKED, exit 3, zero connections", async () => {
    const d = await decoy("testnet-10");
    const ws = workspace("r1-tn", { ...simnetCfg(d.url), networks: { "testnet-10": { kind: "kaspa-rpc", network: "testnet-10", rpcUrl: d.url } } }, anyCase);
    const r = await cli(onNode(["--network", "testnet-10", "--from", "alice"]), ws);
    expect(envelopeCode(r), brief(r, d)).toBe("PUBLIC_NETWORK_BLOCKED");
    expect(r.exit, brief(r, d)).toBe(3);
    expectNoContact(r, d);
  });
});

describe("R4-S · R2 the mode's options (usage, exit 2, nothing read)", () => {
  it("runner options with --on-node, node options without it, no --from, a bad --timeout", async () => {
    const d = await decoy("simnet");
    const ws = workspace("r2", simnetCfg(d.url), anyCase);
    const cases: Array<[string[], string]> = [
      [onNode(["--runner", "x.exe", "--from", "alice"]), "SILVER_TEST_OPTION_CONFLICT"],
      [onNode(["--allow-unverified-runner", "--from", "alice"]), "SILVER_TEST_OPTION_CONFLICT"],
      [["silver", "test", RECORD, "--args", CTOR, "--tests", "cases.test.json", "--from", "alice", "--json"], "SILVER_TEST_OPTION_NEEDS_ON_NODE"],
      [["silver", "test", RECORD, "--args", CTOR, "--tests", "cases.test.json", "--url", d.url, "--timeout", "5", "--json"], "SILVER_TEST_OPTION_NEEDS_ON_NODE"],
      [onNode(), "SILVER_TEST_FUNDER_REQUIRED"],
      [onNode(["--from", "alice", "--timeout", "0"]), "SILVER_OPTION_INVALID"],
      [onNode(["--from", "alice", "--timeout", "1.5"]), "SILVER_OPTION_INVALID"]
    ];
    for (const [argv, code] of cases) {
      const r = await cli(argv, ws);
      expect(envelopeCode(r), `${argv.join(" ")} ${brief(r, d)}`).toBe(code);
      expect(r.exit, brief(r, d)).toBe(2);
      expectNoContact(r, d);
    }
  });
});

describe("R4-S · R3 NOT_REPRODUCIBLE before any node: in the record, never a pass", () => {
  it("no tx, a literal sig, a covenant field, a fee below the node's minimum, a fee above HardKAS's limit: exit 1 SILVER_TEST_NOT_REPRODUCIBLE, nothing funded or contacted", async () => {
    const d = await decoy("simnet");
    const tx = (utxo: number, out: number) => ({ version: 0, inputs: [{ utxo_value: utxo, sig_op_count: 1 }], outputs: [{ value: out, script_hex: P2PK }] });
    const tests = {
      tests: [
        { name: "default-scenario", function: "release", args: [{ signature: "alice" }], expect: "pass" },
        { name: "literal-sig", function: "release", args: [`0x${"00".repeat(65)}`], expect: "fail", tx: tx(1_000_000_000, 999_000_000) },
        { name: "covenant-input", function: "release", args: [{ signature: "alice" }], expect: "pass", tx: { ...tx(1_000_000_000, 999_000_000), inputs: [{ utxo_value: 1_000_000_000, covenant_id: "cd".repeat(32) }] } },
        { name: "no-fee", function: "release", args: [{ signature: "alice" }], expect: "pass", tx: tx(1_000_000_000, 1_000_000_000) },
        { name: "fee-above-limit", function: "release", args: [{ signature: "alice" }], expect: "fail", tx: tx(10_000_000_000, 1_000_000_000) }
      ]
    };
    const ws = workspace("r3", simnetCfg(d.url), tests);
    const r = await cli(onNode(["--from", "alice", "--url", d.url]), ws);
    // JSON mode writes one document: the record (status INCOMPLETE) is it, so no failure envelope follows; exit 1
    expect(envelopeCode(r), brief(r, d)).toBeUndefined();
    expect(r.exit, brief(r, d)).toBe(1);
    const human = await cli(onNode(["--from", "alice", "--url", d.url]).filter((a) => a !== "--json"), ws);
    expect(human.exit, brief(human, d)).toBe(1);
    expect(human.stderr, brief(human, d)).toMatch(/SILVER_TEST_NOT_REPRODUCIBLE/);
    expect(human.stdout, brief(human, d)).toMatch(/5 tests: 0 passed, 0 failed, 0 without a verdict, 5 not reproducible/);
    expect(human.stdout, brief(human, d)).not.toMatch(/\bPASS\b/);
    expectNoContact(human, d);
    expectNoContact(r, d);
    const record = recordOf(r);
    expect(record, brief(r, d)).toBeDefined();
    expect(record.mode).toBe("rpc");
    expect(record.networkId).toBe("simnet");
    expect(record.node).toBeUndefined();
    expect(record.results.map((x: any) => [x.name, x.outcome, x.verdictLevel, x.nodeVerdict, x.notReproducible?.code, x.notReproducible?.hardkasCode])).toEqual([
      ["default-scenario", "NOT_REPRODUCIBLE", null, null, "RUNNER_DEFAULT_SCENARIO", undefined],
      ["literal-sig", "NOT_REPRODUCIBLE", null, null, "SCENARIO_SIGNATURE", undefined],
      ["covenant-input", "NOT_REPRODUCIBLE", null, null, "COVENANT_CONTEXT", undefined],
      ["no-fee", "NOT_REPRODUCIBLE", null, null, "HARDKAS_REFUSED", "FEE_BELOW_NETWORK_MINIMUM"],
      ["fee-above-limit", "NOT_REPRODUCIBLE", null, null, "HARDKAS_REFUSED", "FEE_EXCEEDS_MAX"]
    ]);
    expect(record.summary).toEqual({ total: 5, passed: 0, failed: 0, inconclusive: 0, notReproducible: 5, level: "CONSENSUS_SIMNET", casesAtLevel: 0 });
    expect(record.status).toBe("INCOMPLETE");
    expect(record.results.every((x: any) => x.coin === undefined && x.txId === undefined)).toBe(true);
    // the record is where the node records go, never with the runner's
    expect(String(record.recordPath).replace(/\\/g, "/")).toMatch(/\.hardkas\/artifacts\/silver\/silverNodeTest-[0-9a-f]{16}\.json$/);
  });

  it("control: without --on-node the runner mode is unchanged (its runner is resolved first; none here: SILVER_RUNNER_NOT_FOUND, exit 2)", async () => {
    const d = await decoy("simnet");
    const ws = workspace("r3-runner", simnetCfg(d.url), anyCase);
    const r = await cli(["silver", "test", RECORD, "--args", CTOR, "--tests", "cases.test.json", "--runner", path.join(ws, "no-such-runner.exe"), "--allow-unverified-runner", "--json"], ws);
    expect(envelopeCode(r), brief(r, d)).toBe("SILVER_RUNNER_NOT_FOUND");
    expect(r.exit, brief(r, d)).toBe(2);
    expectNoContact(r, d);
  });
});
