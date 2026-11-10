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
// MAINNET TOTAL LOCKDOWN (owner decision 2026-11-09; revokes MG-C2's read exception) · the CLI, command by command.
// Every "mainnet node" here is a loopback DECOY that counts TCP connections (helpers/mainnet-decoy.ts); each child also
// carries the hermetic preload, whose log records every connection attempt it makes (loopback included, anything else
// refused). A refusal counts only with a typed mainnet code AND zero connections on both instruments. Controls prove the
// instruments see a connection when one is made. Throwaway keys, never funded anywhere; no real node is contacted.
// -----------------------------------------------------------------------------

const made: string[] = [];
const decoys: Decoy[] = [];
const logs = fs.mkdtempSync(path.join(os.tmpdir(), "hk-mlc-logs-"));
made.push(logs);
const FIXTURE = path.join(__dirname, "fixtures", "silver-keys-1", "vault-compile-record.json");
const DENY = "16110,16210,17110,17210,18110,18210,18211";
let M1 = "";
let M2 = "";
let T1 = "";
let T2 = "";
let kaspa: any;
let n = 0;

/** A typed mainnet refusal, by any layer (the code, also inside a doctor check or a wrapped message). */
const MAINNET_CODE = /MAINNET_(CONNECTION|SIGNING|BROADCAST)_DISABLED|SILVERSCRIPT_MAINNET_NOT_ENABLED|MAINNET_NETWORK_CHECK_BLOCKED/;

interface Run {
  exit: number | null;
  out: string;
  log: string;
}

async function cli(args: string[], cwd: string, extraEnv: Record<string, string> = {}): Promise<Run> {
  const log = path.join(logs, `${++n}.net.log`);
  const env = hermeticChildEnv(log, { HARDKAS_HERMETIC_DENY_PORTS: DENY, DOCKER_HOST: "tcp://127.0.0.1:9", HK_MLC_PW: "mlc-test-password", HK_MLC_KEY: "11".repeat(32), ...extraEnv });
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cliDist, ...args], { cwd, env, windowsHide: true });
    let out = "";
    const timer = setTimeout(() => child.kill(), 150_000);
    child.stdout.on("data", (d) => (out += String(d)));
    child.stderr.on("data", (d) => (out += String(d)));
    child.on("close", (exit) => {
      clearTimeout(timer);
      resolve({ exit, out, log });
    });
    child.stdin.end();
  });
}

function workspace(label: string, cfg: Record<string, unknown> | string): string {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), `hk-mlc-${label}-`));
  made.push(ws);
  fs.mkdirSync(path.join(ws, ".hardkas"));
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), typeof cfg === "string" ? cfg : `export default ${JSON.stringify(cfg, null, 2)};\n`);
  return ws;
}

/** A workspace whose network entry `name` declares `declared` at `url` — with every opt-in HardKAS has ever read set. */
function cfgFor(name: string, declared: string, url: string | undefined, accountNetwork = declared): Record<string, unknown> {
  const isMain = /mainnet|^kaspa$/i.test(declared);
  return {
    defaultNetwork: name,
    execution: { default: "t", targets: { t: { mode: "rpc", domain: "kaspa-l1", network: name } } },
    network: { allowPublic: true },
    experimental: true,
    networks: { [name]: { kind: "kaspa-rpc", network: declared, ...(url !== undefined ? { rpcUrl: url } : {}), allowMainnet: true } },
    accounts: {
      alice: { kind: "kaspa", network: accountNetwork, address: isMain ? M1 : T1, privateKeyEnv: "HK_MLC_KEY" },
      bob: { kind: "kaspa", network: accountNetwork, address: isMain ? M2 : T2 },
      funder: { kind: "kaspa", network: accountNetwork, address: isMain ? M1 : T1, privateKeyEnv: "HK_MLC_KEY" }
    }
  };
}

