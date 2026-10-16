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
import { createTxObservationArtifact, deriveObserverId, RPC_OBSERVER_DESCRIPTION } from "@hardkas/artifacts";
import { systemRuntimeContext } from "@hardkas/core";

vi.setConfig({ testTimeout: 300_000, hookTimeout: 300_000 });

// -----------------------------------------------------------------------------
// HARDKAS-MEMPOOL-CHAIN-PRECEDENCE-RESEARCH-1 (2026-10-16) — BEFORE regression, loopback fakes only.
// rusty-kaspa issue #1146 (open): a synced TN10 node keeps transactions that its virtual chain already accepted in its
// mempool (no mempool revalidation after IBD; PR #1147 open). Question: can HardKAS stay at MEMPOOL_ACCEPTED (or lose
// the transaction) while the node's own virtual chain accepts it?
// Criterion (review 2026-10-16): a positive mempool observation must not prevent looking for the stronger chain
// evidence; the chain is evaluated against the node's CURRENT view, and the REORGED invariant (2026-10-02) is kept.
// The fake: testnet-10, a static selected chain (blue +1 per chain block), V1 getVirtualChainFromBlock in batches of
// 1 840 with accepted tx ids, a mempool the test controls, and a fork operation for reorg/churn cases.
// Traces in $HARDKAS_MCP_TRACE_DIR.
// -----------------------------------------------------------------------------

const BATCH = 1840;
const BLUE0 = 584_900_000;
const DAA0 = 596_400_000;
const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

type Fake = {
  url: string;
  port: number;
  methods: string[];
  /** Current selected chain: index → hash. */
  chain: string[];
  /** txId → accepting chain index (on the current chain). */
  accepts: Map<string, number>;
  /** txId → mempool entry the node reports (stale or genuine: the node cannot tell, neither can we). */
  mempool: Map<string, { isOrphan: boolean }>;
  /** When set and it returns a message, getVirtualChainFromBlock from that chain index fails with it (controlled RPC failure). */
  failVcFrom?: (index: number) => string | undefined;
  /** When it returns true for a start index, the node sends HALF of that answer's frame and drops the connection. */
  truncateVcFrom?: (index: number) => boolean;
  /** When it returns k for a start index, that answer lists every added block but acceptance data for only the first k
   *  (an answer kaspad 2.1.0 never gives: it truncates `added` to the accepted ids, rpc/service/src/service.rs). */
  acceptedPrefixFrom?: (index: number) => number | undefined;
  /** When it returns true for a start index, that answer's first two acceptance entries swap their acceptingBlockHash
   *  (complete but misaligned: rusty-kaspa zips `added` with the acceptance data in order). */
  scrambleFrom?: (index: number) => boolean;
  /** Start hash of every getVirtualChainFromBlock call, in order. */
  vcStarts: string[];
  /** Replaces the chain from index `at` with a new branch (old hashes become removed chain blocks). */
  fork(at: number, label: string, acceptsOnNewBranch: Array<[string, number]>): void;
  close(): Promise<void>;
};

