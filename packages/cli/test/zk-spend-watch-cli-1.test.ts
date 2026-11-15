import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { cliDist, repoRoot } from "./first-contact-helpers.js";
import { hermeticChildEnv, assertHermeticPreloadActive } from "./hermetic-child.js";
import { startDecoy, attemptsIn, type Decoy } from "./helpers/mainnet-decoy.js";

vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 });

// -----------------------------------------------------------------------------
// ZK-SEND-1 + WATCH-CLI-1 · `hardkas zk toccata spend`, `zk toccata observe` and `hardkas watch` without a real node.
// Mainnet (a spelling, an alias that declares it, the workspace's own network, a mainnet address) is the lockdown's typed
// code in the JSON envelope and no connection reaches the decoy (a loopback server that counts every TCP connection; the
// hermetic preload logs every attempt). The spend's other refusals come before any node too: the confirmation off simnet
// (exit 3), the payments' opt-in for testnet-10, a network without ZK lock addresses. `watch` against a fake node (the
// decoy, which answers getServerInfo) of another network than the address's tracks nothing. The real node: the simnet
// files (zk-spend-send.simnet.test.ts, watch-cli.simnet.test.ts).
// -----------------------------------------------------------------------------

const made: string[] = [];
const decoys: Decoy[] = [];
const logs = fs.mkdtempSync(path.join(os.tmpdir(), "hk-zsw-logs-"));
made.push(logs);
const FX = path.join(repoRoot, "fixtures", "toccata-v2", "zk", "r0-groth16-official");
const IMAGE = JSON.parse(fs.readFileSync(path.join(FX, "image-id.json"), "utf8")).imageId as string;
const JOURNAL = JSON.parse(fs.readFileSync(path.join(FX, "journal.json"), "utf8")).journalHash as string;
const RECEIPT = path.join(FX, "receipt.hex");
const UTXO = `${"ab".repeat(32)}:0`;
const SIMNET_ADDRESS = "kaspasim:qr0lr4ml9fn3chekrqmjdkergxl93l4wrk3dankcgvjq776s9wn9jeadh9sjw";
let n = 0;

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

/** The JSON documents on stdout (pretty envelopes or JSON lines). */
function documents(stdout: string): any[] {
  const docs: any[] = [];
  for (const chunk of stdout.trim().split(/\r?\n(?=\{)/)) {
    try {
      docs.push(JSON.parse(chunk));
    } catch {
      // not a JSON document
    }
  }
  return docs;
}
const codeOf = (r: Run) => documents(r.stdout).find((d) => d.ok === false || d.event === "error")?.code;
const brief = (r: Run, d?: Decoy) => JSON.stringify({ exit: r.exit, code: codeOf(r), decoy: d ? { connections: d.connections, methods: d.methods } : undefined, stdout: r.stdout.slice(-900), stderr: r.stderr.slice(-500) });

function expectRefused(r: Run, d: Decoy, code: string) {
  expect(codeOf(r), brief(r, d)).toBe(code);
  expect(r.exit, brief(r, d)).not.toBe(0);
  expect(d.connections, brief(r, d)).toBe(0);
  expect(attemptsIn(r.log, d.port).toPort, brief(r, d)).toBe(0);
}

function workspace(label: string, cfg: Record<string, unknown>): string {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), `hk-zsw-${label}-`));
  made.push(ws);
  fs.mkdirSync(path.join(ws, ".hardkas"));
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), `export default ${JSON.stringify(cfg, null, 2)};\n`);
  return ws;
}
const nodeCfg = (name: string, declared: string, url: string, extra: Record<string, unknown> = {}) => ({
  defaultNetwork: name,
  execution: { default: "t", targets: { t: { mode: "rpc", domain: "kaspa-l1", network: name } } },
  networks: { [name]: { kind: "kaspa-rpc", network: declared, rpcUrl: url, allowMainnet: true } },
  ...extra
});
async function decoy(network: string): Promise<Decoy> {
  const d = await startDecoy(network);
  decoys.push(d);
  return d;
}
const spendArgs = ["zk", "toccata", "spend", "--receipt", RECEIPT, "--image-id", IMAGE, "--journal-hash", JOURNAL, "--utxo", UTXO, "--to", SIMNET_ADDRESS];