/** Typed mainnet refusal, non-zero exit where the command fails, and ZERO connections to the decoy on both instruments. */
function expectRefusedUncontacted(r: Run, d: Decoy, opts: { code?: RegExp; exitZeroOk?: boolean } = {}) {
  const net = attemptsIn(r.log, d.port);
  const seen = { exit: r.exit, decoyConnections: d.connections, decoyMethods: d.methods, logAttemptsToDecoy: net.toPort, refused: net.refused, tail: r.out.slice(-1500) };
  expect(r.out, JSON.stringify(seen)).toMatch(opts.code ?? MAINNET_CODE);
  expect(d.connections, JSON.stringify(seen)).toBe(0);
  expect(net.toPort, JSON.stringify(seen)).toBe(0);
  expect(net.refused, JSON.stringify(seen)).toEqual([]);
  if (!opts.exitZeroOk) expect(r.exit, JSON.stringify(seen)).not.toBe(0);
}

async function decoy(network: string): Promise<Decoy> {
  const d = await startDecoy(network);
  decoys.push(d);
  return d;
}

const spkHex = (address: string) => {
  const spk = kaspa.payToAddressScript(address);
  return spk.version.toString(16).padStart(4, "0") + (typeof spk.script === "string" ? spk.script : Buffer.from(spk.script).toString("hex"));
};

/** A mainnet transaction signed OUTSIDE HardKAS (kaspa-wasm itself, as any key holder can), as a signed artifact file. */
async function thirdPartySignedMainnet(dir: string): Promise<string> {
  const { HardkasSchemas } = await import("@hardkas/core");
  const { HARDKAS_VERSION } = await import("@hardkas/artifacts");
  const outpoint = { transactionId: crypto.createHash("sha256").update("mlc-funding").digest("hex"), index: 0 };
  const hex = spkHex(M1);
  const tx = new kaspa.Transaction({
    version: 0,
    inputs: [
      {
        previousOutpoint: outpoint,
        signatureScript: "",
        sequence: 0n,
        sigOpCount: 1,
        utxo: { outpoint, amount: 10_00000000n, scriptPublicKey: new kaspa.ScriptPublicKey(0, hex.slice(4)), blockDaaScore: 1n, isCoinbase: false }
      }
    ],
    outputs: [{ value: 1_00000000n, scriptPublicKey: kaspa.payToAddressScript(M2) }],
    lockTime: 0n,
    subnetworkId: "0000000000000000000000000000000000000000",
    gas: 0n,
    payload: ""
  });
  const signed = kaspa.signTransaction(tx, [new kaspa.PrivateKey("11".repeat(32))], true);
  const { ARTIFACT_VERSION, CURRENT_HASH_VERSION, calculateContentHash } = await import("@hardkas/artifacts");
  const body: Record<string, unknown> = {
    schema: HardkasSchemas.SignedTx,
    hardkasVersion: HARDKAS_VERSION,
    version: ARTIFACT_VERSION,
    hashVersion: CURRENT_HASH_VERSION,
    createdAt: "2026-11-09T00:00:00.000Z",
    status: "signed",
    signedId: `signed-${String(signed.id).slice(0, 16)}`,
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
  const file = path.join(dir, "mainnet-signed.json");
  // signedId is a label outside the hash, derived from it (IC-4′.5)
  const contentHash = calculateContentHash(body, CURRENT_HASH_VERSION);
  fs.writeFileSync(file, JSON.stringify({ ...body, signedId: `signed-${contentHash.slice(0, 16)}`, contentHash }, null, 2));
  return file;
}

/** A mainnet Silver deploy record, sealed (what INT9-A verifies offline): integrity checkable with no node at all. */
async function mainnetDeployRecord(dir: string): Promise<string> {
  const { ARTIFACT_VERSION, CURRENT_HASH_VERSION, calculateContentHash, HARDKAS_VERSION } = await import("@hardkas/artifacts");
  const txId = crypto.createHash("sha256").update("mlc-deploy").digest("hex");
  const body: Record<string, unknown> = {
    schema: "hardkas.silverDeploy.v1",
    hardkasVersion: HARDKAS_VERSION,
    createdAt: "2026-11-09T00:00:00.000Z",
    networkId: "mainnet",
    capability: "silver.p2sh.deploy-spend.v1",
    compileRecord: { path: "c.json", contentHash: "a".repeat(64), artifactSha256: "b".repeat(64) },
    contract: "Vault",
    lockingScript: { version: 0, script: "aa20" + "11".repeat(32) + "87" },
    address: M1,
    txId,
    outpoint: { transactionId: txId, index: 0 },
    valueSompi: "100000000",
    feeSompi: "2036",
    status: "confirmed",
    confirmedAtBlockDaaScore: "1234",
    node: { kind: "rusty-kaspad", verified: true, serverVersion: "2.1.0", verification: "endpoint", network: "mainnet", sync: "synced", endpoint: "ws://127.0.0.1:26320" },
    version: ARTIFACT_VERSION,
    mode: "rpc",
    hashVersion: CURRENT_HASH_VERSION
  };
  const file = path.join(dir, "mainnet-deploy.json");
  fs.writeFileSync(file, JSON.stringify({ ...body, contentHash: calculateContentHash(body, CURRENT_HASH_VERSION) }, null, 2));
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
  for (const dir of made) fs.rmSync(dir, { recursive: true, force: true });
});

