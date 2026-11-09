import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { verifyArtifactOnNetwork, type ArtifactNetworkSubject } from "../src/artifact-network-verify.js";

// RC1-R2 · the SDK side of `artifact verify` for a transaction the node cannot show (see the CLI file
// rc1-r2-artifact-unobservable.test.ts for records with outputs). A submission names no output and carries its own cursor
// (the submit point): when that cursor is pruned the look restarts from the node's pruning point, and a miss there is a
// limitation of this node (NOT_OBSERVABLE_HERE), never "not found". Absence stays NOT_FOUND only when the window is
// complete from a start that precedes any acceptance. In-process scripted node; nothing is sent.

const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const BLUE0 = 1_000_000;
const DAA0 = 3_000_000;

interface ChainOptions {
  tip?: number;
  pruningAt?: number;
  accepted?: Record<string, number>;
  /** Chain block hashes the node answers "cannot find header" for (pruned), or "block not found". */
  unknownStart?: { hash: string; answer: "cannot find header" | "block not found" };
  utxosFail?: boolean;
}

function scriptedNode(label: string, o: ChainOptions = {}) {
  const tip = o.tip ?? 400;
  const pruningAt = o.pruningAt ?? 0;
  const hashOf = (i: number) => sha(`r2s-${label}-${i}`);
  const index = new Map<string, number>();
  for (let i = 0; i <= tip; i++) index.set(hashOf(i), i);
  const acceptedAt = new Map<number, string[]>();
  for (const [tx, at] of Object.entries(o.accepted ?? {})) acceptedAt.set(at, [...(acceptedAt.get(at) ?? []), tx]);
  const calls: string[] = [];
  const client: any = {
    async call(method: string, params: any) {
      calls.push(method);
      switch (method) {
        case "getBlockDagInfo":
          return { network: "testnet-10", virtualDaaScore: DAA0 + 2 * tip + 1, sink: hashOf(tip), pruningPointHash: hashOf(pruningAt) };
        case "getMempoolEntry":
          throw new Error(`Transaction ${params?.transactionId} not found`);
        case "getVirtualChainFromBlock": {
          if (o.unknownStart && params?.startHash === o.unknownStart.hash) throw new Error(`${o.unknownStart.answer} ${params.startHash}`);
          const i = index.get(params?.startHash);
          if (i === undefined) throw new Error(`cannot find header ${params?.startHash}`);
          const added: string[] = [];
          const accepted: unknown[] = [];
          for (let j = i + 1; j <= tip; j++) {
            added.push(hashOf(j));
            accepted.push({ acceptingBlockHash: hashOf(j), acceptedTransactionIds: [sha(`cb-${j}`), ...(acceptedAt.get(j) ?? [])] });
          }
          return { removedChainBlockHashes: [], addedChainBlockHashes: added, acceptedTransactionIds: accepted };
        }
        case "getBlock": {
          const i = index.get(params?.hash);
          if (i === undefined) throw new Error(`cannot find header ${params?.hash}`);
          return { block: { header: { hash: hashOf(i), parentsByLevel: i > 0 ? [[hashOf(i - 1)]] : [], blueScore: BLUE0 + i, daaScore: DAA0 + 2 * i } } };
        }
        default:
          throw new Error(`scripted node does not implement ${method}`);
      }
    },
    async getServerInfo() {
      calls.push("getServerInfo");
      return { networkId: "testnet-10", serverVersion: "2.1.0", isSynced: true };
    },
    async getSinkBlueScore() {
      calls.push("getSinkBlueScore");
      return { blueScore: BLUE0 + tip };
    },
    async getUtxosByAddresses() {
      calls.push("getUtxosByAddresses");
      if (o.utxosFail) throw new Error("utxoindex disabled");
      return { entries: [] };
    }
  };
  return { client, hashOf, calls };
}

const node: any = {
  schema: "hardkas.networkIdentity.v1",
  family: "testnet",
  networkId: "testnet-10",
  observedNetworkId: "testnet-10",
  endpoint: "ws://127.0.0.1:1",
  nodeType: "rusty-kaspad",
  evidence: { kind: "endpoint", serverVersion: "2.1.0" },
  sync: "synced",
  trust: "node-endpoint",
  problems: []
};

const submission = (txId: string, since: string): ArtifactNetworkSubject => ({
  schema: "hardkas.txSubmission.v1",
  networkId: "testnet-10",
  family: "testnet",
  txId,
  simulated: false,
  outputs: [],
  since
});

