import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import type { AddressInfo } from "node:net";
import { WebSocketServer } from "ws";
import { cliDist } from "./first-contact-helpers.js";
import { hermeticChildEnv, assertHermeticPreloadActive } from "./hermetic-child.js";

vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 });

// -----------------------------------------------------------------------------
// HARDKAS-MAINNET-PERIMETER-1 (2026-10-17) · B1 — `hardkas kaspa wallet send` against loopback
// fake JSON-wRPC nodes. Throwaway key ("11"×32), never funded anywhere; the fake's UTXOs are invented.
// Facts behind the scenario (rusty-kaspa v2.1.0): getUtxosByAddresses maps addresses with pay_to_address_script and
// never checks the prefix; the sighash commits to no network id. So a node of ANOTHER network would serve the same
// key's UTXOs and accept its signature: only HardKAS can refuse.
// -----------------------------------------------------------------------------

const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
let kaspa: any;
let sender = "";
let recipient = "";
let senderSpk = "";
let simSender = "";
let simRecipient = "";
const KEY_ENV = "MPW_THROWAWAY_KEY";

type Fake = { url: string; port: number; methods: string[]; submits: number; close(): Promise<void> };
async function startFake(networkId: string): Promise<Fake> {
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise<void>((r, j) => { server.on("listening", () => r()); server.on("error", j); });
  const fake: Fake = { url: "", port: 0, methods: [], submits: 0, close: async () => {} };
  const zero = "0".repeat(64);
  server.on("connection", (socket) => {
    socket.on("message", (data) => {
      const text = String(data);
      const id = /"id"\s*:\s*(\d+)/.exec(text)?.[1];
      const method = /"method"\s*:\s*"([^"]+)"/.exec(text)?.[1] ?? "?";
      let params: any;
      try { params = JSON.parse(text.replace(/"id"\s*:\s*\d+/, '"id":0')).params; } catch { params = undefined; }
      fake.methods.push(method);
      if (!id) return;
      const ok = (result: unknown) => socket.send(`{"id":${id},"method":"${method}","params":${JSON.stringify(result)}}`);
      const err = (message: string) => socket.send(`{"id":${id},"error":{"code":0,"message":${JSON.stringify(message)},"data":null}}`);
      switch (method) {
        case "getServerInfo":
          return ok({ rpcApiVersion: 1, rpcApiRevision: 0, serverVersion: "2.1.0", networkId, hasUtxoIndex: true, isSynced: true, virtualDaaScore: 600_000_000 });
        case "getInfo":
          return ok({ p2pId: "mca", mempoolSize: 0, serverVersion: "2.1.0", isUtxoIndexed: true, isSynced: true, hasNotifyCommand: true, hasMessageId: true });
        case "getBlockDagInfo":
          return ok({ network: networkId, blockCount: 10, headerCount: 10, tipHashes: [sha("tip")], difficulty: 1, pastMedianTime: Date.now(), virtualParentHashes: [sha("tip")], pruningPointHash: sha("pp"), virtualDaaScore: 600_000_000, sink: sha("tip") });
        case "getSinkBlueScore":
          return ok({ blueScore: 588_000_000 });
        case "getFeeEstimate":
          return ok({ estimate: { priorityBucket: { feerate: 1, estimatedSeconds: 1 }, normalBuckets: [], lowBuckets: [] } });
        case "getMempoolEntriesByAddresses":
          return ok({ entries: [] });
        case "getUtxosByAddresses":
          return ok({ entries: (params?.addresses ?? []).map((address: string) => ({ address, outpoint: { transactionId: sha("mca-funding"), index: 0 }, utxoEntry: { amount: 50_00000000, blockDaaScore: 599_000_000, covenantId: null, isCoinbase: false, scriptPublicKey: senderSpk } })) });
        case "getBalancesByAddresses":
          return ok({ entries: (params?.addresses ?? []).map((address: string) => ({ address, balance: 50_00000000 })) });
        case "submitTransaction":
          fake.submits++;
          return ok({ transactionId: sha("mca-submitted") });
        case "getBlock":
          return err(`cannot find header ${params?.hash ?? zero}`);
        default:
          return err(`fake does not implement ${method}`);
      }
    });
  });
  fake.port = (server.address() as AddressInfo).port;
  fake.url = `ws://127.0.0.1:${fake.port}`;
  fake.close = () => new Promise<void>((r) => { for (const c of server.clients) c.terminate(); server.close(() => r()); });
  return fake;
}

const made: string[] = [];
const fakes: Fake[] = [];
const logs = fs.mkdtempSync(path.join(os.tmpdir(), "hk-mpw-netlogs-"));
made.push(logs);

async function run(name: string, argv: string[], cwd: string, stdin: string) {
  const log = path.join(logs, `${name}.net.log`);
  const env = hermeticChildEnv(log, { [KEY_ENV]: "11".repeat(32) });
  const r = await new Promise<{ status: number | null; out: string }>((resolve) => {
    const child = spawn(process.execPath, argv, { cwd, env });
    let out = "";
    const timer = setTimeout(() => child.kill(), 170_000);
    child.stdout.on("data", (d) => (out += String(d)));
    child.stderr.on("data", (d) => (out += String(d)));
    child.on("close", (status) => { clearTimeout(timer); resolve({ status, out }); });
    child.stdin.write(stdin);
    child.stdin.end();
  });
  return { exit: r.status, out: r.out };
}