async function startFake(label: string, tip: number): Promise<Fake> {
  const chain: string[] = [];
  for (let i = 0; i <= tip; i++) chain.push(sha(`mcp-${label}-chain-${i}`));
  const where = new Map<string, number>(chain.map((h, i) => [h, i]));
  /** hash of a block that left the selected chain → its old index (its header is still served). */
  const removedAt = new Map<string, number>();
  /** hash of a removed block → the index where its branch left the selected chain (the common ancestor is at − 1). */
  const forkOf = new Map<string, number>();
  const zero = "0".repeat(64);
  const fake: Fake = {
    url: "",
    port: 0,
    methods: [],
    vcStarts: [],
    chain,
    accepts: new Map(),
    mempool: new Map(),
    fork(at, branch, acceptsOnNewBranch) {
      for (let i = at; i < fake.chain.length; i++) {
        removedAt.set(fake.chain[i]!, i);
        forkOf.set(fake.chain[i]!, at);
        where.delete(fake.chain[i]!);
      }
      for (const [tx, i] of [...fake.accepts.entries()]) if (i >= at) fake.accepts.delete(tx);
      for (let i = at; i < fake.chain.length; i++) {
        fake.chain[i] = sha(`mcp-${label}-${branch}-chain-${i}`);
        where.set(fake.chain[i]!, i);
      }
      for (const [tx, i] of acceptsOnNewBranch) fake.accepts.set(tx, i);
    },
    close: async () => {}
  };
  const tipOf = () => fake.chain.length - 1;
  const blue = (i: number) => BLUE0 + i;
  const daa = (i: number) => DAA0 + i;
  const acceptedAt = (i: number) => [...fake.accepts.entries()].filter(([, j]) => j === i).map(([tx]) => tx);
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise<void>((r, j) => {
    server.on("listening", () => r());
    server.on("error", j);
  });
  server.on("connection", (socket) => {
    socket.on("message", (data) => {
      const text = String(data);
      const id = /"id"\s*:\s*(\d+)/.exec(text)?.[1]; // u64: echoed raw
      const method = /"method"\s*:\s*"([^"]+)"/.exec(text)?.[1] ?? "?";
      let params: any;
      try {
        params = JSON.parse(text.replace(/"id"\s*:\s*\d+/, '"id":0')).params;
      } catch {
        params = undefined;
      }
      fake.methods.push(method);
      if (!id) return;
      const ok = (result: unknown) => socket.send(`{"id":${id},"method":"${method}","params":${JSON.stringify(result)}}`);
      const err = (message: string) => socket.send(`{"id":${id},"error":{"code":0,"message":${JSON.stringify(message)},"data":null}}`);
      const tip = tipOf();
      switch (method) {
        case "getServerInfo":
          return ok({ rpcApiVersion: 1, rpcApiRevision: 0, serverVersion: "2.1.0", networkId: "testnet-10", hasUtxoIndex: true, isSynced: true, virtualDaaScore: daa(tip) + 1 });
        case "getInfo":
          return ok({ p2pId: label, mempoolSize: fake.mempool.size, serverVersion: "2.1.0", isUtxoIndexed: true, isSynced: true, hasNotifyCommand: true, hasMessageId: true });
        case "getBlockDagInfo":
          return ok({ network: "testnet-10", blockCount: tip + 1, headerCount: tip + 1, tipHashes: [fake.chain[tip]], difficulty: 1, pastMedianTime: Date.now(), virtualParentHashes: [fake.chain[tip]], pruningPointHash: fake.chain[0], virtualDaaScore: daa(tip) + 1, sink: fake.chain[tip] });
        case "getSinkBlueScore":
          return ok({ blueScore: blue(tip) });
        case "getMempoolEntry": {
          const e = fake.mempool.get(params?.transactionId);
          // exactly the kaspad 2.1.0 JSON wRPC shape, captured read-only on TN10 (the entry flag is snake_case `is_orphan`)
          if (e) return ok({ mempoolEntry: { fee: 2036, is_orphan: e.isOrphan, transaction: { gas: 0, inputs: [], lockTime: 0, mass: 0, outputs: [], payload: "", storageMass: 0, subnetworkId: "0".repeat(40), verboseData: { blockHash: "0".repeat(64), blockTime: 0, computeMass: 2036, hash: sha(`h-${params.transactionId}`), transactionId: params.transactionId }, version: 0 } } });
          return err(`Transaction ${params?.transactionId} not found`);
        }
        case "getBlock": {
          const onChain = where.get(params?.hash);
          const i = onChain ?? removedAt.get(params?.hash);
          if (i === undefined) return err(`cannot find header ${params?.hash}`);
          const hash = params.hash as string;
          return ok({
            block: {
              header: { hash, version: 1, parentsByLevel: i > 0 ? [[fake.chain[i - 1]]] : [], hashMerkleRoot: zero, acceptedIdMerkleRoot: zero, utxoCommitment: zero, timestamp: 1792088193138 + i * 100, bits: 486722099, nonce: 0, daaScore: daa(i), blueWork: (blue(i) * 1000).toString(16), blueScore: blue(i), pruningPoint: fake.chain[0] },
              transactions: [],
              verboseData: { hash, difficulty: 1, selectedParentHash: i > 0 ? fake.chain[i - 1] : zero, transactionIds: [], isHeaderOnly: false, blueScore: blue(i), childrenHashes: [], mergeSetBluesHashes: [], mergeSetRedsHashes: [], isChainBlock: onChain !== undefined }
            }
          });
        }
        case "getVirtualChainFromBlock": {
          fake.vcStarts.push(params?.startHash);
          let from = where.get(params?.startHash);
          const removed: string[] = [];
          if (from === undefined) {
            const r = removedAt.get(params?.startHash);
            if (r === undefined) return err(`cannot find header ${params?.startHash}`);
            // From a block that left the selected chain the node answers from the common ancestor: the removed chain
            // blocks (start included) and the new chain blocks after the ancestor.
            const at = forkOf.get(params.startHash)!;
            for (const [h, i] of removedAt) if (forkOf.get(h) === at && i <= r) removed.push(h);
            from = at - 1;
          }
          const failure = fake.failVcFrom?.(from);
          if (failure) return err(failure);
          const added: string[] = [];
          const accepted: unknown[] = [];
          for (let j = from + 1; j <= Math.min(from + BATCH, tip); j++) {
            added.push(fake.chain[j]!);
            accepted.push({ acceptingBlockHash: fake.chain[j], acceptedTransactionIds: [sha(`cb-${label}-${j}`), ...acceptedAt(j)] });
          }
          if (fake.scrambleFrom?.(from) && accepted.length >= 2) {
            const a = accepted[0] as any;
            const b = accepted[1] as any;
            accepted[0] = { ...a, acceptingBlockHash: b.acceptingBlockHash };
            accepted[1] = { ...b, acceptingBlockHash: a.acceptingBlockHash };
          }
          const prefix = fake.acceptedPrefixFrom?.(from);
          const answer = { removedChainBlockHashes: removed, addedChainBlockHashes: added, acceptedTransactionIds: params?.includeAcceptedTransactionIds ? (prefix === undefined ? accepted : accepted.slice(0, prefix)) : [] };
          if (fake.truncateVcFrom?.(from)) {
            const frame = `{"id":${id},"method":"${method}","params":${JSON.stringify(answer)}}`;
            socket.send(frame.slice(0, Math.floor(frame.length / 2)));
            setTimeout(() => socket.terminate(), 50);
            return;
          }
          return ok(answer);
        }
        default:
          return err(`fake ${label} does not implement ${method}`);
      }
    });
  });
  fake.port = (server.address() as AddressInfo).port;
  fake.url = `ws://127.0.0.1:${fake.port}`;
  fake.close = () =>
    new Promise<void>((r) => {
      for (const c of server.clients) c.terminate();
      server.close(() => r());
    });
  return fake;
}

const traceDir = process.env.HARDKAS_MCP_TRACE_DIR;
function trace(name: string, data: unknown) {
  if (!traceDir) return;
  fs.mkdirSync(traceDir, { recursive: true });
  fs.writeFileSync(path.join(traceDir, `${name}.json`), JSON.stringify(data, null, 2));
}
const made: string[] = [];
const fakes: Fake[] = [];
const logs = fs.mkdtempSync(path.join(os.tmpdir(), "hk-mcp-netlogs-"));
made.push(logs);