const TXID = "ab".repeat(32);

describe("MAINNET TOTAL LOCKDOWN · CLI · a workspace that declares mainnet (with every opt-in set): typed refusal, zero connections", () => {
  const cases: Array<[string, (ws: string, d: Decoy) => string[], { code?: RegExp; exitZeroOk?: boolean }?]> = [
    ["rpc info", () => ["rpc", "info", "--json"], { code: /MAINNET_CONNECTION_DISABLED/ }],
    ["rpc health", () => ["rpc", "health", "--json"], { code: /MAINNET_CONNECTION_DISABLED/ }],
    ["rpc dag", () => ["rpc", "dag", "--json"], { code: /MAINNET_CONNECTION_DISABLED/ }],
    ["rpc utxos", () => ["rpc", "utxos", M1, "--json"], { code: /MAINNET_CONNECTION_DISABLED/ }],
    ["rpc mempool", () => ["rpc", "mempool", "--json"], { code: /MAINNET_CONNECTION_DISABLED/ }],
    ["rpc compare", (_ws, d) => ["rpc", "compare", "--endpoints", d.url, d.url.replace("127.0.0.1", "localhost"), "--network", "mainnet", "--json"], { code: /MAINNET_CONNECTION_DISABLED/ }],
    ["accounts balance", () => ["accounts", "balance", M1, "--json"], { code: /MAINNET_CONNECTION_DISABLED/ }],
    ["tx plan", () => ["tx", "plan", "alice", "bob", "--amount", "1", "--json"], { code: /MAINNET_CONNECTION_DISABLED/ }],
    // RC2 oracle D2 (owner: typed, clear, consistent): a mainnet observation is refused like every other mainnet read —
    // the envelope's code is MAINNET_CONNECTION_DISABLED and the exit fails (it was exit 0, INSUFFICIENT_EVIDENCE with the
    // refusal only named as the reason); the exact envelope code is pinned in mainnet-lockdown-codes.test.ts
    ["tx status", () => ["tx", "status", TXID, "--json"], { code: /"code": "MAINNET_CONNECTION_DISABLED"/ }],
    // RC2 oracle D1: the wait ends at once with that code (it polled to --timeout and ended TX_WAIT_TIMEOUT, the refusal
    // only inside its message); timing and the exact envelope code are pinned in mainnet-lockdown-codes.test.ts
    ["tx wait", () => ["tx", "wait", TXID, "--timeout", "5", "--json"], { code: /"code": "MAINNET_CONNECTION_DISABLED"/ }],
    ["doctor", () => ["doctor", "--json"], { code: /MAINNET_CONNECTION_DISABLED/, exitZeroOk: true }],
    ["localnet fork", () => ["localnet", "fork", "--network", "mainnet", "--addresses", M1, "--at-daa-score", "1"], { code: /MAINNET_CONNECTION_DISABLED/ }],
    ["run", (ws) => (fs.writeFileSync(path.join(ws, "s.mjs"), "console.log('script ran');\n"), ["run", "s.mjs", "--network", "mainnet", "--json"]), { code: /MAINNET_CONNECTION_DISABLED/ }],
    ["silver deploy", () => ["silver", "deploy", FIXTURE, "--from", "funder", "--password-env", "HK_MLC_PW", "--amount", "1", "--network", "mainnet", "--json"], { code: /SILVERSCRIPT_MAINNET_NOT_ENABLED|MAINNET_CONNECTION_DISABLED/ }],
    ["kaspa wallet send --dry-run", (_ws, d) => ["kaspa", "wallet", "send", "alice", "bob", "--amount", "1", "--dry-run", "--rpc-url", d.url], { code: /MAINNET_CONNECTION_DISABLED/ }],
    ["accounts consolidate --execute --yes --allow-mainnet", () => ["accounts", "consolidate", "alice", "--execute", "--yes", "--allow-mainnet", "--json"], { code: /MAINNET_(BROADCAST|CONNECTION)_DISABLED/ }],
    ["capabilities --network mainnet --url", (_ws, d) => ["capabilities", "--network", "mainnet", "--url", d.url, "--json"], { code: /MAINNET_CONNECTION_DISABLED|SILVERSCRIPT_MAINNET_NOT_ENABLED/, exitZeroOk: true }]
  ];
  for (const [label, argv, opts] of cases) {
    it(`${label}`, async () => {
      const d = await decoy("mainnet");
      const ws = workspace("decl", cfgFor("mainnet", "mainnet", d.url));
      const r = await cli(argv(ws, d), ws);
      expectRefusedUncontacted(r, d, opts);
    });
  }

  it("tx send of a mainnet transaction signed outside HardKAS (--yes): MAINNET_BROADCAST_DISABLED, zero connections", async () => {
    const d = await decoy("mainnet");
    const ws = workspace("send", cfgFor("mainnet", "mainnet", d.url));
    const file = await thirdPartySignedMainnet(ws);
    const r = await cli(["tx", "send", file, "--yes", "--url", d.url, "--json"], ws);
    expectRefusedUncontacted(r, d, { code: /MAINNET_BROADCAST_DISABLED/ });
  });

  it("tx send in shortcut mode (--from --to --amount --network mainnet --yes): refused before any plan read, zero connections", async () => {
    const d = await decoy("mainnet");
    const ws = workspace("sendshort", cfgFor("mainnet", "mainnet", d.url));
    const r = await cli(["tx", "send", "--from", "alice", "--to", "bob", "--amount", "1", "--network", "mainnet", "--yes", "--json"], ws);
    expectRefusedUncontacted(r, d, { code: /MAINNET_(CONNECTION|BROADCAST)_DISABLED/ });
  });

  it("artifact verify --url of a mainnet record: verified offline (integrity), the network check blocked, zero connections", async () => {
    const d = await decoy("mainnet");
    const ws = workspace("verify", cfgFor("mainnet", "mainnet", d.url));
    const file = await mainnetDeployRecord(ws);
    const r = await cli(["artifact", "verify", file, "--url", d.url, "--json"], ws);
    expectRefusedUncontacted(r, d, { code: /MAINNET_NETWORK_CHECK_BLOCKED/, exitZeroOk: true });
    expect(r.out).toMatch(/INTEGRITY_VERIFIED/);
    expect(r.exit, r.out.slice(-800)).toBe(0);
  });
});

