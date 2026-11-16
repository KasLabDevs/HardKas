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
// TX-SEND-URL-1 (2026-11-15), through the built CLI. The `tx send` shortcut (--from/--to/--amount --url <node>) planned
// on the --url node but its sign step asked the workspace's endpoint about the inputs (COVENANT-UTXO-PAYMENT-FILTER-1B),
// so with a node elsewhere it refused to sign ("the node could not be asked"). Here the workspace's endpoint is a dead
// loopback port and --url is a loopback fake node: the sign step must ask the fake and sign. The fake does not
// implement submitTransaction, so nothing is broadcast; the test reads the flow's step statuses. Throwaway key in an
// environment variable; every child under the hermetic preload.
// -----------------------------------------------------------------------------

const DAA = 50_000_000;
const KAS = 100_000_000;
const hashOf = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const PAYER_KEY = hashOf("tx-send-url-1 payer");
const KEY_ENV = "HK_TSU1_PAYER_KEY";
const UTXO_TXID = hashOf("tx-send-url-1 ordinary utxo");
let kaspa: any;
let payer = "";
let payee = "";
const spkHex = (address: string) => {
  const spk = kaspa.payToAddressScript(address);
  return spk.version.toString(16).padStart(4, "0") + (typeof spk.script === "string" ? spk.script : Buffer.from(spk.script).toString("hex"));
};

type Fake = { url: string; asked: string[]; close(): Promise<void> };
async function startFake(): Promise<Fake> {
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise<void>((r) => server.on("listening", () => r()));
  const sink = hashOf("sink");
  const zero = "0".repeat(64);
  const asked: string[] = [];
  server.on("connection", (socket) => {
    socket.on("message", (data) => {
      const text = String(data);
      const id = /"id"\s*:\s*(\d+)/.exec(text)?.[1];
      const method = /"method"\s*:\s*"([^"]+)"/.exec(text)?.[1] ?? "?";
      let params: any;
      try { params = JSON.parse(text.replace(/"id"\s*:\s*\d+/, '"id":0')).params; } catch { params = undefined; }
      if (!id) return;
      asked.push(method);
      const ok = (result: unknown) => socket.send(`{"id":${id},"method":"${method}","params":${JSON.stringify(result)}}`);
      const err = (message: string) => socket.send(`{"id":${id},"error":{"code":0,"message":${JSON.stringify(message)},"data":null}}`);
      switch (method) {
        case "getServerInfo":
          return ok({ rpcApiVersion: 1, rpcApiRevision: 0, serverVersion: "2.1.0", networkId: "testnet-10", hasUtxoIndex: true, isSynced: true, virtualDaaScore: DAA });
        case "getInfo":
          return ok({ p2pId: "tsu1", mempoolSize: 0, serverVersion: "2.1.0", isUtxoIndexed: true, isSynced: true, hasNotifyCommand: true, hasMessageId: true });
        case "getBlockDagInfo":
          return ok({ network: "testnet-10", blockCount: 10, headerCount: 10, tipHashes: [sink], difficulty: 1, pastMedianTime: Date.now(), virtualParentHashes: [sink], pruningPointHash: hashOf("pp"), virtualDaaScore: DAA, sink });
        case "getSinkBlueScore":
          return ok({ blueScore: DAA });
        case "getFeeEstimate":
          return ok({ estimate: { priorityBucket: { feerate: 1, estimatedSeconds: 1 }, normalBuckets: [], lowBuckets: [] } });
        case "getBlock":
          return ok({ block: { header: { hash: sink, version: 1, parentsByLevel: [], hashMerkleRoot: zero, acceptedIdMerkleRoot: zero, utxoCommitment: zero, timestamp: Date.now(), bits: 1, nonce: 0, daaScore: DAA, blueWork: "1", blueScore: DAA, pruningPoint: zero }, transactions: [], verboseData: { hash: sink, difficulty: 1, selectedParentHash: zero, transactionIds: [], isHeaderOnly: false, blueScore: DAA, childrenHashes: [], mergeSetBluesHashes: [], mergeSetRedsHashes: [], isChainBlock: true } } });
        case "getUtxosByAddresses":
          return ok({
            entries: (params?.addresses ?? []).flatMap((address: string) =>
              address === payer
                ? [{ address, outpoint: { transactionId: UTXO_TXID, index: 0 }, utxoEntry: { amount: 50 * KAS, scriptPublicKey: spkHex(address), blockDaaScore: DAA - 100_000, isCoinbase: false } }]
                : []
            )
          });
        case "getMempoolEntriesByAddresses":
          return ok({ entries: (params?.addresses ?? []).map((address: string) => ({ address, sending: [], receiving: [] })) });
        case "getBalancesByAddresses":
          return ok({ entries: (params?.addresses ?? []).map((address: string) => ({ address, balance: address === payer ? 50 * KAS : 0 })) });
        default:
          return err(`fake does not implement ${method}`);
      }
    });
  });
  const url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { url, asked, close: () => new Promise<void>((r) => { for (const c of server.clients) c.terminate(); server.close(() => r()); }) };
}