async function run(name: string, argv: string[], cwd: string) {
  const log = path.join(logs, `${name}.net.log`);
  const env = hermeticChildEnv(log, {});
  const r = await new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, argv, { cwd, env });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill(), 280_000);
    child.stdout.on("data", (d) => (stdout += String(d)));
    child.stderr.on("data", (d) => (stderr += String(d)));
    child.on("close", (status) => {
      clearTimeout(timer);
      resolve({ status, stdout, stderr });
    });
  });
  const dialled = fs.existsSync(log)
    ? [...new Set(fs.readFileSync(log, "utf8").split(/\r?\n/).filter(Boolean).map((l) => l.split("\t")).map(([, k, t]) => `${k} ${t}`))]
    : [];
  let json: any;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    json = undefined;
  }
  return { name, exit: r.status, stdout: r.stdout, stderr: r.stderr, json, dialled, brief: `exit ${r.status}\n${r.stdout.slice(-2500)}\n${r.stderr.slice(0, 2000)}` };
}

const cfg = (url: string) =>
  `export default ${JSON.stringify(
    {
      execution: { default: "tn", targets: { tn: { mode: "rpc", domain: "kaspa-l1", network: "testnet-10" } } },
      network: { allowPublic: true },
      experimental: true,
      networks: { "testnet-10": { kind: "kaspa-rpc", network: "testnet-10", rpcUrl: url } }
    },
    null,
    2
  )};\n`;
function workspace(label: string, url: string): string {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), `hk-mcp-${label}-`));
  made.push(ws);
  fs.mkdirSync(path.join(ws, ".hardkas"));
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), cfg(url));
  return ws;
}
const observationsOf = (ws: string): any[] => {
  const dir = path.join(ws, ".hardkas", "artifacts", "observations");
  return fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")))
    : [];
};
const findingsOf = (ws: string) =>
  observationsOf(ws)
    .sort((a, b) => (a.observedAt < b.observedAt ? -1 : 1))
    .map((o) => o.finding.type);
const status = (name: string, ws: string, args: string[]) => run(name, [cliDist, "tx", "status", ...args, "--json"], ws);
const onlyLoopback = (dialled: string[], f: Fake) => dialled.every((d) => d === `LOOPBACK_CONNECT 127.0.0.1:${f.port}`);

beforeAll(() => {
  assertHermeticPreloadActive();
});
afterAll(async () => {
  for (const f of fakes) await f.close();
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});
async function fakeFor(label: string, tip = 60_000) {
  const f = await startFake(label, tip);
  fakes.push(f);
  return f;
}

// tip 60 000; a deep tx accepted at 50 000 (10 000 blue), a shallow one at 59 990 (10 blue).
const TIP = 60_000;
const DEEP = 50_000;
const SHALLOW = 59_990;

describe("MCP-1 · a mempool entry must not hide the node's own chain acceptance (rusty-kaspa #1146)", () => {
  it("MCP-1A stale mempool entry + chain acceptance 10 000 blue deep, --since before it → expected CONFIRMED by that block", async () => {
    const F = await fakeFor("a");
    const TX = sha("mcp-1a");
    F.accepts.set(TX, DEEP);
    F.mempool.set(TX, { isOrphan: false });
    const ws = workspace("1a", F.url);
    const r = await status("MCP-1A", ws, [TX, "--since", F.chain[DEEP - 100]!]);
    trace("MCP-1A", { exit: r.exit, json: r.json, findings: findingsOf(ws), methods: F.methods, out: r.brief });
    expect(onlyLoopback(r.dialled, F), r.brief).toBe(true);
    expect(r.json?.state, r.brief).toBe("CONFIRMED");
    expect(r.json?.derived?.acceptingBlockHash).toBe(F.chain[DEEP]);
    expect(r.json?.confirmations).toMatchObject({ blue: "10000", unit: "blue-score" });
  });

  it("MCP-1B stale ORPHAN entry + chain acceptance → expected CONFIRMED (the orphan pool does not outrank the chain)", async () => {
    const F = await fakeFor("b");
    const TX = sha("mcp-1b");
    F.accepts.set(TX, DEEP);
    F.mempool.set(TX, { isOrphan: true });
    const ws = workspace("1b", F.url);
    const r = await status("MCP-1B", ws, [TX, "--since", F.chain[DEEP - 100]!]);
    trace("MCP-1B", { exit: r.exit, json: r.json, findings: findingsOf(ws), out: r.brief });
    expect(r.json?.state, r.brief).toBe("CONFIRMED");
  });

  it("MCP-1C stale mempool entry + acceptance only 10 blue deep → expected ACCEPTED (not CONFIRMED: blue < policy 100)", async () => {
    const F = await fakeFor("c");
    const TX = sha("mcp-1c");
    F.accepts.set(TX, SHALLOW);
    F.mempool.set(TX, { isOrphan: false });
    const ws = workspace("1c", F.url);
    const r = await status("MCP-1C", ws, [TX, "--since", F.chain[SHALLOW - 100]!]);
    trace("MCP-1C", { exit: r.exit, json: r.json, findings: findingsOf(ws), out: r.brief });
    expect(r.json?.state, r.brief).toBe("ACCEPTED");
    expect(r.json?.confirmations).toMatchObject({ blue: "10", unit: "blue-score" });
  });
});