describe("MAINNET TOTAL LOCKDOWN · CLI · an explicit endpoint, an alias and every spelling", () => {
  for (const [label, argv] of [
    ["rpc info --network mainnet --url", (d: Decoy) => ["rpc", "info", "--network", "mainnet", "--url", d.url, "--json"]],
    ["rpc health --network kaspa --url", (d: Decoy) => ["rpc", "health", "--network", "kaspa", "--url", d.url, "--json"]],
    ["doctor --network mainnet --url", (d: Decoy) => ["doctor", "--network", "mainnet", "--url", d.url, "--json"]],
    ["accounts balance --network mainnet --url", (d: Decoy) => ["accounts", "balance", M1, "--network", "mainnet", "--url", d.url, "--json"]],
    ["tx plan --network mainnet --url", (d: Decoy) => ["tx", "plan", M1, M2, "--amount", "1", "--network", "mainnet", "--url", d.url, "--json"]]
  ] as const) {
    it(`${label} (in a testnet-10 workspace): refused, zero connections`, async () => {
      const d = await decoy("mainnet");
      const other = await decoy("testnet-10");
      const ws = workspace("expl", cfgFor("testnet-10", "testnet-10", other.url));
      const r = await cli([...argv(d)], ws);
      expectRefusedUncontacted(r, d, { code: /MAINNET_CONNECTION_DISABLED/, exitZeroOk: label.startsWith("doctor") });
      expect(other.connections, r.out.slice(-600)).toBe(0);
    });
  }

  for (const declared of ["mainnet", "kaspa", "mainnet-1", "kaspa-mainnet", "MAINNET"]) {
    it(`an alias 'prod' that declares network '${declared}': rpc info, accounts balance and doctor are refused, zero connections`, async () => {
      const d = await decoy("mainnet");
      const ws = workspace("alias", cfgFor("prod", declared, d.url));
      for (const argv of [["rpc", "info", "--json"], ["accounts", "balance", M1, "--json"], ["doctor", "--json"]]) {
        const r = await cli(argv, ws);
        expectRefusedUncontacted(r, d, { code: /MAINNET_CONNECTION_DISABLED/, exitZeroOk: argv[0] === "doctor" });
      }
    });
  }

  it("no environment variable, flag or config key opens it (HARDKAS_* set, allowPublic, experimental, allowMainnet, --allow-mainnet-signing)", async () => {
    const d = await decoy("mainnet");
    const ws = workspace("env", cfgFor("mainnet", "mainnet", d.url));
    const env = {
      HARDKAS_ALLOW_MAINNET: "1",
      HARDKAS_MAINNET: "1",
      HARDKAS_MAINNET_ENABLED: "true",
      HARDKAS_MAINNET_CONNECTIONS: "1",
      HARDKAS_EXPERIMENTAL: "1",
      HARDKAS_ALLOW_PUBLIC: "1"
    };
    for (const argv of [["rpc", "info", "--json"], ["tx", "plan", "alice", "bob", "--amount", "1", "--json"], ["rpc", "utxos", M1, "--url", d.url, "--network", "mainnet", "--json"]]) {
      const r = await cli(argv, ws, env);
      expectRefusedUncontacted(r, d, { code: /MAINNET_CONNECTION_DISABLED/ });
    }
  });
});