const made: string[] = [];
let fake: Fake;
const logs = fs.mkdtempSync(path.join(os.tmpdir(), "hk-tsu1-netlogs-"));
made.push(logs);

// Asynchronous on purpose: the fake lives in this process, a synchronous spawn would freeze it.
async function run(name: string, args: string[], cwd: string) {
  const log = path.join(logs, `${name}.net.log`);
  const r = await new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, [cliDist, ...args], { cwd, env: { ...hermeticChildEnv(log), [KEY_ENV]: PAYER_KEY } });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill(), 170_000);
    child.stdout.on("data", (d) => (stdout += String(d)));
    child.stderr.on("data", (d) => (stderr += String(d)));
    child.on("close", (status) => { clearTimeout(timer); resolve({ status, stdout, stderr }); });
    child.stdin.end();
  });
  const dialled = fs.existsSync(log) ? fs.readFileSync(log, "utf8").split(/\r?\n/).filter(Boolean) : [];
  return { ...r, dialled, brief: `exit ${r.status}\n${r.stdout.slice(0, 2500)}\n${r.stderr.slice(-1500)}` };
}

/** A workspace whose testnet-10 endpoint is a dead loopback port: only --url reaches a node. */
function workspace(): string {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-tsu1-cli-"));
  made.push(ws);
  fs.mkdirSync(path.join(ws, ".hardkas"));
  const cfg = {
    defaultNetwork: "testnet-10",
    execution: { default: "tn", targets: { tn: { mode: "rpc", domain: "kaspa-l1", network: "testnet-10" } } },
    network: { allowPublic: true },
    experimental: true,
    networks: { "testnet-10": { kind: "kaspa-rpc", network: "testnet-10", rpcUrl: "ws://127.0.0.1:1" } },
    accounts: {
      payer: { kind: "kaspa", network: "testnet-10", address: payer, privateKeyEnv: KEY_ENV },
      payee: { kind: "kaspa", network: "testnet-10", address: payee }
    }
  };
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), `export default ${JSON.stringify(cfg, null, 2)};\n`);
  return ws;
}
const nonLoopback = (dialled: string[]) => dialled.filter((l) => /\t(REFUSED_CONNECT|REFUSED_DNS)\t/.test(l));

beforeAll(async () => {
  assertHermeticPreloadActive();
  const coreMod: any = await import("@hardkas/core");
  kaspa = coreMod.loadManagedKaspaWasmSync();
  payer = new kaspa.PrivateKey(PAYER_KEY).toPublicKey().toAddress("testnet-10").toString();
  payee = new kaspa.PrivateKey(hashOf("tx-send-url-1 payee")).toPublicKey().toAddress("testnet-10").toString();
  fake = await startFake();
});
afterAll(async () => {
  await fake?.close();
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

describe("TX-SEND-URL-1 · the tx send shortcut signs against the --url node", () => {
  it("TSU-1 the workspace endpoint is dead and --url is the node: the sign step asks the --url node and signs", async () => {
    const ws = workspace();
    const r = await run(
      "tsu1",
      ["tx", "send", "--from", "payer", "--to", "payee", "--amount", "1", "--network", "testnet-10", "--url", fake.url, "--yes", "--json"],
      ws
    );
    const out = r.stdout + r.stderr;
    // the old failure: the covenant-input check dialled the workspace's endpoint instead of --url
    expect(out, r.brief).not.toMatch(/could not be asked what this plan's inputs/);
    // the flow got past signing: its envelope carries the signed artifact (the fake has no submitTransaction, so the
    // send itself does not succeed; a refused sign step reports steps.sign = "error" and no signed artifact)
    // the command's one pretty-printed envelope: from a line "{" to the first line "}" (event lines may follow it)
    const block = /^\{[\s\S]*?^\}/m.exec(r.stdout)?.[0];
    expect(block, r.brief).toBeDefined();
    const envelope = JSON.parse(block!);
    expect(envelope.steps?.sign, r.brief).not.toBe("error");
    const signed = Object.values(envelope.data ?? {}).find((v: any) => /signedTx/i.test(String(v?.schema ?? ""))) as any;
    expect(signed, `data keys: ${Object.keys(envelope.data ?? {}).join(",")}\n${r.brief}`).toBeDefined();
    expect(String(signed.txId ?? ""), r.brief).toMatch(/^[0-9a-f]{64}$/);
    // the fake was asked about the payer's UTXOs (plan + the sign step's covenant-input check)
    expect(fake.asked.filter((m) => m === "getUtxosByAddresses").length, r.brief).toBeGreaterThanOrEqual(2);
    expect(nonLoopback(r.dialled)).toEqual([]);
  });
});
