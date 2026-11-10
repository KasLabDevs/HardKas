import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { cliDist } from "./first-contact-helpers.js";
import { hermeticChildEnv, assertHermeticPreloadActive } from "./hermetic-child.js";
import { startDecoy, attemptsIn, type Decoy } from "./helpers/mainnet-decoy.js";

vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 });

// -----------------------------------------------------------------------------
// MAINNET TOTAL LOCKDOWN · RC2 oracle D1 and D2 (2026-11-09). Every mainnet refusal is the lockdown's own typed code in
// the command's JSON ENVELOPE (`code` at the top level — never a text inside another error's message), decided FIRST:
// before a network name is resolved as a HardKAS network and before the public-network gate. Order (@hardkas/core
// mainnet-policy): a signature MAINNET_SIGNING_DISABLED, a send MAINNET_BROADCAST_DISABLED, anything else that would
// reach a node MAINNET_CONNECTION_DISABLED (Silver keeps SILVERSCRIPT_MAINNET_NOT_ENABLED, first). And `tx wait` ends at
// once (D1: it polled until --timeout and ended TX_WAIT_TIMEOUT). Every "mainnet node" is a loopback decoy that counts
// TCP connections; the hermetic preload logs every attempt. Throwaway keys, nothing funded, no real node.
// -----------------------------------------------------------------------------

const made: string[] = [];
const decoys: Decoy[] = [];
const logs = fs.mkdtempSync(path.join(os.tmpdir(), "hk-mlk-logs-"));
made.push(logs);
const FIXTURE = path.join(__dirname, "fixtures", "silver-keys-1", "vault-compile-record.json");
const DENY = "16110,16210,17110,17210,18110,18210,18211";
const TXID = "cd".repeat(32);
const SPELLINGS = ["kaspa", "mainnet-1", "kaspa-mainnet", "MAINNET"] as const;
let M1 = "";
let M2 = "";
let T1 = "";
let T2 = "";
let kaspa: any;
let n = 0;

interface Run {
  exit: number | null;
  stdout: string;
  stderr: string;
  log: string;
  ms: number;
}

async function cli(args: string[], cwd: string, extraEnv: Record<string, string> = {}): Promise<Run> {
  const log = path.join(logs, `${++n}.net.log`);
  const env = hermeticChildEnv(log, { HARDKAS_HERMETIC_DENY_PORTS: DENY, DOCKER_HOST: "tcp://127.0.0.1:9", HK_MLK_PW: "mlk-test-password", HK_MLK_KEY: "11".repeat(32), ...extraEnv });
  const t0 = Date.now();
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cliDist, ...args], { cwd, env, windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill(), 150_000);
    child.stdout.on("data", (d) => (stdout += String(d)));
    child.stderr.on("data", (d) => (stderr += String(d)));
    child.on("close", (exit) => {
      clearTimeout(timer);
      resolve({ exit, stdout, stderr, log, ms: Date.now() - t0 });
    });
    child.stdin.end();
  });
}

/** The command's JSON envelopes on stdout (one per document). */
function envelopes(stdout: string): any[] {
  return stdout
    .trim()
    .split(/\r?\n(?=\{)/)
    .map((chunk) => {
      for (const text of [chunk, chunk.slice(chunk.indexOf("{"), chunk.lastIndexOf("}") + 1)]) {
        try {
          return JSON.parse(text);
        } catch {
          // not a JSON document (a human line on stdout)
        }
      }
      return undefined;
    })
    .filter((d) => d && typeof d === "object");
}

/** The failure envelope's top-level `code` (what a script branches on). */
const envelopeCode = (r: Run): string | undefined => envelopes(r.stdout).find((d) => d.ok === false && typeof d.code === "string")?.code;

const brief = (r: Run, d?: Decoy) =>
  JSON.stringify({ exit: r.exit, ms: r.ms, code: envelopeCode(r), decoy: d ? { connections: d.connections, methods: d.methods } : undefined, stdout: r.stdout.slice(-900), stderr: r.stderr.slice(-500) });

/** The envelope's code IS `code`, the exit is a failure, and neither instrument saw a connection to `d`. */
function expectEnvelope(r: Run, d: Decoy, code: string) {
  const net = attemptsIn(r.log, d.port);
  expect(envelopeCode(r), brief(r, d)).toBe(code);
  expect(r.exit, brief(r, d)).not.toBe(0);
  expect(d.connections, brief(r, d)).toBe(0);
  expect(net.toPort, brief(r, d)).toBe(0);
  expect(net.refused, brief(r, d)).toEqual([]);
}

function dir(label: string): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), `hk-mlk-${label}-`));
  made.push(d);
  return d;
}