describe("MAINNET TOTAL LOCKDOWN · CLI · configuration failures never become a connection", () => {
  it("a mainnet entry with a malformed rpcUrl: MAINNET_CONNECTION_DISABLED (decided before the URL is even read)", async () => {
    const d = await decoy("mainnet");
    const ws = workspace("badurl", cfgFor("prod", "mainnet", "not a url at all"));
    const r = await cli(["rpc", "info", "--json"], ws);
    expectRefusedUncontacted(r, d, { code: /MAINNET_CONNECTION_DISABLED/ });
  });

  it("a mainnet entry with no rpcUrl: MAINNET_CONNECTION_DISABLED (not NETWORK_ENDPOINT_REQUIRED)", async () => {
    const d = await decoy("mainnet");
    const ws = workspace("nourl", cfgFor("mainnet", "mainnet", undefined));
    for (const argv of [["rpc", "info", "--json"], ["accounts", "balance", M1, "--json"], ["tx", "plan", "alice", "bob", "--amount", "1", "--json"]]) {
      const r = await cli(argv, ws);
      expectRefusedUncontacted(r, d, { code: /MAINNET_CONNECTION_DISABLED/ });
      expect(r.out).not.toMatch(/NETWORK_ENDPOINT_REQUIRED/);
    }
  });

  it("a workspace config that does not load, with --network mainnet --url: fails, zero connections", async () => {
    const d = await decoy("mainnet");
    const ws = workspace("broken", "export default { this is not valid ;\n");
    const r = await cli(["rpc", "info", "--network", "mainnet", "--url", d.url, "--json"], ws);
    const net = attemptsIn(r.log, d.port);
    expect(r.exit, r.out.slice(-800)).not.toBe(0);
    expect({ connections: d.connections, attempts: net.toPort }, r.out.slice(-800)).toEqual({ connections: 0, attempts: 0 });
  });
});