beforeAll(() => {
  assertHermeticPreloadActive();
  expect(fs.existsSync(cliDist), "packages/cli/dist (build the CLI first)").toBe(true);
});

afterAll(async () => {
  for (const d of decoys) await d.close();
  for (const p of made) fs.rmSync(p, { recursive: true, force: true });
});

describe("zk toccata spend / observe · mainnet is refused before any node", () => {
  for (const spelling of ["mainnet", "kaspa", "kaspa-mainnet", "MAINNET"]) {
    it(`spend --network ${spelling} → MAINNET_BROADCAST_DISABLED; observe → MAINNET_CONNECTION_DISABLED; the decoy is never reached`, async () => {
      const d = await decoy("mainnet");
      const ws = workspace("spell", nodeCfg("main", "mainnet", d.url));
      expectRefused(await cli([...spendArgs, "--network", spelling, "--url", d.url, "--yes", "--json"], ws), d, "MAINNET_BROADCAST_DISABLED");
      expectRefused(await cli(["zk", "toccata", "observe", "cd".repeat(32), "--network", spelling, "--url", d.url, "--json"], ws), d, "MAINNET_CONNECTION_DISABLED");
    });
  }

  it("an alias that declares mainnet, and the workspace's own mainnet network (no --network)", async () => {
    const d = await decoy("mainnet");
    const ws = workspace("alias", nodeCfg("prod", "mainnet", d.url));
    expectRefused(await cli([...spendArgs, "--network", "prod", "--yes", "--json"], ws), d, "MAINNET_BROADCAST_DISABLED");
    expectRefused(await cli([...spendArgs, "--yes", "--json"], ws), d, "MAINNET_BROADCAST_DISABLED");
    expectRefused(await cli(["zk", "toccata", "observe", "cd".repeat(32), "--json"], ws), d, "MAINNET_CONNECTION_DISABLED");
  });
});

describe("zk toccata spend · the other refusals before any node", () => {
  it("testnet-10 without --yes: NOT EXECUTED (ZK_SPEND_CONFIRMATION_REQUIRED, exit 3); with --yes but without the payments' opt-in: PUBLIC_NETWORK_BLOCKED", async () => {
    const d = await decoy("testnet-10");
    const ws = workspace("tn10", nodeCfg("testnet-10", "testnet-10", d.url));
    const noYes = await cli([...spendArgs, "--network", "testnet-10", "--json"], ws);
    expectRefused(noYes, d, "ZK_SPEND_CONFIRMATION_REQUIRED");
    expect(noYes.exit).toBe(3);
    expect(documents(noYes.stdout)[0]?.outcome).toBe("not_executed");
    expectRefused(await cli([...spendArgs, "--network", "testnet-10", "--yes", "--json"], ws), d, "PUBLIC_NETWORK_BLOCKED");
  });

  it("a network a ZK lock has no address on (devnet) is ZK_SPEND_NETWORK_UNSUPPORTED", async () => {
    const d = await decoy("devnet");
    const ws = workspace("devnet", nodeCfg("devnet", "devnet", d.url));
    expectRefused(await cli([...spendArgs, "--network", "devnet", "--yes", "--json"], ws), d, "ZK_SPEND_NETWORK_UNSUPPORTED");
  });

  it("a lock given twice (a record and parameters) or not at all is a usage error", async () => {
    const d = await decoy("simnet");
    const ws = workspace("usage", nodeCfg("simnet", "simnet", d.url));
    const record = path.join(ws, "lock.json");
    fs.writeFileSync(record, JSON.stringify({ schema: "hardkas.zk.toccata.scripts.v1", ok: true, imageId: IMAGE, journalHash: JOURNAL }));
    const both = await cli(["zk", "toccata", "spend", "--receipt", RECEIPT, "--scripts", record, "--image-id", IMAGE, "--utxo", UTXO, "--network", "simnet", "--url", d.url, "--json"], ws);
    expectRefused(both, d, "ZK_SPEND_LOCK_OPTIONS_CONFLICT");
    expect(both.exit).toBe(2);
    expectRefused(await cli(["zk", "toccata", "spend", "--receipt", RECEIPT, "--utxo", UTXO, "--network", "simnet", "--url", d.url, "--json"], ws), d, "ZK_SPEND_LOCK_REQUIRED");
    expectRefused(await cli([...spendArgs.slice(0, 9), "--utxo", "not-an-outpoint", "--network", "simnet", "--url", d.url, "--json"], ws), d, "ZK_SPEND_UTXO_INVALID");
  });
});