describe("RC1-R2 · verifyArtifactOnNetwork: what a node cannot show is NOT_OBSERVABLE_HERE", () => {
  it("S-1 an old submission whose submit point is pruned (cannot find header) and that names no output: NOT_OBSERVABLE_HERE", async () => {
    const txId = sha("s1-tx");
    const n = scriptedNode("s1", { tip: 500, pruningAt: 300, accepted: { [txId]: 100 } });
    const r = await verifyArtifactOnNetwork({ subject: submission(txId, sha("s1-pruned-submit-point")), client: n.client, node });
    expect(r.network).toMatchObject({ level: "NOT_OBSERVED", reason: "NOT_OBSERVABLE_HERE" });
    expect(r.network.causes).toEqual(expect.arrayContaining(["CURSOR_NOT_SERVED", "PRUNED_HISTORY", "NO_OUTPUTS_NAMED"]));
    expect(r.network.window).toMatchObject({ fromKind: "pruning-point", from: n.hashOf(300), reachedTip: true, fromGenesis: false });
    expect(r.network.message).toMatch(/not evidence that the transaction does not exist/);
    expect(r.consensus).toMatchObject({ level: "NOT_CONFIRMED", reason: "NOT_OBSERVABLE_HERE" });
  });

  it("S-2 a node that answers the submit point with 'block not found' (sealed, not thrown): the look restarts from the pruning point, and the miss is a limitation", async () => {
    const txId = sha("s2-tx");
    const start = sha("s2-gone");
    const n = scriptedNode("s2", { tip: 500, pruningAt: 300, unknownStart: { hash: start, answer: "block not found" } });
    const r = await verifyArtifactOnNetwork({ subject: submission(txId, start), client: n.client, node });
    expect(r.network).toMatchObject({ level: "NOT_OBSERVED", reason: "NOT_OBSERVABLE_HERE" });
    expect(r.network.causes).toEqual(expect.arrayContaining(["CURSOR_NOT_SERVED", "NO_OUTPUTS_NAMED"]));
  });

  it("S-3 (absence established) the submit point is served and the whole window to the tip holds no acceptance: NOT_FOUND, from the artifact's own cursor", async () => {
    const n = scriptedNode("s3", { tip: 400, pruningAt: 200 });
    const r = await verifyArtifactOnNetwork({ subject: submission(sha("s3-tx"), n.hashOf(250)), client: n.client, node });
    expect(r.network).toMatchObject({ level: "NOT_OBSERVED", reason: "NOT_FOUND", window: { fromKind: "artifact", from: n.hashOf(250), reachedTip: true } });
    expect(r.network.causes).toBeUndefined();
    expect(r.network.message).toMatch(/from the artifact's own submit point to the node's tip/);
  });

  it("S-4 (control) an acceptance in the window of the served submit point is found: NETWORK_OBSERVED", async () => {
    const txId = sha("s4-tx");
    const n = scriptedNode("s4", { tip: 400, pruningAt: 200, accepted: { [txId]: 260 } });
    const r = await verifyArtifactOnNetwork({ subject: submission(txId, n.hashOf(250)), client: n.client, node });
    expect(r.network).toMatchObject({ level: "NETWORK_OBSERVED", observation: { source: "virtual-chain", acceptingBlockHash: n.hashOf(260) } });
    expect(r.consensus.level).toBe("CONSENSUS_CONFIRMED");
  });

  it("S-5 a record with outputs whose UTXO lookup fails: UTXO_LOOKUP_FAILED, not 'spent'", async () => {
    const txId = sha("s5-tx");
    const n = scriptedNode("s5", { tip: 500, pruningAt: 300, utxosFail: true });
    const subject: ArtifactNetworkSubject = { schema: "hardkas.signedTx", networkId: "testnet-10", family: "testnet", txId, simulated: false, outputs: [{ address: "kaspatest:x", transactionId: txId }] };
    const r = await verifyArtifactOnNetwork({ subject, client: n.client, node });
    expect(r.network.reason).toBe("NOT_OBSERVABLE_HERE");
    expect(r.network.causes).toEqual(expect.arrayContaining(["PRUNED_HISTORY", "UTXO_LOOKUP_FAILED"]));
    expect(r.network.causes).not.toContain("OUTPUTS_SPENT_OR_ABSENT");
  });

  it("S-7 a complete window from the genesis, but on a node that is not synced: NOT_OBSERVABLE_HERE (NODE_NOT_SYNCED), never NOT_FOUND", async () => {
    const n = scriptedNode("s7", { tip: 50, pruningAt: 0 });
    const subject: ArtifactNetworkSubject = { schema: "hardkas.signedTx", networkId: "testnet-10", family: "testnet", txId: sha("s7-tx"), simulated: false, outputs: [{ address: "kaspatest:x", transactionId: sha("s7-tx") }] };
    const r = await verifyArtifactOnNetwork({ subject, client: n.client, node: { ...node, sync: "not-synced" } });
    expect(r.network).toMatchObject({ level: "NOT_OBSERVED", reason: "NOT_OBSERVABLE_HERE", window: { fromGenesis: true, reachedTip: true } });
    expect(r.network.causes?.[0]).toBe("NODE_NOT_SYNCED");
    expect(r.network.message).toMatch(/says it is not synced/);
  });

  it("S-6 nothing is ever sent", async () => {
    const n = scriptedNode("s6", { tip: 300, pruningAt: 100 });
    await verifyArtifactOnNetwork({ subject: submission(sha("s6-tx"), sha("s6-gone")), client: n.client, node });
    expect(n.calls.filter((c) => /submit/i.test(c))).toEqual([]);
  });
});