describe("MAINNET TOTAL LOCKDOWN · CLI · an endpoint declared as testnet-10 whose node says mainnet (the documented limit)", () => {
  for (const [label, argv, opts] of [
    ["rpc info", (_d: Decoy) => ["rpc", "info", "--json"], {}],
    ["accounts balance", (_d: Decoy) => ["accounts", "balance", T1, "--json"], {}],
    ["tx plan", (_d: Decoy) => ["tx", "plan", "alice", "bob", "--amount", "1", "--json"], {}],
    ["doctor", (_d: Decoy) => ["doctor", "--json"], { exitZeroOk: true }],
    ["rpc info --url (raw, no network)", (d: Decoy) => ["rpc", "info", "--url", d.url, "--json"], {}],
    ["rpc health --url (raw, no network)", (d: Decoy) => ["rpc", "health", "--url", d.url, "--json"], {}]
  ] as const) {
    it(`${label}: refused after the node's one identity answer (getServerInfo), nothing else asked`, async () => {
      const d = await decoy("mainnet");
      const ws = workspace("lie", cfgFor("testnet-10", "testnet-10", d.url));
      const r = await cli([...argv(d)], ws);
      const seen = { exit: r.exit, connections: d.connections, methods: d.methods, tail: r.out.slice(-1200) };
      expect(r.out, JSON.stringify(seen)).toMatch(/MAINNET_CONNECTION_DISABLED/);
      expect(d.methods.length, JSON.stringify(seen)).toBeGreaterThan(0);
      expect(d.methods.filter((m) => m !== "getServerInfo"), JSON.stringify(seen)).toEqual([]);
      if (!(opts as { exitZeroOk?: boolean }).exitZeroOk) expect(r.exit, JSON.stringify(seen)).not.toBe(0);
    });
  }
});

describe("MAINNET TOTAL LOCKDOWN · CLI · controls (the instruments see connections; offline stays offline)", () => {
  it("a testnet-10 node that says testnet-10: rpc info connects and reads (the decoy and the log both see it)", async () => {
    const d = await decoy("testnet-10");
    const ws = workspace("ctl", cfgFor("testnet-10", "testnet-10", d.url));
    const r = await cli(["rpc", "info", "--json"], ws);
    expect(r.exit, r.out.slice(-800)).toBe(0);
    expect(d.connections, r.out.slice(-800)).toBeGreaterThan(0);
    expect(attemptsIn(r.log, d.port).toPort, r.out.slice(-800)).toBeGreaterThan(0);
    expect(d.methods).toContain("getServerInfo");
  });

  it("artifact verify of a mainnet record WITHOUT --url, offline: integrity verified, exit 0, nothing contacted", async () => {
    const d = await decoy("mainnet");
    const ws = workspace("offline", cfgFor("mainnet", "mainnet", d.url));
    const file = await mainnetDeployRecord(ws);
    const r = await cli(["artifact", "verify", file, "--json"], ws);
    const net = attemptsIn(r.log, d.port);
    expect(r.out, r.out.slice(-1200)).toMatch(/INTEGRITY_VERIFIED/);
    expect({ exit: r.exit, connections: d.connections, attempts: net.toPort, refused: net.refused }, r.out.slice(-1200)).toEqual({ exit: 0, connections: 0, attempts: 0, refused: [] });
  });
});
