import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import type { AddressInfo } from "node:net";
import { WebSocketServer } from "ws";
import { cliDist } from "../first-contact-helpers.js";
import { hermeticChildEnv } from "../hermetic-child.js";

// INT9-A · a loopback wRPC (JSON) fake of a rusty-kaspad 2.1.0 node, in the official wire shapes, that can be told to
// lie: about its network, its version or its sync state, or with an incoherent virtual-chain answer. The chain is a
// line of blocks hashOf(0..tip); blue score BLUE0 + i, DAA score DAA0 + 2i (DAA grows faster than blue, as on a real
// DAG); the pruning point is hashOf(pruningAt).

export interface FakeNodeOptions {
  readonly network: string;
  readonly serverVersion?: string;
  /** `undefined` omits the field from getServerInfo. */
  readonly isSynced?: boolean | undefined;
  readonly tip?: number;
  readonly pruningAt?: number;
  /** txid → the chain block index that accepts it. */
  readonly accepted?: Readonly<Record<string, number>>;
  readonly mempool?: readonly string[];
  readonly utxos?: ReadonlyArray<{ address: string; transactionId: string; index: number; amount: string; blockDaaScore: string }>;
  /** getVirtualChainFromBlock names acceptance data for the wrong blocks (rejected whole by the observer). */
  readonly incoherentChain?: boolean;
  /** RC1-R2: chain blocks per getVirtualChainFromBlock answer (default 2000), to bound what one look can read. */
  readonly chainBatch?: number;
}

export interface FakeNode {
  readonly url: string;
  readonly port: number;
  readonly methods: string[];
  hashOf(i: number): string;
  blue(i: number): number;
  daa(i: number): number;
  close(): Promise<void>;
}

export const BLUE0 = 1_000_000;
export const DAA0 = 3_000_000;
const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