describe("MCP-2 · the cursor must not overtake an acceptance it never scanned", () => {
  it("MCP-2A looks while the stale entry persists, then the node revalidates its mempool (as PR #1147 would): expected CONFIRMED, never lost", async () => {
    const F = await fakeFor("2a");
    const TX = sha("mcp-2a");
    F.accepts.set(TX, DEEP);
    F.mempool.set(TX, { isOrphan: false });
    const ws = workspace("2a", F.url);
    const look1 = await status("MCP-2A-look1", ws, [TX, "--since", F.chain[DEEP - 100]!]);
    const look2 = await status("MCP-2A-look2", ws, [TX]);
    F.mempool.delete(TX);
    const look3 = await status("MCP-2A-look3", ws, [TX]);
    const look4 = await status("MCP-2A-look4", ws, [TX]);
    const states = [look1, look2, look3, look4].map((r) => r.json?.state);
    const cursors = [look1, look2, look3, look4].map((r) => r.json?.look ?? null);
    trace("MCP-2A", { states, cursors, findings: findingsOf(ws), out: [look1, look2, look3, look4].map((r) => r.brief) });
    expect(states[2], look3.brief).toBe("CONFIRMED");
    expect(states[3], look4.brief).toBe("CONFIRMED");
  });

  it("MCP-2B a genuine first look in the mempool, then the chain accepts it AFTER that look (control: must stay reachable)", async () => {
    const F = await fakeFor("2b");
    const TX = sha("mcp-2b");
    F.mempool.set(TX, { isOrphan: false });
    const ws = workspace("2b", F.url);
    const look1 = await status("MCP-2B-look1", ws, [TX, "--since", F.chain[TIP - 50]!]);
    // The chain grows by forking at the tip+1 position is not needed: extend the chain and accept the tx on it.
    for (let i = 1; i <= 200; i++) F.chain.push(sha(`mcp-2b-ext-${i}`));
    F.fork(TIP + 1, "ext", [[TX, TIP + 20]]);
    F.mempool.delete(TX);
    const look2 = await status("MCP-2B-look2", ws, [TX]);
    trace("MCP-2B", { states: [look1.json?.state, look2.json?.state], findings: findingsOf(ws), out: [look1.brief, look2.brief] });
    expect(look1.json?.state, look1.brief).toBe("MEMPOOL_ACCEPTED");
    expect(look2.json?.state, look2.brief).toBe("CONFIRMED");
  });
});

describe("MCP-3 · controls that the change must keep", () => {
  it("MCP-3A genuine mempool entry, no chain acceptance in the scanned window → MEMPOOL_ACCEPTED", async () => {
    const F = await fakeFor("3a");
    const TX = sha("mcp-3a");
    F.mempool.set(TX, { isOrphan: false });
    const ws = workspace("3a", F.url);
    const r = await status("MCP-3A", ws, [TX, "--since", F.chain[TIP - 100]!]);
    trace("MCP-3A", { json: r.json, findings: findingsOf(ws), out: r.brief });
    expect(r.json?.state, r.brief).toBe("MEMPOOL_ACCEPTED");
  });

  it("MCP-3B no evidence anywhere (not in mempool, not in the scanned chain) → INSUFFICIENT_EVIDENCE, nothing invented", async () => {
    const F = await fakeFor("3b");
    const TX = sha("mcp-3b");
    const ws = workspace("3b", F.url);
    const r = await status("MCP-3B", ws, [TX, "--since", F.chain[TIP - 100]!]);
    trace("MCP-3B", { json: r.json, findings: findingsOf(ws), out: r.brief });
    expect(r.json?.state, r.brief).toBe("INSUFFICIENT_EVIDENCE");
    expect(r.json?.derived?.acceptingBlockHash).toBeUndefined();
  });

  it("MCP-3C true reorg: accepted, then its accepting block leaves the chain with no re-acceptance and the tx returns to the mempool → REORGED at the removal look", async () => {
    const F = await fakeFor("3c");
    const TX = sha("mcp-3c");
    F.accepts.set(TX, SHALLOW);
    const ws = workspace("3c", F.url);
    const look1 = await status("MCP-3C-look1", ws, [TX, "--since", F.chain[SHALLOW - 100]!]);
    F.fork(SHALLOW - 5, "reorg", []);
    F.mempool.set(TX, { isOrphan: false });
    const look2 = await status("MCP-3C-look2", ws, [TX]);
    const look3 = await status("MCP-3C-look3", ws, [TX]);
    trace("MCP-3C", { states: [look1, look2, look3].map((r) => r.json?.state), findings: findingsOf(ws), out: [look1, look2, look3].map((r) => r.brief) });
    expect(look1.json?.state, look1.brief).toBe("ACCEPTED");
    expect(look2.json?.state, look2.brief).toBe("REORGED");
    // After the removal the tx is genuinely back in this node's mempool: MEMPOOL_ACCEPTED is what the node shows.
    expect(look3.json?.state, look3.brief).toBe("MEMPOOL_ACCEPTED");
  });

  it("MCP-3D accepting-block churn under a stale mempool entry: the new block re-accepts it → ACCEPTED by the new block, never REORGED", async () => {
    const F = await fakeFor("3d");
    const TX = sha("mcp-3d");
    F.accepts.set(TX, SHALLOW);
    const ws = workspace("3d", F.url);
    const look1 = await status("MCP-3D-look1", ws, [TX, "--since", F.chain[SHALLOW - 100]!]);
    F.fork(SHALLOW - 5, "churn", [[TX, SHALLOW + 2]]);
    F.mempool.set(TX, { isOrphan: false });
    const look2 = await status("MCP-3D-look2", ws, [TX]);
    trace("MCP-3D", { states: [look1, look2].map((r) => r.json?.state), findings: findingsOf(ws), out: [look1, look2].map((r) => r.brief) });
    expect(look1.json?.state, look1.brief).toBe("ACCEPTED");
    expect(look2.json?.state, look2.brief).toBe("ACCEPTED");
    expect(look2.json?.derived?.acceptingBlockHash).toBe(F.chain[SHALLOW + 2]);
  });
});