function workspace(label: string, cfg: Record<string, unknown>): string {
  const ws = dir(label);
  fs.mkdirSync(path.join(ws, ".hardkas"));
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), `export default ${JSON.stringify(cfg, null, 2)};\n`);
  return ws;
}

function cfgFor(name: string, declared: string, url: string): Record<string, unknown> {
  const isMain = /mainnet|^kaspa$/i.test(declared);
  return {
    defaultNetwork: name,
    execution: { default: "t", targets: { t: { mode: "rpc", domain: "kaspa-l1", network: name } } },
    network: { allowPublic: true },
    experimental: true,
    networks: { [name]: { kind: "kaspa-rpc", network: declared, rpcUrl: url, allowMainnet: true } },
    accounts: {
      alice: { kind: "kaspa", network: declared, address: isMain ? M1 : T1, privateKeyEnv: "HK_MLK_KEY" },
      bob: { kind: "kaspa", network: declared, address: isMain ? M2 : T2 },
      funder: { kind: "kaspa", network: declared, address: isMain ? M1 : T1, privateKeyEnv: "HK_MLK_KEY" }
    }
  };
}

async function decoy(network: string): Promise<Decoy> {
  const d = await startDecoy(network);
  decoys.push(d);
  return d;
}

/** A mainnet signed artifact, sealed (signedId derived from its hash): a transaction signed OUTSIDE HardKAS. */
async function signedMainnet(where: string): Promise<string> {
  const { HardkasSchemas } = await import("@hardkas/core");
  const { HARDKAS_VERSION, ARTIFACT_VERSION, CURRENT_HASH_VERSION, calculateContentHash } = await import("@hardkas/artifacts");
  const outpoint = { transactionId: crypto.createHash("sha256").update("mlk-funding").digest("hex"), index: 0 };
  const spk = kaspa.payToAddressScript(M1);
  const script = typeof spk.script === "string" ? spk.script : Buffer.from(spk.script).toString("hex");
  const tx = new kaspa.Transaction({
    version: 0,
    inputs: [{ previousOutpoint: outpoint, signatureScript: "", sequence: 0n, sigOpCount: 1, utxo: { outpoint, amount: 10_00000000n, scriptPublicKey: new kaspa.ScriptPublicKey(0, script), blockDaaScore: 1n, isCoinbase: false } }],
    outputs: [{ value: 1_00000000n, scriptPublicKey: kaspa.payToAddressScript(M2) }],
    lockTime: 0n,
    subnetworkId: "0000000000000000000000000000000000000000",
    gas: 0n,
    payload: ""
  });
  const signed = kaspa.signTransaction(tx, [new kaspa.PrivateKey("11".repeat(32))], true);
  const body: Record<string, unknown> = {
    schema: HardkasSchemas.SignedTx,
    hardkasVersion: HARDKAS_VERSION,
    version: ARTIFACT_VERSION,
    hashVersion: CURRENT_HASH_VERSION,
    createdAt: "2026-11-09T00:00:00.000Z",
    status: "signed",
    sourcePlanId: `plan-${"c".repeat(16)}`,
    networkId: "mainnet",
    mode: "rpc",
    execution: { mode: "rpc", domain: "kaspa-l1", network: "mainnet" },
    from: { address: M1 },
    to: { address: M2 },
    amountSompi: "100000000",
    txId: String(signed.id),
    signedTransaction: { format: "hex", payload: JSON.stringify(signed.serializeToObject(), (_k, v) => (typeof v === "bigint" ? v.toString() : v)) }
  };
  const contentHash = calculateContentHash(body, CURRENT_HASH_VERSION);
  const file = path.join(where, "mainnet-signed.json");
  fs.writeFileSync(file, JSON.stringify({ ...body, signedId: `signed-${contentHash.slice(0, 16)}`, contentHash }, null, 2));
  return file;
}