export async function startFakeNode(label: string, opts: FakeNodeOptions): Promise<FakeNode> {
  const tip = opts.tip ?? 400;
  const hashOf = (i: number) => sha(`int9a-${label}-${i}`);
  const blue = (i: number) => BLUE0 + i;
  const daa = (i: number) => DAA0 + 2 * i;
  const index = new Map<string, number>();
  for (let i = 0; i <= tip; i++) index.set(hashOf(i), i);
  const pruningAt = opts.pruningAt ?? 0;
  const acceptedAt = new Map<number, string[]>();
  for (const [txid, at] of Object.entries(opts.accepted ?? {})) acceptedAt.set(at, [...(acceptedAt.get(at) ?? []), txid]);
  const methods: string[] = [];
  const zero = "0".repeat(64);
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise<void>((r, j) => {
    server.on("listening", () => r());
    server.on("error", j);
  });
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
      const err = (message: string) => socket.send(`{"id":${id},"error":{"code":0,"message":${JSON.stringify(message)},"data":null}}`);
      switch (method) {
        case "getServerInfo":
          return ok({
            rpcApiVersion: 1,
            rpcApiRevision: 0,
            serverVersion: opts.serverVersion ?? "2.1.0",
            networkId: opts.network,
            hasUtxoIndex: true,
            ...(opts.isSynced === undefined && "isSynced" in opts ? {} : { isSynced: opts.isSynced ?? true }),
            virtualDaaScore: daa(tip) + 1
          });
        case "getInfo":
          return ok({ p2pId: label, mempoolSize: 0, serverVersion: opts.serverVersion ?? "2.1.0", isUtxoIndexed: true, isSynced: opts.isSynced ?? true, hasNotifyCommand: true, hasMessageId: true });
        case "getBlockDagInfo":
          return ok({
            network: opts.network,
            blockCount: tip + 1,
            headerCount: tip + 1,
            tipHashes: [hashOf(tip)],
            difficulty: 1,
            pastMedianTime: 1792088193138 + tip * 100,
            virtualParentHashes: [hashOf(tip)],
            pruningPointHash: hashOf(pruningAt),
            virtualDaaScore: daa(tip) + 1,
            sink: hashOf(tip)
          });
        case "getSinkBlueScore":
          return ok({ blueScore: blue(tip) });
        case "getMempoolEntry":
          // exactly the kaspad 2.1.0 JSON wRPC shape (captured read-only on TN10 by mempool-chain-precedence-1)
          if ((opts.mempool ?? []).includes(params?.transactionId)) {
            return ok({
              mempoolEntry: {
                fee: 2036,
                is_orphan: false,
                transaction: {
                  gas: 0,
                  inputs: [],
                  lockTime: 0,
                  mass: 0,
                  outputs: [],
                  payload: "",
                  storageMass: 0,
                  subnetworkId: "0".repeat(40),
                  verboseData: { blockHash: zero, blockTime: 0, computeMass: 2036, hash: sha(`h-${params.transactionId}`), transactionId: params.transactionId },
                  version: 0
                }
              }
            });
          }
          return err(`Transaction ${params?.transactionId} not found`);
        case "getUtxosByAddresses": {
          const entries = (opts.utxos ?? [])
            .filter((u) => (params?.addresses ?? []).includes(u.address))
            .map((u) => ({
              address: u.address,
              outpoint: { transactionId: u.transactionId, index: u.index },
              utxoEntry: { amount: Number(u.amount), blockDaaScore: Number(u.blockDaaScore), covenantId: null, isCoinbase: false, scriptPublicKey: "0000" }
            }));
          return ok({ entries });
        }
        case "getBlock": {
          const i = index.get(params?.hash);
          if (i === undefined) return err(`cannot find header ${params?.hash}`);
          return ok({
            block: {
              header: {
                hash: hashOf(i),
                version: 1,
                parentsByLevel: i > 0 ? [[hashOf(i - 1)]] : [],
                hashMerkleRoot: zero,
                acceptedIdMerkleRoot: zero,
                utxoCommitment: zero,
                timestamp: 1792088193138 + i * 100,
                bits: 486722099,
                nonce: 0,
                daaScore: daa(i),
                blueWork: (blue(i) * 1000).toString(16),
                blueScore: blue(i),
                pruningPoint: hashOf(pruningAt)
              },
              transactions: [],
              verboseData: {
                hash: hashOf(i),
                difficulty: 1,
                selectedParentHash: i > 0 ? hashOf(i - 1) : zero,
                transactionIds: [],
                isHeaderOnly: false,
                blueScore: blue(i),
                childrenHashes: i < tip ? [hashOf(i + 1)] : [],
                mergeSetBluesHashes: [],
                mergeSetRedsHashes: [],
                isChainBlock: true
              }
            }
          });
        }
        case "getVirtualChainFromBlock": {
          const i = index.get(params?.startHash);
          if (i === undefined) return err(`cannot find header ${params?.startHash}`);
          const added: string[] = [];
          const acceptedIds: unknown[] = [];
          for (let j = i + 1; j <= Math.min(i + (opts.chainBatch ?? 2000), tip); j++) {
            added.push(hashOf(j));
            acceptedIds.push({ acceptingBlockHash: opts.incoherentChain ? hashOf(j + 1) : hashOf(j), acceptedTransactionIds: [sha(`cb-${j}`), ...(acceptedAt.get(j) ?? [])] });
          }
          return ok({ removedChainBlockHashes: [], addedChainBlockHashes: added, acceptedTransactionIds: params?.includeAcceptedTransactionIds ? acceptedIds : [] });
        }
        default:
          return err(`fake ${label} does not implement ${method}`);
      }
    });
  });
  const port = (server.address() as AddressInfo).port;
  return {
    url: `ws://127.0.0.1:${port}`,
    port,
    methods,
    hashOf,
    blue,
    daa,
    close: () =>
      new Promise<void>((r) => {
        for (const c of server.clients) c.terminate();
        server.close(() => r());
      })
  };
}

export const CANONICAL_PORTS = "16110,16210,17110,17210,18110,18210,18211";

/** Runs the built CLI asynchronously (the fakes live in this process) under the hermetic preload; logs every dial. */
export async function runCli(logs: string, name: string, args: string[], cwd: string, env: Record<string, string> = {}) {
  const log = path.join(logs, `${name}.net.log`);
  const r = await new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, [cliDist, ...args], {
      cwd,
      env: hermeticChildEnv(log, { HARDKAS_HERMETIC_DENY_PORTS: CANONICAL_PORTS, DOCKER_HOST: "tcp://127.0.0.1:9", ...env }),
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill(), 150_000);
    child.stdout.on("data", (d) => (stdout += String(d)));
    child.stderr.on("data", (d) => (stderr += String(d)));
    child.on("close", (status) => {
      clearTimeout(timer);
      resolve({ status, stdout, stderr });
    });
  });
  const dialled = fs.existsSync(log) ? fs.readFileSync(log, "utf8").split(/\r?\n/).filter(Boolean).map((l) => l.split("\t").slice(1, 3).join(" ")) : [];
  let json: any;
  try {
    json = JSON.parse((r.stdout ?? "").trim());
  } catch {
    json = undefined;
  }
  const all = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
  const code = json?.code ?? json?.error?.code ?? /\b([A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+)\b/.exec(r.stderr ?? "")?.[1];
  return { status: r.status, json, code, dialled, all, brief: `exit ${r.status}\n${all.slice(0, 2500)}\n${JSON.stringify(dialled)}` };
}

export function tempDir(prefix: string, made: string[]): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  made.push(d);
  return d;
}