function workspace(label: string, url: string, network = "testnet-10"): string {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), `hk-mpw-${label}-`));
  made.push(ws);
  fs.mkdirSync(path.join(ws, ".hardkas"));
  const cfg = {
    defaultNetwork: network,
    execution: { default: "tn", targets: { tn: { mode: "rpc", domain: "kaspa-l1", network } } },
    network: { allowPublic: true },
    experimental: true,
    networks: { [network]: { kind: "kaspa-rpc", network, rpcUrl: url } },
    accounts: {
      sender: { kind: "kaspa", network, address: network === "testnet-10" ? sender : simSender, privateKeyEnv: KEY_ENV },
      recipient: { kind: "kaspa", network, address: network === "testnet-10" ? recipient : simRecipient }
    }
  };
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), `export default ${JSON.stringify(cfg, null, 2)};\n`);
  return ws;
}

beforeAll(async () => {
  assertHermeticPreloadActive();
  const coreMod: any = await import("@hardkas/core");
  kaspa = coreMod.loadManagedKaspaWasmSync();
  const pk = new kaspa.PrivateKey("11".repeat(32));
  sender = pk.toPublicKey().toAddress("testnet-10").toString();
  recipient = new kaspa.PrivateKey("22".repeat(32)).toPublicKey().toAddress("testnet-10").toString();
  simSender = pk.toPublicKey().toAddress("simnet").toString();
  simRecipient = new kaspa.PrivateKey("22".repeat(32)).toPublicKey().toAddress("simnet").toString();
  const spk = kaspa.payToAddressScript(sender);
  senderSpk = spk.version.toString(16).padStart(4, "0") + (typeof spk.script === "string" ? spk.script : Buffer.from(spk.script).toString("hex"));
});
afterAll(async () => {
  for (const f of fakes) await f.close();
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

const frames = (f: Fake) => f.methods.length;

describe("MPW `hardkas kaspa wallet send` · B1", () => {
  for (const [label, wsNetwork, nodeNetwork] of [
    ["MPW-1 simnet workspace, simnet node", "simnet", "simnet"],
    ["MPW-2 testnet-10 workspace, testnet-10 node", "testnet-10", "testnet-10"],
    ["MPW-3 testnet-10 workspace, MAINNET node (it serves the kaspatest: key's UTXOs)", "testnet-10", "mainnet"]
  ] as const) {
    it(`${label}: the send is refused (KASPA_WALLET_SEND_DISABLED) before any connection — 0 frames, never a submitTransaction`, async () => {
      const F = await startFake(nodeNetwork);
      fakes.push(F);
      const ws = workspace(label.slice(0, 5), F.url, wsNetwork);
      const r = await run(label.slice(0, 5), [cliDist, "kaspa", "wallet", "send", "sender", "recipient", "--amount", "1", "--rpc-url", F.url], ws, "y\n");
      const seen = { exit: r.exit, submits: F.submits, methods: F.methods, tail: r.out.slice(-800) };
      expect(F.submits, JSON.stringify(seen)).toBe(0);
      expect(r.out, JSON.stringify(seen)).toMatch(/KASPA_WALLET_SEND_DISABLED/);
      expect(frames(F), JSON.stringify(seen)).toBe(0);
      expect(r.exit, JSON.stringify(seen)).not.toBe(0);
    });
  }

  it("MPW-4 --dry-run, testnet-10 workspace, MAINNET node: refused by the node's identity (NODE_NETWORK_MISMATCH) before any UTXO is read; no plan", async () => {
    const F = await startFake("mainnet");
    fakes.push(F);
    const ws = workspace("dry-main", F.url);
    const r = await run("MPW-4", [cliDist, "kaspa", "wallet", "send", "sender", "recipient", "--amount", "1", "--rpc-url", F.url, "--dry-run"], ws, "");
    const seen = { exit: r.exit, methods: F.methods, tail: r.out.slice(-800) };
    expect(r.out, JSON.stringify(seen)).toMatch(/NODE_NETWORK_MISMATCH/);
    expect(F.methods, JSON.stringify(seen)).not.toContain("getUtxosByAddresses");
    expect(r.out, JSON.stringify(seen)).not.toMatch(/Transaction Plan/);
  });

  it("MPW-5 control: --dry-run, testnet-10 workspace and node: the plan is shown, nothing signed or sent", async () => {
    const F = await startFake("testnet-10");
    fakes.push(F);
    const ws = workspace("dry-tn", F.url);
    const r = await run("MPW-5", [cliDist, "kaspa", "wallet", "send", "sender", "recipient", "--amount", "1", "--rpc-url", F.url, "--dry-run"], ws, "");
    const seen = { exit: r.exit, methods: F.methods, tail: r.out.slice(-800) };
    expect(r.out, JSON.stringify(seen)).toMatch(/Transaction Plan/);
    expect(F.submits).toBe(0);
    expect(r.exit, JSON.stringify(seen)).toBe(0);
  });
});