describe("MCP-4 · an explicit cursor the node cannot serve, while the mempool holds the tx", () => {
  it("MCP-4A --since unknown + mempool entry → (current TCF-S2 contract) OBSERVE_SINCE_UNAVAILABLE, nothing recorded — DECISION D2", async () => {
    const F = await fakeFor("4a");
    const TX = sha("mcp-4a");
    F.mempool.set(TX, { isOrphan: false });
    const ws = workspace("4a", F.url);
    const r = await status("MCP-4A", ws, [TX, "--since", sha("not-a-block-the-node-holds")]);
    trace("MCP-4A", { json: r.json, findings: findingsOf(ws), out: r.brief });
    expect(r.json?.state, r.brief).toBe("INSUFFICIENT_EVIDENCE");
    expect(r.json?.look?.reason ?? "").toMatch(/OBSERVE_SINCE_UNAVAILABLE/);
    expect(observationsOf(ws)).toEqual([]);
  });
});

describe("MCP-5 · tx wait under the stale entry", () => {
  it("MCP-5A tx wait --until confirmed after a --since look: expected to end CONFIRMED, not TX_WAIT_TIMEOUT at MEMPOOL_ACCEPTED", async () => {
    const F = await fakeFor("5a");
    const TX = sha("mcp-5a");
    F.accepts.set(TX, DEEP);
    F.mempool.set(TX, { isOrphan: false });
    const ws = workspace("5a", F.url);
    await status("MCP-5A-seed", ws, [TX, "--since", F.chain[DEEP - 100]!]);
    const r = await run("MCP-5A", [cliDist, "tx", "wait", TX, "--until", "confirmed", "--timeout", "6", "--interval", "1", "--json"], ws);
    trace("MCP-5A", { exit: r.exit, json: r.json, findings: findingsOf(ws), out: r.brief });
    expect(`${r.stdout}\n${r.stderr}`, r.brief).not.toMatch(/TX_WAIT_TIMEOUT/);
    expect(r.exit, r.brief).toBe(0);
  });
});