/** A mainnet plan, sealed (finalizeTxPlanIdentity): what any key holder can build offline. */
async function planMainnet(where: string): Promise<string> {
  const { finalizeTxPlanIdentity, HARDKAS_VERSION, ARTIFACT_VERSION } = await import("@hardkas/artifacts");
  const { HardkasSchemas } = await import("@hardkas/core");
  const spk = kaspa.payToAddressScript(M1);
  const script = typeof spk.script === "string" ? spk.script : Buffer.from(spk.script).toString("hex");
  const plan: any = finalizeTxPlanIdentity({
    schema: HardkasSchemas.TxPlan,
    hardkasVersion: HARDKAS_VERSION,
    version: ARTIFACT_VERSION,
    createdAt: "2026-11-09T00:00:00.000Z",
    networkId: "mainnet",
    mode: "rpc",
    execution: { mode: "rpc", domain: "kaspa-l1", network: "mainnet" },
    from: { address: M1 },
    to: { address: M2 },
    amountSompi: "100000000",
    estimatedFeeSompi: "203600",
    estimatedMass: "2036",
    inputs: [{ outpoint: { transactionId: "ab".repeat(32), index: 0 }, amountSompi: "1000000000", address: M1, scriptPublicKey: "0000" + script }],
    outputs: [{ address: M2, amountSompi: "100000000" }],
    change: { address: M1, amountSompi: "899796400" }
  } as any);
  const file = path.join(where, "mainnet-plan.json");
  fs.writeFileSync(file, JSON.stringify(plan, null, 2));
  return file;
}