describe("hardkas watch · mainnet refused before any node; a fake node of another network tracks nothing", () => {
  it("--network mainnet (any spelling), an alias, a mainnet address: MAINNET_CONNECTION_DISABLED, the decoy never reached", async () => {
    const d = await decoy("mainnet");
    const ws = workspace("watch-main", nodeCfg("prod", "mainnet", d.url));
    for (const spelling of ["mainnet", "kaspa", "prod"]) {
      expectRefused(await cli(["watch", SIMNET_ADDRESS, "--network", spelling, "--url", d.url, "--json"], ws), d, "MAINNET_CONNECTION_DISABLED");
    }
    expectRefused(await cli(["watch", SIMNET_ADDRESS, "--json"], ws), d, "MAINNET_CONNECTION_DISABLED");
    const neutral = workspace("watch-neutral", nodeCfg("simnet", "simnet", d.url));
    expectRefused(await cli(["watch", "kaspa:qypyje0ykvtzrnmde4fjqmhq5fsrxc4d2pcfvq3hmrahmh4sphh4lsqlcrlncg8", "--url", d.url, "--json"], neutral), d, "MAINNET_CONNECTION_DISABLED");
  });

  it("a fake node that says testnet-10, for a simnet address: WATCH_ADDRESS_NETWORK_MISMATCH (or, with --network simnet, WATCH_NODE_NETWORK_MISMATCH); nothing is tracked", async () => {
    const d = await decoy("testnet-10");
    const ws = workspace("watch-fake", nodeCfg("simnet", "simnet", d.url));
    const raw = await cli(["watch", SIMNET_ADDRESS, "--url", d.url, "--timeout", "30", "--json"], ws);
    expect(codeOf(raw), brief(raw, d)).toBe("WATCH_ADDRESS_NETWORK_MISMATCH");
    expect(raw.exit, brief(raw, d)).not.toBe(0);
    expect(d.methods, brief(raw, d)).not.toContain("getUtxosByAddresses");
    const named = await cli(["watch", SIMNET_ADDRESS, "--network", "simnet", "--url", d.url, "--timeout", "30", "--json"], ws);
    expect(codeOf(named), brief(named, d)).toBe("WATCH_NODE_NETWORK_MISMATCH");
    expect(documents(named.stdout).some((x) => x.event === "snapshot"), brief(named, d)).toBe(false);
  });

  it("bad --timeout / --until values are usage errors, before any node", async () => {
    const d = await decoy("simnet");
    const ws = workspace("watch-usage", nodeCfg("simnet", "simnet", d.url));
    for (const args of [["--timeout", "0"], ["--until", "x"]]) {
      const r = await cli(["watch", SIMNET_ADDRESS, "--url", d.url, ...args, "--json"], ws);
      expectRefused(r, d, "WATCH_OPTION_INVALID");
      expect(r.exit).toBe(2);
    }
  });
});
