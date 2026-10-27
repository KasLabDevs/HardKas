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

vi.setConfig({ testTimeout: 240_000, hookTimeout: 240_000 });

// -----------------------------------------------------------------------------
// MULTINODE-READ-1 · `hardkas rpc compare`: several nodes read side by side through the official kaspa-wasm client
// (stand-in nodes on loopback, each with its own network, DAA score, UTXOs and accepting blocks). Identity and lag per
// node; UTXOs and one transaction compared; a difference the DAA scores do not account for exits 1
// (MULTINODE_DISAGREEMENT). A wrong-network node is never asked for data, and no node is ever sent anything.
// -----------------------------------------------------------------------------

const H = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const ADDR = "kaspasim:qr0lr4ml9fn3chekrqmjdkergxl93l4wrk3dankcgvjq776s9wn9jeadh9sjw";
const SPK = "0000" + "20" + "f8fa77" + "c5".repeat(29) + "ac";
type Spec = { label: string; network?: string; daa: number; utxos?: Array<{ txid: string; amount: number; daa: number }>; accepted?: Record<string, string> };
type Fake = { url: string; methods: string[]; close(): Promise<void> };

async function startFake(spec: Spec): Promise<Fake> {
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise<void>((r) => server.on("listening", () => r()));
  const methods: string[] = [];
  const network = spec.network ?? "simnet";
  const sink = H(`${spec.label} sink`);
  const pruning = H("pruning point");
  server.on("connection", (socket) => {
    socket.on("message", (data) => {
      const text = String(data);
      const id = /"id"\s*:\s*(\d+)/.exec(text)?.[1];
      const method = /"method"\s*:\s*"([^"]+)"/.exec(text)?.[1] ?? "?";
      let params: any;
      try {
        params = JSON.parse(text.replace(/"id"\s*:\s*\d+/, '"id":0')).params;
      } catch {
        params = undefined;
      }
      methods.push(method);
      if (!id) return;
      const ok = (result: unknown) => socket.send(`{"id":${id},"method":"${method}","params":${JSON.stringify(result)}}`);
      const err = (message: string) => socket.send(`{"id":${id},"error":{"code":1,"message":${JSON.stringify(message)}}}`);
      switch (method) {
        case "getServerInfo":
          return ok({ rpcApiVersion: 1, rpcApiRevision: 0, serverVersion: "2.1.0", networkId: network, hasUtxoIndex: true, isSynced: true, virtualDaaScore: spec.daa });
        case "getInfo":
          return ok({ p2pId: `peer-${spec.label}`, mempoolSize: 0, serverVersion: "2.1.0", isUtxoIndexed: true, isSynced: true, hasNotifyCommand: true, hasMessageId: true });
        case "getBlockDagInfo":
          return ok({ network, blockCount: 10, headerCount: 10, tipHashes: [sink], difficulty: 1, pastMedianTime: Date.now(), virtualParentHashes: [sink], pruningPointHash: pruning, virtualDaaScore: spec.daa, sink });
        case "getSinkBlueScore":
          return ok({ blueScore: spec.daa - 5 });
        case "getUtxosByAddresses":
          return ok({
            entries: (spec.utxos ?? []).map((u) => ({ address: ADDR, outpoint: { transactionId: u.txid, index: 0 }, utxoEntry: { amount: u.amount, scriptPublicKey: SPK, blockDaaScore: u.daa, isCoinbase: false } }))
          });
        case "getMempoolEntry":
          return err(`Transaction ${params?.transactionId} not found`);
        case "getVirtualChainFromBlock": {
          const hits = Object.entries(spec.accepted ?? {});
          if (hits.length === 0 || params?.startHash !== pruning) return ok({ removedChainBlockHashes: [], addedChainBlockHashes: [], acceptedTransactionIds: [] });
          return ok({
            removedChainBlockHashes: [],
            addedChainBlockHashes: hits.map(([, b]) => b),
            acceptedTransactionIds: hits.map(([tx, b]) => ({ acceptingBlockHash: b, acceptedTransactionIds: [tx] }))
          });
        }
        case "getBlock": {
          const hash = params?.hash;
          if (!Object.values(spec.accepted ?? {}).includes(hash)) return err(`cannot find header ${hash}`);
          // an accepting block below the sink (sink blue score: DAA - 5)
          const zero = "0".repeat(64);
          const daaScore = spec.daa - 3;
          const blueScore = spec.daa - 8;
          return ok({
            block: {
              header: { hash, version: 1, parentsByLevel: [[sink]], hashMerkleRoot: zero, acceptedIdMerkleRoot: zero, utxoCommitment: zero, timestamp: 1792088193138, bits: 486722099, nonce: 0, daaScore, blueWork: (daaScore * 1000).toString(16), blueScore, pruningPoint: pruning },
              transactions: [],
              verboseData: { hash, difficulty: 1, selectedParentHash: sink, transactionIds: [], isHeaderOnly: false, blueScore, childrenHashes: [], mergeSetBluesHashes: [], mergeSetRedsHashes: [], isChainBlock: true }
            }
          });
        }
        default:
          return err(`fake ${spec.label} does not implement ${method}`);
      }
    });
  });
  const { port } = server.address() as AddressInfo;
  return {
    url: `ws://127.0.0.1:${port}`,
    methods,
    close: () =>
      new Promise<void>((r) => {
        for (const c of server.clients) c.terminate();
        server.close(() => r());
      })
  };
}