beforeAll(async () => {
  assertHermeticPreloadActive();
  const core: any = await import("@hardkas/core");
  kaspa = core.loadManagedKaspaWasmSync();
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

describe("D1 · `tx wait` on mainnet ends at once with its typed code (it polled until --timeout)", () => {
  const ways: Array<[string, (d: Decoy) => string, Record<string, string>?]> = [
    ["a workspace that declares mainnet (every opt-in)", (d) => workspace("d1-ws", cfgFor("mainnet", "mainnet", d.url))],
    ["an alias 'prod' declaring kaspa-mainnet", (d) => workspace("d1-alias", cfgFor("prod", "kaspa-mainnet", d.url))],
    ["HARDKAS_* opt-ins set", (d) => workspace("d1-env", cfgFor("mainnet", "mainnet", d.url)), { HARDKAS_ALLOW_MAINNET: "1", HARDKAS_MAINNET: "1", HARDKAS_EXPERIMENTAL: "1" }]
  ];
  for (const [label, ws, env] of ways) {
    it(`${label}: MAINNET_CONNECTION_DISABLED in the envelope, well before --timeout 60, zero connections`, async () => {
      const d = await decoy("mainnet");
      const r = await cli(["tx", "wait", TXID, "--timeout", "60", "--json"], ws(d), env ?? {});
      expectEnvelope(r, d, "MAINNET_CONNECTION_DISABLED");
      expect(r.ms, brief(r, d)).toBeLessThan(30_000);
      expect(r.stdout + r.stderr, brief(r, d)).not.toMatch(/TX_WAIT_TIMEOUT/);
    });
  }

  it("a testnet-10 workspace whose node says mainnet (the limit): ends at once, after its one identity answer", async () => {
    const d = await decoy("mainnet");
    const r = await cli(["tx", "wait", TXID, "--timeout", "60", "--json"], workspace("d1-lie", cfgFor("testnet-10", "testnet-10", d.url)));
    expect(envelopeCode(r), brief(r, d)).toBe("MAINNET_CONNECTION_DISABLED");
    expect(r.exit, brief(r, d)).not.toBe(0);
    expect(r.ms, brief(r, d)).toBeLessThan(30_000);
    expect(d.methods.filter((m) => m !== "getServerInfo"), brief(r, d)).toEqual([]);
    expect(d.connections, brief(r, d)).toBe(1);
  });
});

describe("D2a · outside a workspace, `tx send|status|wait|sign --network mainnet`: the mainnet code, not PUBLIC_NETWORK_BLOCKED", () => {
  it("tx send <signed mainnet> (with and without --network mainnet --url): MAINNET_BROADCAST_DISABLED", async () => {
    const d = await decoy("mainnet");
    const here = dir("d2a-send");
    const file = await signedMainnet(here);
    for (const extra of [["--network", "mainnet", "--url", d.url], []]) {
      const r = await cli(["tx", "send", file, "--yes", ...extra, "--json"], here);
      expectEnvelope(r, d, "MAINNET_BROADCAST_DISABLED");
    }
    // and without --yes: the refusal, never "NOT EXECUTED, confirm with --yes"
    const r = await cli(["tx", "send", file, "--json"], here);
    expectEnvelope(r, d, "MAINNET_BROADCAST_DISABLED");
  });

  it("tx status / tx wait <txId> --network mainnet (the two take no --url): MAINNET_CONNECTION_DISABLED", async () => {
    const d = await decoy("mainnet");
    const here = dir("d2a-obs");
    for (const argv of [["tx", "status", TXID, "--network", "mainnet", "--json"], ["tx", "wait", TXID, "--network", "mainnet", "--timeout", "30", "--json"]]) {
      const r = await cli(argv, here);
      expectEnvelope(r, d, "MAINNET_CONNECTION_DISABLED");
      expect(r.ms, brief(r, d)).toBeLessThan(30_000);
    }
  });

  it("O5 · tx send in shortcut mode in a mainnet workspace (no --network): MAINNET_BROADCAST_DISABLED, not TX_SEND_FAILED", async () => {
    const d = await decoy("mainnet");
    const ws = workspace("o5", cfgFor("mainnet", "mainnet", d.url));
    const r = await cli(["tx", "send", "--from", "alice", "--to", "bob", "--amount", "1", "--yes", "--json"], ws);
    expectEnvelope(r, d, "MAINNET_BROADCAST_DISABLED");
  });

  it("tx sign <mainnet plan>: MAINNET_SIGNING_DISABLED (before any account or target is resolved)", async () => {
    const d = await decoy("mainnet");
    const here = dir("d2a-sign");
    const plan = await planMainnet(here);
    const r = await cli(["tx", "sign", plan, "--account", "alice", "--password-env", "HK_MLK_PW", "--json"], here);
    expectEnvelope(r, d, "MAINNET_SIGNING_DISABLED");
  });
});

describe("D2b · every spelling of mainnet as --network: the mainnet code, never UNKNOWN_NETWORK / RUN_NETWORK_UNKNOWN / EXECUTION_NETWORK_MISMATCH", () => {
  for (const spelling of SPELLINGS) {
    it(`--network ${spelling}`, async () => {
      const d = await decoy("mainnet");
      const other = await decoy("testnet-10");
      const ws = workspace(`d2b-${spelling}`, cfgFor("testnet-10", "testnet-10", other.url));
      const signed = await signedMainnet(ws);
      fs.writeFileSync(path.join(ws, "s.mjs"), "console.log('the script ran');\n");
      const cases: Array<[string[], string]> = [
        [["tx", "plan", M1, M2, "--amount", "1", "--network", spelling, "--url", d.url, "--json"], "MAINNET_CONNECTION_DISABLED"],
        [["tx", "status", TXID, "--network", spelling, "--json"], "MAINNET_CONNECTION_DISABLED"],
        [["tx", "wait", TXID, "--network", spelling, "--timeout", "30", "--json"], "MAINNET_CONNECTION_DISABLED"],
        [["tx", "send", signed, "--network", spelling, "--yes", "--json"], "MAINNET_BROADCAST_DISABLED"],
        [["tx", "send", "--from", "alice", "--to", "bob", "--amount", "1", "--network", spelling, "--yes", "--json"], "MAINNET_BROADCAST_DISABLED"],
        [["localnet", "fork", "--network", spelling, "--addresses", M1, "--at-daa-score", "1", "--json"], "MAINNET_CONNECTION_DISABLED"],
        [["run", "s.mjs", "--network", spelling, "--json"], "MAINNET_CONNECTION_DISABLED"]
      ];
      for (const [argv, code] of cases) {
        const r = await cli(argv, ws);
        expectEnvelope(r, d, code);
        expect(r.stdout + r.stderr, brief(r, d)).not.toMatch(/the script ran/);
      }
      expect(other.connections).toBe(0);
    });
  }
});

describe("D2c / O3 · an alias that declares mainnet gets the same code as the name", () => {
  for (const declared of ["mainnet", "kaspa", "mainnet-1", "kaspa-mainnet", "MAINNET"]) {
    it(`alias 'prod' → '${declared}': silver deploy|spend|covenant transition SILVERSCRIPT_MAINNET_NOT_ENABLED (before any record is read); escrow rescue-v1 prepare MAINNET_CONNECTION_DISABLED like --network mainnet`, async () => {
      const d = await decoy("mainnet");
      const other = await decoy("testnet-10");
      const ws = workspace(`d2c-${declared}`, {
        ...cfgFor("testnet-10", "testnet-10", other.url),
        networks: { "testnet-10": { kind: "kaspa-rpc", network: "testnet-10", rpcUrl: other.url }, prod: { kind: "kaspa-rpc", network: declared, rpcUrl: d.url, allowMainnet: true } }
      });
      for (const argv of [
        ["silver", "deploy", FIXTURE, "--from", "funder", "--password-env", "HK_MLK_PW", "--amount", "1", "--network", "prod", "--json"],
        ["silver", "spend", path.join(ws, "no-such-deploy.json"), "--entry", "spend", "--to", T2, "--network", "prod", "--json"],
        [
          "silver", "covenant", "transition", path.join(ws, "no-such-covenant.json"),
          "--policy", "step", "--constructor-args", path.join(ws, "no-such-args.json"), "--state-map", "{}", "--next-state", path.join(ws, "no-such-state.json"),
          "--network", "prod", "--json"
        ]
      ]) {
        const r = await cli(argv, ws);
        expectEnvelope(r, d, "SILVERSCRIPT_MAINNET_NOT_ENABLED");
      }
      const prepare = (network: string) =>
        cli(["escrow", "rescue-v1", "prepare", "--address", T1, "--outpoint", `${"a".repeat(64)}:0`, "--to", T2, "--network", network, "--json"], ws);
      const byAlias = await prepare("prod");
      const byName = await prepare("mainnet");
      expectEnvelope(byAlias, d, "MAINNET_CONNECTION_DISABLED");
      expectEnvelope(byName, d, "MAINNET_CONNECTION_DISABLED");
      expect(byAlias.exit, brief(byAlias, d)).toBe(byName.exit);
      expect(other.connections).toBe(0);
    });
  }
});

describe("O4 / O8 · the limit (a node declared testnet-10 that answers mainnet): the envelope carries the mainnet code", () => {
  it("tx status, doctor and escrow rescue-v1 prepare: MAINNET_CONNECTION_DISABLED, after the one identity answer", async () => {
    const d = await decoy("mainnet");
    const ws = workspace("lim", cfgFor("testnet-10", "testnet-10", d.url));
    const status = await cli(["tx", "status", TXID, "--json"], ws);
    expect(envelopeCode(status), brief(status, d)).toBe("MAINNET_CONNECTION_DISABLED");
    expect(status.exit, brief(status, d)).not.toBe(0);
    const doctor = await cli(["doctor", "--json"], ws);
    const report = envelopes(doctor.stdout).find((x) => x.diagnosis);
    expect(report?.diagnosis?.code, brief(doctor, d)).toBe("MAINNET_CONNECTION_DISABLED");
    expect((report?.checks ?? []).find((c: any) => c.section === "network-identity")?.code, brief(doctor, d)).toBe("MAINNET_CONNECTION_DISABLED");
    const prepare = await cli(["escrow", "rescue-v1", "prepare", "--address", T1, "--outpoint", `${"a".repeat(64)}:0`, "--to", T2, "--network", "testnet-10", "--json"], ws);
    expect(envelopeCode(prepare), brief(prepare, d)).toBe("MAINNET_CONNECTION_DISABLED");
    expect(d.methods.filter((m) => m !== "getServerInfo"), brief(prepare, d)).toEqual([]);
  });
});