// -----------------------------------------------------------------------------
// MEMPOOL-CHAIN-PRECEDENCE-FIX-1 · the cursor only advances over chain a look actually read.
// Each look reads at most 20 batches × 1 840 chain blocks (36 800).
// -----------------------------------------------------------------------------
describe("MCP-6 · partial scans, resumption and looks without a verifiable window", () => {
  const LONG_TIP = 100_000;
  const FAR = 60_000; // beyond one look's window from block 1 000

  it("MCP-6A partial scan under a stale entry: the look records the window it read (incomplete) and the next look resumes from its last block → CONFIRMED", async () => {
    const F = await fakeFor("6a", LONG_TIP);
    const TX = sha("mcp-6a");
    F.accepts.set(TX, FAR);
    F.mempool.set(TX, { isOrphan: false });
    const ws = workspace("6a", F.url);
    const look1 = await status("MCP-6A-look1", ws, [TX, "--since", F.chain[1_000]!]);
    const first = observationsOf(ws)[0];
    const look2 = await status("MCP-6A-look2", ws, [TX]);
    trace("MCP-6A", { states: [look1.json?.state, look2.json?.state], first: first?.finding, findings: findingsOf(ws), out: [look1.brief, look2.brief] });
    expect(look1.json?.state, look1.brief).toBe("MEMPOOL_ACCEPTED");
    expect(first?.finding, look1.brief).toMatchObject({ type: "mempool_entry", scannedFrom: F.chain[1_000], scannedTo: F.chain[1_000 + 20 * BATCH], scannedChainBlocks: 20 * BATCH, scanComplete: false });
    expect(look2.json?.state, look2.brief).toBe("CONFIRMED");
    expect(look2.json?.derived?.acceptingBlockHash).toBe(F.chain[FAR]);
    expect(look2.json?.confirmations).toMatchObject({ blue: String(LONG_TIP - FAR), unit: "blue-score" });
  });

  it("MCP-6B the node fails mid-scan (RPC error): nothing is sealed, the cursor stays on the last verified block, and the next look resumes from it → CONFIRMED", async () => {
    const F = await fakeFor("6b", LONG_TIP);
    const TX = sha("mcp-6b");
    F.accepts.set(TX, FAR);
    F.mempool.set(TX, { isOrphan: false });
    const ws = workspace("6b", F.url);
    const look1 = await status("MCP-6B-look1", ws, [TX, "--since", F.chain[1_000]!]);
    const resumeAt = 1_000 + 20 * BATCH;
    // The second look's second batch fails with the node's own "missing data" text.
    F.failVcFrom = (i) => (i === resumeAt + BATCH ? `some data is missing for block ${F.chain[i]}` : undefined);
    const look2 = await status("MCP-6B-look2", ws, [TX]);
    const afterFailure = observationsOf(ws).length;
    F.failVcFrom = undefined;
    const look3 = await status("MCP-6B-look3", ws, [TX]);
    trace("MCP-6B", { states: [look1, look2, look3].map((r) => r.json?.state), looks: [look1, look2, look3].map((r) => r.json?.look), findings: findingsOf(ws), out: [look1, look2, look3].map((r) => r.brief) });
    expect(look1.json?.state, look1.brief).toBe("MEMPOOL_ACCEPTED");
    expect(look2.json?.look?.taken, look2.brief).toBe(false);
    expect(afterFailure).toBe(1);
    expect(look3.json?.state, look3.brief).toBe("CONFIRMED");
    expect(look3.json?.derived?.acceptingBlockHash).toBe(F.chain[FAR]);
  });

  it("MCP-6C a historical mempool_entry (no window) never moves the cursor to its sink: the next look scans from a verified position (here the pruning point) and continues → CONFIRMED", async () => {
    const F = await fakeFor("6c");
    const TX = sha("mcp-6c");
    F.accepts.set(TX, DEEP); // 50 000: beyond one window from the pruning point (block 0)
    F.mempool.set(TX, { isOrphan: false });
    const ws = workspace("6c", F.url);
    const historical = createTxObservationArtifact(
      {
        networkId: "testnet-10" as any,
        mode: "rpc" as any,
        subject: { txId: TX },
        observer: {
          observerId: deriveObserverId({ kind: "rpc", target: "testnet-10", locator: "ws://historical-observer.test:17210" }),
          kind: "rpc",
          networkId: "testnet-10" as any,
          capabilities: { reorgAware: true },
          description: RPC_OBSERVER_DESCRIPTION
        } as any,
        point: { virtualDaaScore: String(DAA0 + TIP + 1), sinkHash: F.chain[TIP]!, sinkBlueScore: String(BLUE0 + TIP) },
        finding: { type: "mempool_entry", isOrphan: false },
        evidence: []
      },
      systemRuntimeContext
    ) as any;
    const dir = path.join(ws, ".hardkas", "artifacts", "observations");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `txObservation-${historical.contentHash}.json`), JSON.stringify(historical, null, 2));
    const look1 = await status("MCP-6C-look1", ws, [TX]);
    const look2 = await status("MCP-6C-look2", ws, [TX]);
    const mine = observationsOf(ws).filter((o) => o.contentHash !== historical.contentHash).sort((a, b) => (a.observedAt < b.observedAt ? -1 : 1));
    trace("MCP-6C", { states: [look1.json?.state, look2.json?.state], mine: mine.map((o) => o.finding), out: [look1.brief, look2.brief] });
    expect(mine[0]?.finding, look1.brief).toMatchObject({ type: "mempool_entry", scannedFrom: F.chain[0], scanComplete: false });
    expect(look2.json?.state, look2.brief).toBe("CONFIRMED");
    expect(look2.json?.derived?.acceptingBlockHash).toBe(F.chain[DEEP]);
  });
});
// -----------------------------------------------------------------------------
// MEMPOOL-CHAIN-PRECEDENCE-FIX-1 · integration qualification (review 2026-10-16): continuity across batch and look
// boundaries. One answer = 1 840 chain blocks; one look = 20 answers (36 800 blocks). S = the --since block.
// -----------------------------------------------------------------------------
describe("MCP-7 · continuity at pagination boundaries and after a partially received answer", () => {
  const S = 1_000;
  const LOOK = 20 * BATCH;
  const start = async (label: string, tx: string, at: number, mempool = true) => {
    const F = await fakeFor(label, 100_000);
    F.accepts.set(tx, at);
    if (mempool) F.mempool.set(tx, { isOrphan: false });
    return { F, ws: workspace(label, F.url) };
  };
  const chainLooks = (ws: string) => observationsOf(ws).sort((a, b) => (a.observedAt < b.observedAt ? -1 : 1));

  it("MCP-7A accepted by the LAST block of the first answer: found in that answer (one chain read), one observation", async () => {
    const TX = sha("mcp-7a");
    const { F, ws } = await start("7a", TX, S + BATCH);
    const r = await status("MCP-7A", ws, [TX, "--since", F.chain[S]!]);
    trace("MCP-7A", { state: r.json?.state, vcStarts: F.vcStarts.map((h) => F.chain.indexOf(h)), out: r.brief });
    expect(r.json?.state, r.brief).toBe("CONFIRMED");
    expect(r.json?.derived?.acceptingBlockHash).toBe(F.chain[S + BATCH]);
    expect(F.vcStarts).toEqual([F.chain[S]]);
    expect(observationsOf(ws)).toHaveLength(1);
  });

  it("MCP-7B accepted by the FIRST block of the second answer: the second read starts exactly at the first answer's last block", async () => {
    const TX = sha("mcp-7b");
    const { F, ws } = await start("7b", TX, S + BATCH + 1);
    const r = await status("MCP-7B", ws, [TX, "--since", F.chain[S]!]);
    trace("MCP-7B", { state: r.json?.state, vcStarts: F.vcStarts.map((h) => F.chain.indexOf(h)), out: r.brief });
    expect(r.json?.state, r.brief).toBe("CONFIRMED");
    expect(r.json?.derived?.acceptingBlockHash).toBe(F.chain[S + BATCH + 1]);
    expect(F.vcStarts).toEqual([F.chain[S], F.chain[S + BATCH]]);
  });

  it("MCP-7C accepted by the last block a look can read (S + 36 800): found by that look, not deferred", async () => {
    const TX = sha("mcp-7c");
    const { F, ws } = await start("7c", TX, S + LOOK);
    const r = await status("MCP-7C", ws, [TX, "--since", F.chain[S]!]);
    trace("MCP-7C", { state: r.json?.state, reads: F.vcStarts.length, out: r.brief });
    expect(r.json?.state, r.brief).toBe("CONFIRMED");
    expect(r.json?.derived?.acceptingBlockHash).toBe(F.chain[S + LOOK]);
    expect(F.vcStarts).toHaveLength(20);
  });

  it("MCP-7D accepted one block past a look's window (stale mempool): the window is recorded incomplete, the next look starts exactly at its scannedTo, finds it once; later looks keep the same block", async () => {
    const TX = sha("mcp-7d");
    const { F, ws } = await start("7d", TX, S + LOOK + 1);
    const look1 = await status("MCP-7D-look1", ws, [TX, "--since", F.chain[S]!]);
    const w = chainLooks(ws)[0]?.finding;
    const readsBefore = F.vcStarts.length;
    const look2 = await status("MCP-7D-look2", ws, [TX]);
    const look2FirstRead = F.vcStarts[readsBefore];
    const look3 = await status("MCP-7D-look3", ws, [TX]);
    const all = chainLooks(ws);
    trace("MCP-7D", { states: [look1, look2, look3].map((r) => r.json?.state), window: w, look2FirstRead: F.chain.indexOf(look2FirstRead!), findings: all.map((o) => o.finding), out: [look1, look2, look3].map((r) => r.brief) });
    expect(look1.json?.state, look1.brief).toBe("MEMPOOL_ACCEPTED");
    expect(w).toMatchObject({ type: "mempool_entry", scannedFrom: F.chain[S], scannedTo: F.chain[S + LOOK], scannedChainBlocks: LOOK, scanComplete: false });
    // scanComplete=false is never read as "absent up to the sink": the next look continues from scannedTo, not the sink.
    expect(look2FirstRead).toBe(F.chain[S + LOOK]);
    expect(look2.json?.state, look2.brief).toBe("CONFIRMED");
    expect(look2.json?.derived?.acceptingBlockHash).toBe(F.chain[S + LOOK + 1]);
    expect(look3.json?.derived?.acceptingBlockHash).toBe(F.chain[S + LOOK + 1]);
    // One observation per look taken, each its own artifact; the acceptance is one block, not two.
    expect(all).toHaveLength(3);
    expect(new Set(all.map((o) => o.contentHash)).size).toBe(3);
    expect(new Set(all.filter((o) => o.finding.type === "chain_accepted").map((o) => o.finding.acceptingBlockHash))).toEqual(new Set([F.chain[S + LOOK + 1]]));
  });

  it("MCP-7E the same boundary without a mempool entry (not_found window): the next look starts at scannedTo and finds it", async () => {
    const TX = sha("mcp-7e");
    const { F, ws } = await start("7e", TX, S + LOOK + 1, false);
    const look1 = await status("MCP-7E-look1", ws, [TX, "--since", F.chain[S]!]);
    const readsBefore = F.vcStarts.length;
    const look2 = await status("MCP-7E-look2", ws, [TX]);
    trace("MCP-7E", { states: [look1.json?.state, look2.json?.state], findings: chainLooks(ws).map((o) => o.finding), out: [look1.brief, look2.brief] });
    expect(chainLooks(ws)[0]?.finding).toMatchObject({ type: "not_found", scannedTo: F.chain[S + LOOK] });
    expect(F.vcStarts[readsBefore]).toBe(F.chain[S + LOOK]);
    expect(look2.json?.state, look2.brief).toBe("CONFIRMED");
  });

  it("MCP-7F the connection drops after HALF of an answer arrived: nothing is sealed, the cursor stays at the last fully read block, the next look re-reads that answer and finds the tx at its first block", async () => {
    const TX = sha("mcp-7f");
    const { F, ws } = await start("7f", TX, S + LOOK + BATCH + 1); // first block of look 2's second answer
    const look1 = await status("MCP-7F-look1", ws, [TX, "--since", F.chain[S]!]);
    F.truncateVcFrom = (i) => i === S + LOOK + BATCH;
    const look2 = await status("MCP-7F-look2", ws, [TX]);
    const afterDrop = chainLooks(ws).length;
    F.truncateVcFrom = undefined;
    const readsBefore = F.vcStarts.length;
    const look3 = await status("MCP-7F-look3", ws, [TX]);
    trace("MCP-7F", { states: [look1, look2, look3].map((r) => r.json?.state), looks: [look1, look2, look3].map((r) => r.json?.look), look3FirstRead: F.chain.indexOf(F.vcStarts[readsBefore]!), findings: chainLooks(ws).map((o) => o.finding), out: [look1, look2, look3].map((r) => r.brief) });
    expect(look1.json?.state, look1.brief).toBe("MEMPOOL_ACCEPTED");
    expect(look2.json?.look?.taken, look2.brief).toBe(false);
    expect(afterDrop).toBe(1);
    expect(F.vcStarts[readsBefore]).toBe(F.chain[S + LOOK]);
    expect(look3.json?.state, look3.brief).toBe("CONFIRMED");
    expect(look3.json?.derived?.acceptingBlockHash).toBe(F.chain[S + LOOK + BATCH + 1]);
    expect(chainLooks(ws)).toHaveLength(2);
  });

  it("MCP-7G an answer whose acceptance data covers only part of its added blocks (non-conformant node): the tx accepted in the uncovered part is not skipped", async () => {
    const TX = sha("mcp-7g");
    const { F, ws } = await start("7g", TX, S + 1_200); // inside the first answer, past its covered prefix
    F.acceptedPrefixFrom = (i) => (i === S ? 1_000 : undefined); // blocks S+1 … S+1000 covered, S+1001 … S+1840 not
    const look1 = await status("MCP-7G-look1", ws, [TX, "--since", F.chain[S]!]);
    F.acceptedPrefixFrom = undefined;
    const look2 = await status("MCP-7G-look2", ws, [TX]);
    trace("MCP-7G", { states: [look1.json?.state, look2.json?.state], looks: [look1.json?.look, look2.json?.look], vcStarts: F.vcStarts.map((h) => F.chain.indexOf(h)), findings: chainLooks(ws).map((o) => o.finding), out: [look1.brief, look2.brief] });
    // MCP-7G-FIX (review 2026-10-16): the incoherent answer is rejected whole — no finding, no window, no cursor.
    expect(look1.json?.look?.taken, look1.brief).toBe(false);
    expect(look1.json?.look?.reason ?? "").toMatch(/OBSERVE_CHAIN_ANSWER_INCOHERENT/);
    expect(chainLooks(ws).filter((o) => o.subject.txId === TX)).toHaveLength(1);
    expect(look2.json?.state, look2.brief).toBe("CONFIRMED");
    expect(look2.json?.derived?.acceptingBlockHash).toBe(F.chain[S + 1_200]);
  });
});
describe("MCP-8 · a structurally incoherent chain answer establishes nothing (MCP-7G-FIX)", () => {
  const S = 1_000;
  const LOOK = 20 * BATCH;
  const looksOf = (ws: string) => observationsOf(ws).sort((a, b) => (a.observedAt < b.observedAt ? -1 : 1));

  it("MCP-8A incoherent answer while re-checking the previous accepting block (A left the chain, B re-accepts in the uncovered part): no REORGED, nothing sealed; after recovery → ACCEPTED by B", async () => {
    const F = await fakeFor("8a");
    const TX = sha("mcp-8a");
    F.accepts.set(TX, SHALLOW);
    const ws = workspace("8a", F.url);
    const look1 = await status("MCP-8A-look1", ws, [TX, "--since", F.chain[SHALLOW - 100]!]);
    const at = SHALLOW - 5;
    F.fork(at, "churn-incoherent", [[TX, at + 2]]);
    // The answer from the removed block A starts at the common ancestor (index at − 1); it lists every added block but
    // acceptance data only for the first one, so B (at + 2) is uncovered.
    F.acceptedPrefixFrom = (i) => (i === at - 1 ? 1 : undefined);
    const look2 = await status("MCP-8A-look2", ws, [TX]);
    const afterIncoherent = looksOf(ws).length;
    F.acceptedPrefixFrom = undefined;
    const look3 = await status("MCP-8A-look3", ws, [TX]);
    trace("MCP-8A", { states: [look1, look2, look3].map((r) => r.json?.state), looks: [look1, look2, look3].map((r) => r.json?.look), findings: looksOf(ws).map((o) => o.finding), out: [look1, look2, look3].map((r) => r.brief) });
    expect(look1.json?.state, look1.brief).toBe("ACCEPTED");
    expect(look2.json?.look?.taken, look2.brief).toBe(false);
    expect(look2.json?.look?.reason ?? "").toMatch(/OBSERVE_CHAIN_ANSWER_INCOHERENT/);
    expect(look2.json?.state, look2.brief).not.toBe("REORGED");
    expect(afterIncoherent).toBe(1);
    expect(look3.json?.state, look3.brief).toBe("ACCEPTED");
    expect(look3.json?.derived?.acceptingBlockHash).toBe(F.chain[at + 2]);
    expect(looksOf(ws).map((o) => o.finding.type)).not.toContain("chain_removed");
  });

  it("MCP-8B retry after recovery: a look whose answer is incomplete seals nothing and keeps the last verified cursor; the recovered node is re-read from it → CONFIRMED", async () => {
    const F = await fakeFor("8b", 100_000);
    const TX = sha("mcp-8b");
    F.accepts.set(TX, S + LOOK + 500); // inside the first answer of look 2
    F.mempool.set(TX, { isOrphan: false });
    const ws = workspace("8b", F.url);
    const look1 = await status("MCP-8B-look1", ws, [TX, "--since", F.chain[S]!]);
    F.acceptedPrefixFrom = (i) => (i === S + LOOK ? 100 : undefined);
    const look2 = await status("MCP-8B-look2", ws, [TX]);
    const afterIncomplete = looksOf(ws).length;
    F.acceptedPrefixFrom = undefined;
    const readsBefore = F.vcStarts.length;
    const look3 = await status("MCP-8B-look3", ws, [TX]);
    trace("MCP-8B", { states: [look1, look2, look3].map((r) => r.json?.state), looks: [look1, look2, look3].map((r) => r.json?.look), look3FirstRead: F.chain.indexOf(F.vcStarts[readsBefore]!), findings: looksOf(ws).map((o) => o.finding), out: [look1, look2, look3].map((r) => r.brief) });
    expect(look1.json?.state, look1.brief).toBe("MEMPOOL_ACCEPTED");
    expect(look2.json?.look?.taken, look2.brief).toBe(false);
    expect(look2.json?.look?.reason ?? "").toMatch(/OBSERVE_CHAIN_ANSWER_INCOHERENT/);
    expect(afterIncomplete).toBe(1);
    expect(F.vcStarts[readsBefore]).toBe(F.chain[S + LOOK]);
    expect(look3.json?.state, look3.brief).toBe("CONFIRMED");
    expect(look3.json?.derived?.acceptingBlockHash).toBe(F.chain[S + LOOK + 500]);
  });

  it("MCP-8C a complete but misaligned answer (acceptance entries swapped) is rejected whole: no acceptance taken from it, nothing sealed", async () => {
    const F = await fakeFor("8c");
    const TX = sha("mcp-8c");
    F.accepts.set(TX, DEEP);
    const ws = workspace("8c", F.url);
    F.scrambleFrom = (i) => i === DEEP - 100;
    const look1 = await status("MCP-8C-look1", ws, [TX, "--since", F.chain[DEEP - 100]!]);
    F.scrambleFrom = undefined;
    const look2 = await status("MCP-8C-look2", ws, [TX, "--since", F.chain[DEEP - 100]!]);
    trace("MCP-8C", { states: [look1.json?.state, look2.json?.state], looks: [look1.json?.look, look2.json?.look], findings: looksOf(ws).map((o) => o.finding), out: [look1.brief, look2.brief] });
    expect(look1.json?.look?.taken, look1.brief).toBe(false);
    expect(look1.json?.look?.reason ?? "").toMatch(/OBSERVE_CHAIN_ANSWER_INCOHERENT/);
    expect(look1.json?.state).toBe("INSUFFICIENT_EVIDENCE");
    expect(look2.json?.state, look2.brief).toBe("CONFIRMED");
    expect(looksOf(ws)).toHaveLength(1);
  });
});