const made: string[] = [];
const fakes: Fake[] = [];
const logs = fs.mkdtempSync(path.join(os.tmpdir(), "hk-mn1-cli-netlogs-"));
made.push(logs);
let ws: string;

async function run(name: string, args: string[]) {
  const log = path.join(logs, `${name}.net.log`);
  const r = await new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, [cliDist, ...args], { cwd: ws, env: hermeticChildEnv(log) });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill(), 200_000);
    child.stdout.on("data", (d) => (stdout += String(d)));
    child.stderr.on("data", (d) => (stderr += String(d)));
    child.on("close", (status) => {
      clearTimeout(timer);
      resolve({ status, stdout, stderr });
    });
  });
  let doc: any;
  for (const chunk of r.stdout.split(/\r?\n(?=[{\[])/)) {
    try {
      const d = JSON.parse(chunk.trim());
      if (d && typeof d === "object" && !Array.isArray(d)) doc = doc ?? d;
    } catch {
      /* not a document */
    }
  }
  return { ...r, doc, brief: `exit ${r.status}\n${r.stdout.slice(0, 3000)}\n${r.stderr.slice(0, 1200)}` };
}
const fake = async (spec: Spec) => {
  const f = await startFake(spec);
  fakes.push(f);
  return f;
};

beforeAll(() => {
  assertHermeticPreloadActive();
  ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-mn1-cli-"));
  made.push(ws);
});
afterAll(async () => {
  for (const f of fakes) await f.close();
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

describe("MULTINODE-READ-1 · hardkas rpc compare", () => {
  it("CR-1 two synced simnet nodes that agree: identity, UTXOs and a transaction accepted by both at one block; exit 0, read-only", async () => {
    const tx = H("cr1 tx");
    const block = H("cr1 accepting");
    const utxos = [{ txid: H("cr1 u1"), amount: 500, daa: 900 }];
    const a = await fake({ label: "a", daa: 1000, utxos, accepted: { [tx]: block } });
    const b = await fake({ label: "b", daa: 998, utxos, accepted: { [tx]: block } });
    const r = await run("cr-1", ["rpc", "compare", "--endpoints", a.url, b.url, "--network", "simnet", "--address", ADDR, "--tx", tx, "--json"]);
    expect(r.status, r.brief).toBe(0);
    expect(r.doc).toMatchObject({ ok: true, scope: "multi-observer", network: "simnet", reference: { label: "node1", virtualDaaScore: "1000" } });
    expect(r.doc.nodes.map((n: any) => [n.label, n.standing, n.lagDaa])).toEqual([["node1", "usable", "0"], ["node2", "usable", "2"]]);
    expect(r.doc.utxos.agreed).toEqual([`${H("cr1 u1")}:0`]);
    expect(r.doc.tx.acceptedBy).toEqual(["node1", "node2"]);
    expect(r.doc.tx.disagreements).toEqual([]);
    expect([...a.methods, ...b.methods]).not.toContain("submitTransaction");
    const human = await run("cr-1h", ["rpc", "compare", "--endpoints", a.url, b.url, "--network", "simnet", "--address", ADDR]);
    expect(human.status, human.brief).toBe(0);
    expect(human.stdout).toMatch(/1 agreed, 0 lag, 0 disagreement/);
    expect(human.stdout).toMatch(/not consensus validation/);
  });

  it("CR-2 a node of another network is reported and never asked for data; a node far behind is lagging and its missing output is lag, not a disagreement", async () => {
    const fresh = [{ txid: H("cr2 new"), amount: 7, daa: 990 }];
    const a = await fake({ label: "a", daa: 1000, utxos: fresh });
    const behind = await fake({ label: "behind", daa: 400, utxos: [] });
    const other = await fake({ label: "other", network: "testnet-10", daa: 5000, utxos: fresh });
    const r = await run("cr-2", ["rpc", "compare", "--endpoints", a.url, behind.url, other.url, "--network", "simnet", "--address", ADDR, "--json"]);
    expect(r.status, r.brief).toBe(0);
    expect(r.doc.nodes.map((n: any) => n.standing)).toEqual(["usable", "lagging", "wrong-network"]);
    expect(r.doc.utxos.lag.map((l: any) => l.subject)).toEqual([`${H("cr2 new")}:0`]);
    expect(r.doc.utxos.disagreements).toEqual([]);
    expect(other.methods).not.toContain("getUtxosByAddresses");
  });

  it("CR-3 nodes at the same height that disagree on an output: the report names it and the command exits 1 (MULTINODE_DISAGREEMENT)", async () => {
    const a = await fake({ label: "a", daa: 1000, utxos: [{ txid: H("cr3 u"), amount: 5, daa: 900 }] });
    const b = await fake({ label: "b", daa: 1000, utxos: [] });
    const r = await run("cr-3", ["rpc", "compare", "--endpoints", a.url, b.url, "--network", "simnet", "--address", ADDR, "--json"]);
    expect(r.status, r.brief).toBe(1);
    expect(r.doc).toMatchObject({ ok: false, code: "MULTINODE_DISAGREEMENT" });
    expect(r.doc.utxos.disagreements.map((d: any) => d.code)).toEqual(["UTXO_PRESENCE_DISAGREES"]);
  });

  it("CR-4 fewer than two endpoints, or one endpoint twice: refused before any node is contacted; one node under two spellings is a duplicate, never compared with itself", async () => {
    const a = await fake({ label: "a", daa: 1000, utxos: [{ txid: H("cr4 u"), amount: 5, daa: 900 }] });
    const one = await run("cr-4a", ["rpc", "compare", "--endpoints", a.url, "--network", "simnet", "--json"]);
    expect(one.status, one.brief).not.toBe(0);
    expect(`${one.stdout}${one.stderr}`).toMatch(/MULTINODE_INSUFFICIENT_NODES/);
    const twice = await run("cr-4b", ["rpc", "compare", "--endpoints", a.url, a.url, "--network", "simnet", "--json"]);
    expect(twice.status, twice.brief).not.toBe(0);
    expect(`${twice.stdout}${twice.stderr}`).toMatch(/MULTINODE_ENDPOINTS_NOT_UNIQUE/);
    expect(a.methods).toEqual([]);
    const spelled = await run("cr-4c", ["rpc", "compare", "--endpoints", a.url, a.url.replace("127.0.0.1", "localhost"), "--network", "simnet", "--address", ADDR, "--json"]);
    expect(spelled.status, spelled.brief).toBe(1);
    expect(spelled.doc.nodes.map((n: any) => n.standing)).toEqual(["usable", "duplicate"]);
    expect(spelled.doc.code).toBe("MULTINODE_INSUFFICIENT_NODES");
  });
});
